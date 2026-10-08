// options.js

//

// 设置页逻辑。职责：

// 1) 从 chrome.storage.local 读取当前配置并填充表单

// 2) 保存表单到 chrome.storage.local

// 3) 通知 service worker 配置已更新（MSG.CONFIG_UPDATED）

// 4) 显示原生宿主连接状态

//

// 所有 storage key / 字段名从 __AIC_CONTRACT__ 读取。

(function () {

  const contract = globalThis.__AIC_CONTRACT__;

  if (!contract) {

    console.error("[agentao] __AIC_CONTRACT__ not found");

    return;

  }

  const MSG = contract.messages;

  const P = contract.provider;

  const F = P.FIELDS;

  const M = contract.mcp;

  const MF = M.FIELDS;

  // ── DOM 引用 ─────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  const els = {

    name: $("provider-name"),

    format: $("provider-format"),

    baseUrl: $("provider-base-url"),

    apiKey: $("provider-api-key"),

    model: $("provider-model"),

    vision: $("provider-vision"),

    temperature: $("provider-temperature"),

    maxTokens: $("provider-max-tokens"),

    providerSave: $("provider-save"),

     providerFetchModels: $("provider-fetch-models"),

     providerModelSelect: $("provider-model-select"),

    providerStatus: $("provider-status"),

    permissionMode: $("runtime-permission-mode"),

    workingDirectory: $("runtime-working-directory"),

    runtimeSave: $("runtime-save"),

    theme: $("ui-theme"),

    locale: $("ui-locale"),

    uiSave: $("ui-save"),

    hostStatus: $("host-status"),

    hostStatusText: $("host-status-text"),

    // MCP 服务器

    mcpList: $("mcp-server-list"),

    mcpAdd: $("mcp-add"),

    mcpEditor: $("mcp-editor"),

    mcpName: $("mcp-name"),

    mcpType: $("mcp-type"),

    mcpUrl: $("mcp-url"),

    mcpUrlField: $("mcp-url-field"),

    mcpHeaders: $("mcp-headers"),

    mcpHeadersField: $("mcp-headers-field"),

    mcpCommand: $("mcp-command"),

    mcpCommandField: $("mcp-command-field"),

    mcpArgs: $("mcp-args"),

    mcpArgsField: $("mcp-args-field"),

    mcpTimeout: $("mcp-timeout"),

    mcpTrust: $("mcp-trust"),

    mcpEnabled: $("mcp-enabled"),

    mcpTest: $("mcp-test"),

    mcpSave: $("mcp-save"),

    mcpCancel: $("mcp-cancel"),

    mcpEditorStatus: $("mcp-editor-status"),

    mcpRuntimeStatus: $("mcp-runtime-status"),

  };

  // ── MCP 本地状态 ─────────────────────────────────────────

  let mcpServers = [];        // chrome.storage 中的服务器条目

  let mcpEditingIndex = -1;   // -1 = 新增；>=0 = 编辑现有条目

  const mcpRuntimeStatuses = new Map(); // name -> { status, tools }（宿主回报）

  // ── 加载当前配置 ─────────────────────────────────────────

  async function loadConfig() {

    const keys = [

      P.STORAGE_KEY,

      P.ACTIVE_PROFILE_STORAGE_KEY,

      P.PROFILES_STORAGE_KEY,

      contract.permission.MODE_STORAGE_KEY,

      contract.session.WORKING_DIRECTORY_STORAGE_KEY,

      contract.ui.THEME_STORAGE_KEY,

      contract.ui.PREFERRED_LOCALE_STORAGE_KEY,

    ];

    const stored = await chrome.storage.local.get(keys);

    // 供应商配置

    const profiles = stored[P.PROFILES_STORAGE_KEY] || [];

    const activeProfileId = stored[P.ACTIVE_PROFILE_STORAGE_KEY];

    const activeProfile =

      profiles.find((p) => p[F.ID] === activeProfileId) || profiles[0] || {};

    els.name.value = activeProfile[F.NAME] || "";

    els.format.value = activeProfile[F.FORMAT] || "openai";

    els.baseUrl.value = activeProfile[F.BASE_URL] || "";

    els.apiKey.value = activeProfile[F.API_KEY] || "";

    els.model.value = activeProfile[F.MODEL] || "";

    els.vision.checked = activeProfile[F.VISION] === true;

    els.temperature.value =

      activeProfile[F.TEMPERATURE] != null ? activeProfile[F.TEMPERATURE] : "";

    els.maxTokens.value =

      activeProfile[F.MAX_TOKENS] != null ? activeProfile[F.MAX_TOKENS] : "";

    // 运行时

    els.permissionMode.value =

      stored[contract.permission.MODE_STORAGE_KEY] ||

      contract.permission.MODES.WORKSPACE_WRITE;

    els.workingDirectory.value =

      stored[contract.session.WORKING_DIRECTORY_STORAGE_KEY] || "";

    // 界面

    els.theme.value = stored[contract.ui.THEME_STORAGE_KEY] || "auto";

    els.locale.value = stored[contract.ui.PREFERRED_LOCALE_STORAGE_KEY] || "en";

  }

  // ── 保存供应商配置 ───────────────────────────────────────

  async function saveProvider() {

    const profileId =

      (await getActiveProfileId()) || `profile-${Date.now()}`;

    const profile = {

      [F.ID]: profileId,

      [F.NAME]: els.name.value.trim() || "Default",

      [F.FORMAT]: els.format.value,

      [F.BASE_URL]: els.baseUrl.value.trim(),

      [F.API_KEY]: els.apiKey.value.trim(),

      [F.MODEL]: els.model.value.trim(),

      [F.VISION]: els.vision.checked,

      [F.TEMPERATURE]: els.temperature.value

        ? parseFloat(els.temperature.value)

        : null,

      [F.MAX_TOKENS]: els.maxTokens.value

        ? parseInt(els.maxTokens.value, 10)

        : null,

    };

    const stored = await chrome.storage.local.get([P.PROFILES_STORAGE_KEY]);

    const profiles = stored[P.PROFILES_STORAGE_KEY] || [];

    const idx = profiles.findIndex((p) => p[F.ID] === profileId);

    if (idx >= 0) {

      profiles[idx] = profile;

    } else {

      profiles.push(profile);

    }

    // ── Connection validation (reuse fetchModels' pattern) ──
    // Verify the Base URL is reachable before saving, so the UI does not
    // show "connected" while the model is actually uncallable.
    {
      const _baseUrl = els.baseUrl.value.trim();
      const _apiKey = els.apiKey.value.trim();
      if (!_baseUrl || !_apiKey) {
        showStatus(els.providerStatus, "Base URL and API Key are required.", "error");
        return;
      }
      showStatus(els.providerStatus, "Validating connection...", "");
      try {
        const _url = _baseUrl.replace(/\/$/, "") + "/models";
        const _resp = await fetch(_url, {
          method: "GET",
          headers: { Authorization: `Bearer ${_apiKey}` },
        });
        if (!_resp.ok) {
          let _detail = `${_resp.status} ${_resp.statusText}`;
          try {
            const _body = await _resp.json();
            const _apiMsg = _body?.error?.message || _body?.message || _body?.error;
            if (_apiMsg) _detail += ` — ${_apiMsg}`;
          } catch {}
          showStatus(els.providerStatus, `Connection failed: HTTP ${_detail}`, "error");
          return;
        }
      } catch (err) {
        showStatus(els.providerStatus, `Connection failed: ${err.message}`, "error");
        return;
      }
    }

    await chrome.storage.local.set({

      [P.PROFILES_STORAGE_KEY]: profiles,

      [P.ACTIVE_PROFILE_STORAGE_KEY]: profileId,

      [P.STORAGE_KEY]: profile, // 兼容旧路径：单 profile 快照

    });

    showStatus(els.providerStatus, "Saved.", "ok");

    notifyConfigUpdated();

  }

  async function getActiveProfileId() {

    const stored = await chrome.storage.local.get([P.ACTIVE_PROFILE_STORAGE_KEY]);

    return stored[P.ACTIVE_PROFILE_STORAGE_KEY];

  }

  // ── 保存运行时配置 ───────────────────────────────────────

  async function saveRuntime() {

    await chrome.storage.local.set({

      [contract.permission.MODE_STORAGE_KEY]: els.permissionMode.value,

      [contract.session.WORKING_DIRECTORY_STORAGE_KEY]:

        els.workingDirectory.value.trim(),

    });

    notifyConfigUpdated();

    showStatus(els.runtimeStatus || createRuntimeStatus(), "Saved.", "ok");

  }

  function createRuntimeStatus() { const existing = document.getElementById("runtime-status"); if (existing) return existing; const div = document.createElement("div");

    div.id = "runtime-status";

    div.className = "agentao-field-status";

    els.runtimeSave.parentElement.appendChild(div);

    return div;

  }

  // ── 保存界面配置 ─────────────────────────────────────────

  async function saveUi() {

    await chrome.storage.local.set({

      [contract.ui.THEME_STORAGE_KEY]: els.theme.value,

      [contract.ui.PREFERRED_LOCALE_STORAGE_KEY]: els.locale.value,

    });

    // 立即应用主题

    localStorage.setItem(contract.ui.THEME_STORAGE_KEY, els.theme.value); applyTheme(els.theme.value); globalThis.__AIC_I18N__?.setLocale(els.locale.value); notifyConfigUpdated();

    showStatus(els.uiStatus || createUiStatus(), "Saved.", "ok");

  }

  function createUiStatus() { const existing = document.getElementById("ui-status"); if (existing) return existing; const div = document.createElement("div");

    div.id = "ui-status";

    div.className = "agentao-field-status";

    els.uiSave.parentElement.appendChild(div);

    return div;

  }

  function applyTheme(theme) {

    const resolved =

      theme === "dark"

        ? "dark"

        : theme === "light"

        ? "light"

        : window.matchMedia("(prefers-color-scheme: dark)").matches

        ? "dark"

        : "light";

    document.documentElement.setAttribute("data-theme", resolved);

  }

  // ── 测试连接 ─────────────────────────────────────────────

  async function fetchModels() {

    const baseUrl = els.baseUrl.value.trim();

    const apiKey = els.apiKey.value.trim();

    if (!baseUrl || !apiKey) {

      showStatus(els.providerStatus, "Base URL and API Key are required.", "error");

      return;

    }

    els.providerFetchModels.disabled = true;

    showStatus(els.providerStatus, "Fetching models...", "");

    try {

      const url = baseUrl.replace(/\/$/, "") + "/models";

      const resp = await fetch(url, {

        method: "GET",

        headers: {

          Authorization: `Bearer ${apiKey}`,

        },

      });

      if (!resp.ok) {

        let detail = `${resp.status} ${resp.statusText}`;

        try {

          const body = await resp.json();

          const apiMsg = body?.error?.message || body?.message || body?.error;

          if (apiMsg) detail += ` — ${apiMsg}`;

        } catch {}

        showStatus(els.providerStatus, `HTTP ${detail}`, "error");

        return;

      }

      const body = await resp.json();

      // OpenAI-compatible: { data: [{ id: "gpt-4o", ... }, ...] }

      // Some proxies: { models: [{ id: ... }] } or { models: ["model-name", ...] }

      let models = [];

      if (Array.isArray(body?.data)) {

        models = body.data.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);

      } else if (Array.isArray(body?.models)) {

        models = body.models.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);

      } else if (Array.isArray(body)) {

        models = body.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);

      }

      if (models.length === 0) {

        showStatus(els.providerStatus, "No models returned from the API.", "error");

        return;

      }

      // Populate the dropdown.

      const sel = els.providerModelSelect;

      sel.innerHTML = "";

      const placeholder = document.createElement("option");

      placeholder.value = "";

      placeholder.textContent = `— Select from ${models.length} model(s) —`;

      placeholder.disabled = true;

      sel.appendChild(placeholder);

      const currentModel = els.model.value.trim();

      let exactMatch = false;

      for (const id of models) {

        const opt = document.createElement("option");

        opt.value = id;

        opt.textContent = id;

        if (id === currentModel) {

          opt.selected = true;

          exactMatch = true;

        }

        sel.appendChild(opt);

      }

      sel.classList.remove("agentao-model-select--hidden");

      // Auto-fill if exactly one model, or if current model not in list.

      if (models.length === 1) {

        els.model.value = models[0];

        sel.value = models[0];

        showStatus(els.providerStatus, `Fetched 1 model: ${models[0]}`, "ok");

      } else if (!exactMatch) {

        showStatus(els.providerStatus, `Fetched ${models.length} models. Select one from the dropdown.`, "ok");

      } else {

        showStatus(els.providerStatus, `Fetched ${models.length} models. Current model confirmed available.`, "ok");

      }

    } catch (err) {

      showStatus(els.providerStatus, `Error: ${err.message}`, "error");

    } finally {

      els.providerFetchModels.disabled = false;

    }

  }

  // ── MCP 服务器管理 ───────────────────────────────────────

  function mcpMsg(key, fallback) {

    const message = globalThis.__AIC_I18N__?.getMessage(key);

    return message || fallback;

  }

  async function loadMcpServers() {

    const stored = await chrome.storage.local.get([M.STORAGE_KEY]);

    mcpServers = stored[M.STORAGE_KEY] || [];

    renderMcpList();

  }

  function persistMcpServers() {

    return chrome.storage.local.set({ [M.STORAGE_KEY]: mcpServers });

  }

  function renderMcpList() {

    const list = els.mcpList;

    list.innerHTML = "";

    if (mcpServers.length === 0) {

      const empty = document.createElement("p");

      empty.className = "agentao-field-hint";

      empty.textContent = mcpMsg("mcpNoServers", "No MCP servers configured yet.");

      list.appendChild(empty);

      return;

    }

    mcpServers.forEach((entry, index) => {

      const card = document.createElement("div");

      card.className = "agentao-mcp-card" + (entry[MF.ENABLED] === false ? " agentao-mcp-card--disabled" : "");

      // 状态点（宿主回报；未回报前为灰色）

      const status = document.createElement("span");

      status.className = "agentao-mcp-card-status";

      const dot = document.createElement("span");

      dot.className = "agentao-status-dot";

      const runtime = mcpRuntimeStatuses.get(entry[MF.NAME]);

      const statusText = document.createElement("span");

      if (runtime) {

        dot.style.background =

          runtime.status === "connected" ? "var(--aic-success)" :

          runtime.status === "error" ? "var(--aic-danger)" :

          "var(--aic-warning)";

        statusText.textContent = runtime.status + (runtime.tools ? ` · ${runtime.tools.length}` : "");

        statusText.title = runtime.tools ? runtime.tools.join(", ") : "";

      }

      status.appendChild(dot);

      status.appendChild(statusText);

      // 名称 + 徽标 + 目标

      const info = document.createElement("div");

      info.className = "agentao-mcp-card-info";

      const nameRow = document.createElement("div");

      nameRow.className = "agentao-mcp-card-name";

      nameRow.textContent = entry[MF.NAME] || "?";

      const badge = document.createElement("span");

      badge.className = "agentao-mcp-badge";

      badge.textContent = entry[MF.TYPE] || "http";

      nameRow.appendChild(badge);

      if (entry[MF.TRUST] === true) {

        const trustBadge = document.createElement("span");

        trustBadge.className = "agentao-mcp-badge";

        trustBadge.textContent = "trusted";

        nameRow.appendChild(trustBadge);

      }

      const target = document.createElement("div");

      target.className = "agentao-mcp-card-target";

      target.textContent = entry[MF.TYPE] === "stdio"

        ? [entry[MF.COMMAND], ...(entry[MF.ARGS] || [])].filter(Boolean).join(" ")

        : entry[MF.URL] || "";

      info.appendChild(nameRow);

      info.appendChild(target);

      // 操作按钮

      const actions = document.createElement("div");

      actions.className = "agentao-mcp-card-actions";

      const editBtn = document.createElement("button");

      editBtn.className = "agentao-btn agentao-btn--secondary agentao-btn--sm";

      editBtn.textContent = mcpMsg("mcpEdit", "Edit");

      editBtn.addEventListener("click", () => openMcpEditor(index));

      const delBtn = document.createElement("button");

      delBtn.className = "agentao-btn agentao-btn--secondary agentao-btn--sm";

      delBtn.textContent = mcpMsg("mcpDelete", "Delete");

      delBtn.addEventListener("click", async () => {

        if (!window.confirm(mcpMsg("mcpConfirmDelete", "Delete this MCP server?"))) return;

        mcpServers.splice(index, 1);

        await persistMcpServers();

        renderMcpList();

        notifyConfigUpdated();

      });

      actions.appendChild(editBtn);

      actions.appendChild(delBtn);

      card.appendChild(status);

      card.appendChild(info);

      card.appendChild(actions);

      list.appendChild(card);

    });

  }

  function openMcpEditor(index) {

    mcpEditingIndex = index;

    const entry = index >= 0 ? mcpServers[index] || {} : {};

    els.mcpName.value = entry[MF.NAME] || "";

    els.mcpType.value = entry[MF.TYPE] || M.TYPES.HTTP;

    els.mcpUrl.value = entry[MF.URL] || "";

    els.mcpHeaders.value =

      entry[MF.HEADERS] && Object.keys(entry[MF.HEADERS]).length

        ? JSON.stringify(entry[MF.HEADERS], null, 0)

        : "";

    els.mcpCommand.value = entry[MF.COMMAND] || "";

    els.mcpArgs.value = Array.isArray(entry[MF.ARGS]) ? entry[MF.ARGS].join("\n") : "";

    els.mcpTimeout.value = entry[MF.TIMEOUT] != null ? entry[MF.TIMEOUT] : "";

    els.mcpTrust.checked = entry[MF.TRUST] === true;

    els.mcpEnabled.checked = entry[MF.ENABLED] !== false;

    showStatus(els.mcpEditorStatus, "", "");

    els.mcpEditor.classList.remove("agentao-mcp-editor--hidden");

    syncMcpEditorFields();

  }

  function closeMcpEditor() {

    mcpEditingIndex = -1;

    els.mcpEditor.classList.add("agentao-mcp-editor--hidden");

  }

  function syncMcpEditorFields() {

    const isStdio = els.mcpType.value === M.TYPES.STDIO;

    els.mcpUrlField.style.display = isStdio ? "none" : "";

    els.mcpHeadersField.style.display = isStdio ? "none" : "";

    els.mcpCommandField.style.display = isStdio ? "" : "none";

    els.mcpArgsField.style.display = isStdio ? "" : "none";

  }

  function collectEditorEntry() {

    const name = els.mcpName.value.trim();

    if (!/^[A-Za-z0-9_-]+$/.test(name)) {

      return { error: mcpMsg("mcpFieldNameHint", "Letters, digits, - and _ only.") };

    }

    const type = els.mcpType.value;

    const entry = {

      [MF.NAME]: name,

      [MF.TYPE]: type,

      [MF.TRUST]: els.mcpTrust.checked,

      [MF.ENABLED]: els.mcpEnabled.checked,

    };

    if (type === M.TYPES.STDIO) {

      const command = els.mcpCommand.value.trim();

      if (!command) return { error: "Command is required for stdio." };

      entry[MF.COMMAND] = command;

      entry[MF.ARGS] = els.mcpArgs.value

        .split("\n")

        .map((line) => line.trim())

        .filter(Boolean);

    } else {

      const url = els.mcpUrl.value.trim();

      if (!/^https?:\/\//i.test(url)) {

        return { error: "URL must start with http:// or https://" };

      }

      entry[MF.URL] = url;

      const headersRaw = els.mcpHeaders.value.trim();

      if (headersRaw) {

        try {

          const parsed = JSON.parse(headersRaw);

          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {

            throw new Error("not an object");

          }

          entry[MF.HEADERS] = parsed;

        } catch {

          return { error: "Headers must be a JSON object, e.g. {\"Authorization\": \"Bearer token\"}" };

        }

      }

    }

    const timeout = parseInt(els.mcpTimeout.value, 10);

    if (Number.isFinite(timeout) && timeout > 0) {

      entry[MF.TIMEOUT] = timeout;

    }

    return { entry };

  }

  async function saveMcpServer() {

    const { entry, error } = collectEditorEntry();

    if (error) {

      showStatus(els.mcpEditorStatus, error, "error");

      return;

    }

    if (mcpEditingIndex >= 0) {

      mcpServers[mcpEditingIndex] = entry;

    } else {

      // 同名覆盖：MCP 配置按 name 唯一

      const existing = mcpServers.findIndex((s) => s[MF.NAME] === entry[MF.NAME]);

      if (existing >= 0) mcpServers[existing] = entry;

      else mcpServers.push(entry);

    }

    await persistMcpServers();

    showStatus(els.mcpEditorStatus, "Saved.", "ok");

    renderMcpList();

    closeMcpEditor();

    notifyConfigUpdated(); // 触发宿主重建，注入 MCP 工具

  }

  async function testMcpEntry() {

    const { entry, error } = collectEditorEntry();

    if (error) {

      showStatus(els.mcpEditorStatus, error, "error");

      return;

    }

    els.mcpTest.disabled = true;

    showStatus(els.mcpEditorStatus, mcpMsg("mcpTesting", "Testing..."), "");

    try {

      const result = await sendMcpTest(entry);

      if (result.ok) {

        const count = result.tools ? result.tools.length : 0;

        showStatus(els.mcpEditorStatus, `Connected. ${count} tool(s): ${result.tools.join(", ")}`, "ok");

      } else {

        showStatus(els.mcpEditorStatus, `Connection failed: ${result.error || "unknown error"}`, "error");

      }

    } catch (err) {

      showStatus(els.mcpEditorStatus, `Connection failed: ${err.message}`, "error");

    } finally {

      els.mcpTest.disabled = false;

    }

  }

  function sendMcpTest(serverEntry) {

    // options -> SW -> 宿主 -> SW -> options 的往返；requestId 匹配响应。

    return new Promise((resolve, reject) => {

      const requestId = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const timer = setTimeout(() => {

        pendingMcpTestResolvers.delete(requestId);

        reject(new Error("test timed out"));

      }, 35000);

      pendingMcpTestResolvers.set(requestId, { resolve, reject, timer });

      chrome.runtime

        .sendMessage({ type: MSG.MCP_TEST_REQUEST, requestId, server: serverEntry })

        .catch((err) => {

          clearTimeout(timer);

          pendingMcpTestResolvers.delete(requestId);

          reject(err);

        });

    });

  }

  const pendingMcpTestResolvers = new Map(); // requestId -> { resolve, reject, timer }

  function applyMcpStatus(servers) {

    mcpRuntimeStatuses.clear();

    for (const s of servers || []) {

      if (s && s.name) {

        mcpRuntimeStatuses.set(s.name, { status: s.status || "unknown", tools: s.tools || [] });

      }

    }

    renderMcpList();

    const enabled = mcpServers.filter((s) => s[MF.ENABLED] !== false);

    if (enabled.length === 0) {

      els.mcpRuntimeStatus.textContent = mcpMsg("mcpStatusIdle", "Runtime connection status appears here after save.");

      els.mcpRuntimeStatus.className = "agentao-field-hint";

      return;

    }

    const connected = enabled.filter((s) => mcpRuntimeStatuses.get(s[MF.NAME])?.status === "connected");

    const totalTools = servers.reduce((n, s) => n + (s.tools ? s.tools.length : 0), 0);

    els.mcpRuntimeStatus.textContent = `MCP: ${connected.length}/${enabled.length} connected · ${totalTools} tool(s)`;

    els.mcpRuntimeStatus.className =

      "agentao-field-status" + (connected.length === enabled.length && enabled.length > 0 ? " agentao-field-status--ok" : "");

  }

  // ── 辅助 ─────────────────────────────────────────────────

  function showStatus(el, message, level) {

    if (!el) return;

    el.textContent = message;

    el.className = `agentao-field-status${

      level === "ok" ? " agentao-field-status--ok" : ""

    }${level === "error" ? " agentao-field-status--error" : ""}`;

  }

  function notifyConfigUpdated() {

    chrome.runtime.sendMessage({ type: MSG.CONFIG_UPDATED }).catch(() => {});

  }

  // ── 宿主状态 ─────────────────────────────────────────────

  function updateHostStatus(status) {

    els.hostStatus.className = `agentao-host-status agentao-host-status--${status}`;

    const i18nKey = {

      connected: "hostStatusConnected",

      connecting: "hostStatusConnecting",

      disconnected: "hostStatusDisconnected",
      llm_error: "hostStatusLlmError",

    }[status];

    if (i18nKey) {

      const message = globalThis.__AIC_I18N__?.getMessage(i18nKey);

      els.hostStatusText.textContent = message || status;

    } else {

      els.hostStatusText.textContent = status;

    }

  }

  // ── 事件绑定 ─────────────────────────────────────────────

  els.providerSave.addEventListener("click", saveProvider);

  els.providerFetchModels.addEventListener("click", fetchModels);

  els.providerModelSelect.addEventListener("change", (e) => {

    if (e.target.value) {

      els.model.value = e.target.value;

    }

  });

  els.runtimeSave.addEventListener("click", saveRuntime);

  els.uiSave.addEventListener("click", saveUi);

  els.mcpAdd.addEventListener("click", () => openMcpEditor(-1));

  els.mcpType.addEventListener("change", syncMcpEditorFields);

  els.mcpSave.addEventListener("click", saveMcpServer);

  els.mcpTest.addEventListener("click", testMcpEntry);

  els.mcpCancel.addEventListener("click", closeMcpEditor);

  els.theme.addEventListener("change", () => applyTheme(els.theme.value));

  // 监听宿主状态变更

  chrome.runtime.onMessage.addListener((msg) => {

    if (msg?.type === MSG.HOST_STATUS_CHANGED) {

      updateHostStatus(msg.status);

    }

    if (msg?.type === MSG.MCP_TEST_RESULT && msg.requestId) {

      const pending = pendingMcpTestResolvers.get(msg.requestId);

      if (pending) {

        clearTimeout(pending.timer);

        pendingMcpTestResolvers.delete(msg.requestId);

        pending.resolve(msg);

      }

    }

    if (msg?.type === MSG.MCP_STATUS_CHANGED) {

      applyMcpStatus(msg.servers);

    }

  });

  // 应用 i18n

  applyI18n();

  function applyI18n() {

    document.querySelectorAll("[data-i18n]").forEach((el) => {

      const key = el.getAttribute("data-i18n");

      const message = globalThis.__AIC_I18N__?.getMessage(key);

      if (message) el.textContent = message;

    });

  }

  // 初始化

  loadConfig();

  loadMcpServers();

  updateHostStatus("connecting");

  // 查询当前宿主连接状态：service worker 可能在设置页打开前就已连上宿主，

  // 此时不会触发 HOST_STATUS_CHANGED 事件，需要主动查询以同步状态显示。

  chrome.runtime

    .sendMessage({ type: MSG.GET_HOST_STATUS })

    .then((resp) => {

      if (resp && resp.status) updateHostStatus(resp.status);

    })

    .catch(() => {});

})();

