// sidepanel.js

//

// 侧边栏聊天界面。职责：

// 1) 渲染对话消息（用户 / 助手 / 工具 / 思考）/ 权限弹窗 / ask_user 弹窗 / 附件

// 2) 通过 chrome.runtime.sendMessage 与 service worker 通信

// 3) 管理权限确认 / ask_user 的 pending 请求（按 requestId 对账）

// 4) 从 chrome.storage 读取配置，管理会话历史（按 sessionId 持久化）

//

// 所有 message type / DOM id / storage key 都从 __AIC_CONTRACT__ 读取，不硬编码

(function () {

  const contract = globalThis.__AIC_CONTRACT__;

  if (!contract) {

    console.error("[agentao] __AIC_CONTRACT__ not found");

    return;

  }

  const MSG = contract.messages;

  const EVENTS = contract.agentEvents;

  const DOM = contract.dom;

  const P = contract.provider;

  const F = P.FIELDS;

  // ── DOM 元素引用 ──────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  const els = {

    root: $(DOM.SIDEPANEL_ROOT),

    messages: $(DOM.SIDEPANEL_MESSAGES),

    input: $(DOM.SIDEPANEL_INPUT),

    send: $(DOM.SIDEPANEL_SEND_BUTTON),

    stop: $(DOM.SIDEPANEL_STOP_BUTTON),

    status: $(DOM.SIDEPANEL_STATUS),

    permissionPrompt: $(DOM.SIDEPANEL_PERMISSION_PROMPT),

    askUserPrompt: $(DOM.SIDEPANEL_ASK_USER_PROMPT),

    openSettings: $("agentao-open-settings"),
    sessionsBtn: $("agentao-sessions-btn"),
    sessionsPanel: $("agentao-sessions-panel"),
    sessionsList: $("agentao-sessions-list"),
    newChatBtn: $("agentao-new-chat"),

    setupBanner: $("agentao-setup-banner"),

    setupOpenSettings: $("agentao-setup-open-settings"),

    thinking: $("agentao-thinking"),

    thinkingCanvas: $("agentao-thinking-canvas"),

    thinkingText: $("agentao-thinking-text"),

    attach: $(DOM.SIDEPANEL_ATTACH_BUTTON),

    fileInput: $(DOM.SIDEPANEL_FILE_INPUT),

    attachments: $(DOM.SIDEPANEL_ATTACHMENTS),

  };

  // ── 状态 ─────────────────────────────────────────────────────────────

  const state = {

    sessionId: generateSessionId(),

    // 当前工具调用的 DOM 块（按 callId 索引）

    currentAssistantText: "",
    currentThinkingText: "",
    thinkingBlock: null,

    // 工具输出实时追加（流式），完成后替换为最终结果的 call_id 删除标记

    toolBlocks: new Map(),

    // 思考过程流式追加，完成后折叠

    attachments: [],

    // 工具调用状态：running / done / error

    running: false,

    // 权限确认弹窗状态

    activePermissionRequestId: null,

    // ask_user 弹窗状态

    activeAskUserRequestId: null,

    // 会话是否有未保存的新内容。只有真实产生新消息（用户输入/助手回复/
    // 工具块/思考流/错误）才置 true；切换会话、关闭侧栏、恢复历史等
    // 操作不算。saveCurrentSession 据此决定是否刷新时间戳——否则历史
    // 列表显示的会变成"最后一次打开/切换面板的时间"而非对话时间。

    sessionDirty: false,

  };

  function generateSessionId() {

    return `session-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  }

  // ── 娑堟伅娓叉煋 ─────────────────────────────────────────────

  function clearEmptyHint() {

    const empty = els.messages.querySelector(".agentao-empty");

    if (empty) empty.remove();

  }

  // ── 工具 ─────────────────────────────────────────────────────────────

  const ACCEPTED_EXTENSIONS = [".doc", ".docx", ".pdf", ".md"];

  function isAcceptedFile(fileName) {

    const lower = fileName.toLowerCase();

    return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));

  }

  function readFileAsDataURL(file) {

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(file);

    });

  }

  function readFileAsText(file) {

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);

      reader.onerror = () => reject(reader.error);

      reader.readAsText(file);

    });

  }

  function dataURLToBase64(dataURL) {

    const idx = dataURL.indexOf(",");

    return idx >= 0 ? dataURL.slice(idx + 1) : dataURL;

  }

  async function addAttachment(file) {

    if (!isAcceptedFile(file.name)) {

      appendMessage("agentao-msg--error", globalThis.__AIC_I18N__?.getMessage("attachUnsupportedFormat") || "Unsupported file format. Only .doc, .docx, .pdf, .md are accepted.");

      return;

    }

    const isText = file.name.toLowerCase().endsWith(".md");

    let content;

    if (isText) {

      content = await readFileAsText(file);

    } else {

      const dataURL = await readFileAsDataURL(file);

      content = dataURLToBase64(dataURL);

    }

    state.attachments.push({

      name: file.name,

      size: file.size,

      type: isText ? "text" : "binary",

      content: content,

    });

    renderAttachments();

  }

  function removeAttachment(index) {

    state.attachments.splice(index, 1);

    renderAttachments();

  }

  function renderAttachments() {

    if (!els.attachments) return;

    if (state.attachments.length === 0) {

      els.attachments.classList.add("agentao-attachments--hidden");

      els.attachments.innerHTML = "";

      return;

    }

    els.attachments.classList.remove("agentao-attachments--hidden");

    els.attachments.innerHTML = "";

    state.attachments.forEach((att, i) => {

      const chip = document.createElement("span");

      chip.className = "agentao-attachment";

      const name = document.createElement("span");

      name.className = "agentao-attachment-name";

      name.textContent = att.name;

      name.title = att.name;

      const remove = document.createElement("button");

      remove.className = "agentao-attachment-remove";

      remove.textContent = "\u00d7";

      remove.title = globalThis.__AIC_I18N__?.getMessage("attachRemove") || "Remove";

      remove.addEventListener("click", () => removeAttachment(i));

      chip.appendChild(name);

      chip.appendChild(remove);

      els.attachments.appendChild(chip);

    });

  }

  function clearAttachments() {

    state.attachments = [];

    renderAttachments();

  }

  function buildAttachmentsPayload() {

    return state.attachments.map((att) => ({

      name: att.name,

      type: att.type,

      content: att.content,

    }));

  }

  function appendMessage(className, text) {

    clearEmptyHint();

    state.sessionDirty = true;

    const div = document.createElement("div");

    div.className = `agentao-msg ${className}`;

    div.textContent = text;

    els.messages.appendChild(div);

    scrollToBottom();

    return div;

  }

  function scrollToBottom() {

    els.messages.scrollTop = els.messages.scrollHeight;

  }

  function renderUserMessage(text) {

    appendMessage("agentao-msg--user", text);

  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var codeBlocks = [];
    text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, function(_, code) {
      var i = codeBlocks.length;
      codeBlocks.push("<pre class=\"agentao-md-pre\"><code>" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>");
      return "\x00CB" + i + "\x00";
    });
    text = text.replace(/```[\w]*\n?([\s\S]*)$/g, function(_, code) {
      var i = codeBlocks.length;
      codeBlocks.push("<pre class=\"agentao-md-pre\"><code>" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>");
      return "\x00CB" + i + "\x00";
    });
    text = escapeHtml(text);
    var tableBlocks = [];
    text = text.replace(/^(\|.+)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)+)/gm, function(m0, hdr, sep, body) {
      var i = tableBlocks.length;
      var html = '<table class="agentao-md-table">';
      var hCells = hdr.split('|').filter(function(c) { return c.trim() !== ''; });
      html += '<thead><tr>';
      hCells.forEach(function(c) { html += '<th>' + c.trim() + '</th>'; });
      html += '</tr></thead><tbody>';
      var bodyRows = body.trim().split('\n');
      bodyRows.forEach(function(r) {
        var cells = r.split('|').filter(function(c) { return c.trim() !== ''; });
        html += '<tr>';
        cells.forEach(function(c) { html += '<td>' + c.trim() + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table>';
      tableBlocks.push(html);
      return '\x00TB' + i + '\x00';
    });
    var lines = text.split("\n");
    var html = [];
    var inUl = false, inOl = false;
    function closeList() {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (inOl) { html.push("</ol>"); inOl = false; }
    }
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      if (/^\x00CB\d+\x00$/.test(line)) { closeList(); html.push(line); continue; }
      if (/^\x00TB\d+\x00$/.test(line)) { closeList(); html.push(line); continue; }
      var h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) { closeList(); var lv = h[1].length; html.push("<h" + lv + ">" + h[2] + "</h" + lv + ">"); continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); html.push("<hr>"); continue; }
      var bq = line.match(/^&gt;\s?(.*)$/);
      if (bq) { closeList(); html.push("<blockquote>" + bq[1] + "</blockquote>"); continue; }
      var ul = line.match(/^[\-\*]\s+(.+)$/);
      if (ul) { if (!inUl) { closeList(); html.push("<ul>"); inUl = true; } html.push("<li>" + ul[1] + "</li>"); continue; }
      var ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) { if (!inOl) { closeList(); html.push("<ol>"); inOl = true; } html.push("<li>" + ol[1] + "</li>"); continue; }
      if (line.trim() === "") { closeList(); continue; }
      closeList();
      html.push("<p>" + line + "</p>");
    }
    closeList();
    var result = html.join("\n");
    result = result.replace(/<\/p>\n<p>/g, "<br>");
    result = result.replace(/`([^`]+)`/g, "<code class=\"agentao-md-code\">$1</code>");
    result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>");
    for (var ti = 0; ti < tableBlocks.length; ti++) {
      result = result.replace("\x00TB" + ti + "\x00", tableBlocks[ti]);
    }
    for (var ci = 0; ci < codeBlocks.length; ci++) {
      result = result.replace("\x00CB" + ci + "\x00", codeBlocks[ci]);
    }
    return result;
  }

  function ensureAssistantBlock() {

    let block = els.messages.querySelector(".agentao-msg--assistant[data-current='true']");

    if (!block) {

      block = document.createElement("div");

      block.className = "agentao-msg agentao-msg--assistant";

      block.setAttribute("data-current", "true");

      clearEmptyHint();

      state.sessionDirty = true;

      thinkingIndicator.hide();

      els.messages.appendChild(block);

      scrollToBottom();

    }

    return block;

  }

  function finalizeAssistantBlock() {

    const block = els.messages.querySelector(".agentao-msg--assistant[data-current='true']");

    if (block) {

      block.removeAttribute("data-current");

    }

  }

  function ensureThinkingBlock() {
    if (state.thinkingBlock) return state.thinkingBlock;
    finalizeAssistantBlock();
    clearEmptyHint();
    state.sessionDirty = true;
    thinkingIndicator.hide();
    var block = document.createElement("div");
    block.className = "agentao-msg agentao-msg--thinking agentao-thinking-stream";
    block.setAttribute("data-current", "true");
    var header = document.createElement("div");
    header.className = "agentao-thinking-header";
    header.innerHTML = '<span class="agentao-thinking-title">' +
      (globalThis.__AIC_I18N__?.getMessage("statusThinking") || "Thinking") +
      '</span>' +
      '<span class="agentao-thinking-dots"><span></span><span></span><span></span></span>' +
      '<svg class="agentao-thinking-toggle" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    var body = document.createElement("div");
    body.className = "agentao-thinking-body";
    body.textContent = "";
    block.appendChild(header);
    block.appendChild(body);
    block.setAttribute("data-expanded", "false");
    header.addEventListener("click", function() {
      var expanded = block.getAttribute("data-expanded") === "true";
      block.setAttribute("data-expanded", expanded ? "false" : "true");
    });
    els.messages.appendChild(block);
    state.thinkingBlock = block;
    scrollToBottom();
    return block;
  }

  function appendThinking(text) {
    state.currentThinkingText += text;
    var block = ensureThinkingBlock();
    var body = block.querySelector(".agentao-thinking-body");
    if (body) { body.textContent = state.currentThinkingText; }
    var title = block.querySelector(".agentao-thinking-title");
    if (title) {
      var lines = state.currentThinkingText.trim().split("\n");
      var last = lines[lines.length - 1];
      title.textContent = last ? last.slice(0, 80) : (globalThis.__AIC_I18N__?.getMessage("statusThinking") || "Thinking");
    }
    scrollToBottom();
  }

  function finalizeThinkingBlock() {
    var block = state.thinkingBlock;
    if (!block) return;
    block.removeAttribute("data-current");
    block.classList.add("agentao-thinking-done");
    var dots = block.querySelector(".agentao-thinking-dots");
    if (dots) dots.style.display = "none";
    var title = block.querySelector(".agentao-thinking-title");
    if (title) {
      var lines = state.currentThinkingText.trim().split("\n");
      var first = lines[0];
      title.textContent = first ? first.slice(0, 80) : "Thought process";
    }
    state.thinkingBlock = null;
    state.currentThinkingText = "";
  }

  function ensureToolBlock(callId, toolName, args) {

    let block = state.toolBlocks.get(callId);

    if (!block) {
      finalizeAssistantBlock();
      finalizeThinkingBlock();

      clearEmptyHint();

      state.sessionDirty = true;

      block = document.createElement("div");

      block.className = "agentao-msg agentao-msg--tool";

      block.setAttribute("data-call-id", callId);

      const header = document.createElement("div");

      header.className = "agentao-tool-header";

      header.textContent = `${toolName}`;

      block.appendChild(header);

      const argsPre = document.createElement("div");

      argsPre.className = "agentao-tool-output";

      argsPre.textContent = formatArgs(args);

      block.appendChild(argsPre);

      els.messages.appendChild(block);

      scrollToBottom();

      state.toolBlocks.set(callId, block);

    }

    return block;

  }

  function updateToolBlockStatus(callId, status, durationMs) {

    const block = state.toolBlocks.get(callId);

    if (!block) return;

    const header = block.querySelector(".agentao-tool-header");

    if (!header) return;

    // 缁夊娅庨弮褏濮搁幀?

    const oldStatus = header.querySelector(".agentao-tool-status");

    if (oldStatus) oldStatus.remove();

    const statusSpan = document.createElement("span");

    statusSpan.className = `agentao-tool-status agentao-tool-status--${status}`;

    const label =

      status === "ok" ? "✓" : status === "error" ? "✗" : status === "cancelled" ? "⊘" : status;

    statusSpan.textContent = label;

    header.appendChild(statusSpan);

  }

  function appendToolOutput(callId, chunk) {

    const block = state.toolBlocks.get(callId);

    if (!block) return;

    let output = block.querySelector(".agentao-tool-output");

    if (!output) {

      output = document.createElement("div");

      output.className = "agentao-tool-output";

      block.appendChild(output);

    }

    output.textContent += chunk;

    scrollToBottom();

  }

  function appendToolResult(callId, content) {

    const block = state.toolBlocks.get(callId);

    if (!block) return;

    let output = block.querySelector(".agentao-tool-output");

    if (!output) {

      output = document.createElement("div");

      output.className = "agentao-tool-output";

      block.appendChild(output);

    }

    // 将 base64 图片保存到工作区，返回文件路径占位符（避免 token 爆炸）

    const truncated = truncate(content, 2000);

    output.textContent = truncated;

    scrollToBottom();

  }

  function appendError(message) {

    appendMessage("agentao-msg--error", `⚠ ${message}`);

  }

  function formatArgs(args) {

    if (!args) return "";

    try {

      return JSON.stringify(args, null, 2);

    } catch {

      return String(args);

    }

  }

  function truncate(text, max) {

    if (typeof text !== "string") text = String(text);

    if (text.length <= max) return text;

    return text.slice(0, max) + `\n… (${text.length - max} more chars)`;

  }

  // ── 回合生命周期 ─────────────────────────────────────────────────────

  // processing.html 中转页加载时也会发 GET_HOST_STATUS，这里统一处理

  // beginTurn 启动流式输出监听，LLM_TEXT 逐字追加；endTurn 定稿收尾

  const thinkingIndicator = (function () {

    const canvas = els.thinkingCanvas;

    const ctx = canvas ? canvas.getContext('2d') : null;

    const w = canvas ? canvas.width : 0;

    const h = canvas ? canvas.height : 0;

    const offscreen = document.createElement('canvas');

    offscreen.width = w;

    offscreen.height = h;

    const offCtx = offscreen.getContext('2d');

    const centerX = w / 2;

    const centerY = h / 2;

    const radius = Math.min(centerX, centerY) - 4;

    const smallRadius = radius / 2;

    const eyeRadius = radius / 8;

    let rafId = null;

    let angle = 0;

    function drawStaticTaiji() {

      const c = offCtx;

      c.clearRect(0, 0, w, h);

      c.beginPath();

      c.arc(centerX, centerY, radius, 0, 2 * Math.PI);

      c.fillStyle = '#ffffff';

      c.fill();

      c.beginPath();

      c.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 2);

      c.fillStyle = '#000000';

      c.fill();

      c.beginPath();

      c.arc(centerX, centerY - smallRadius, smallRadius, Math.PI / 2, 3 * Math.PI / 2);

      c.fillStyle = '#000000';

      c.fill();

      c.beginPath();

      c.arc(centerX, centerY + smallRadius, smallRadius, -Math.PI / 2, Math.PI / 2);

      c.fillStyle = '#ffffff';

      c.fill();

      c.beginPath();

      c.arc(centerX, centerY - smallRadius, eyeRadius, 0, 2 * Math.PI);

      c.fillStyle = '#ffffff';

      c.fill();

      c.beginPath();

      c.arc(centerX, centerY + smallRadius, eyeRadius, 0, 2 * Math.PI);

      c.fillStyle = '#000000';

      c.fill();

    }

    function animate() {

      angle -= 0.02;

      ctx.clearRect(0, 0, w, h);

      ctx.save();

      ctx.translate(centerX, centerY);

      ctx.rotate(angle);

      ctx.drawImage(offscreen, -centerX, -centerY);

      ctx.restore();

      rafId = requestAnimationFrame(animate);

    }

    function show() {

      if (!canvas || !ctx) return;

      drawStaticTaiji();

      // 基础消息追加函数：创建一条消息气泡

      if (els.thinking) {

        els.messages.appendChild(els.thinking);

      }

      clearEmptyHint();

      // 参考 claw-in-chrome 的消息渲染模式，但使用可读的 DOM 操作而非混淆产物

      if (!els.permissionPrompt || els.permissionPrompt.classList.contains('agentao-prompt--hidden')) {

        els.thinking.classList.remove('agentao-thinking--hidden');

      }

      if (rafId === null) {

        animate();

      }

      scrollToBottom();

    }

    function hide() {

      if (rafId !== null) {

        cancelAnimationFrame(rafId);

        rafId = null;

      }

      if (els.thinking) {

        els.thinking.classList.add('agentao-thinking--hidden');

      }

    }

    function setText(text) {

      if (els.thinkingText) {

        els.thinkingText.textContent = text || '';

      }

    }

    return { show, hide, setText };

  })();

  // ── 消息渲染 ─────────────────────────────────────────────────────────

  function beginTurn() {

    state.running = true;

    thinkingIndicator.show();
    thinkingIndicator.setText(globalThis.__AIC_I18N__?.getMessage("statusThinking") || "Thinking…");

    state.currentAssistantText = "";
    state.currentThinkingText = "";
    state.thinkingBlock = null;

    state.toolBlocks.clear();

    els.send.classList.add("agentao-btn--hidden");

    els.stop.classList.remove("agentao-btn--hidden");

    els.input.disabled = true;

  }

  function endTurn() {

    state.running = false;

    thinkingIndicator.hide();

    finalizeAssistantBlock();
    finalizeThinkingBlock();

    els.send.classList.remove("agentao-btn--hidden");

    els.stop.classList.add("agentao-btn--hidden");

    els.input.disabled = false;

    els.input.focus();

  }

  // ── 处理宿主发来的 CHAT_EVENT，转发给 service worker 的 CHAT_EVENT 处理

  function handleChatEvent(event) {

    if (!event || !event.type) return;

    const data = event.data || {};

    switch (event.type) {

      case EVENTS.TURN_START:

        beginTurn();

        break;

      case EVENTS.TURN_BEGIN:

        // 清空并重建用户消息

        beginTurn();

        break;

      case EVENTS.THINKING:

        if (data.text) appendThinking(data.text);

        break;

      case EVENTS.LLM_TEXT:

        if (data.chunk) {
          finalizeThinkingBlock();

          state.currentAssistantText += data.chunk;

          const block = ensureAssistantBlock();

          block.innerHTML = renderMarkdown(state.currentAssistantText);

          scrollToBottom();

        }

        break;

      case EVENTS.TOOL_START:

        if (data.call_id) {

          ensureToolBlock(data.call_id, data.tool, data.args);

        }

        break;

      case EVENTS.TOOL_OUTPUT:

        if (data.call_id && data.chunk) {

          appendToolOutput(data.call_id, data.chunk);

        }

        break;

      case EVENTS.TOOL_COMPLETE:

        if (data.call_id) {

          updateToolBlockStatus(data.call_id, data.status, data.duration_ms);

        }

        break;

      case EVENTS.TOOL_RESULT:

        if (data.call_id) {

          appendToolResult(data.call_id, data.content);

          updateToolBlockStatus(data.call_id, data.status, data.duration_ms);

        }

        break;

      case EVENTS.AGENT_START:

    appendMessage("agentao-msg--thinking", `→ sub-agent: ${data.agent} (${data.task || ""})`);

        break;

      case EVENTS.AGENT_END:

    appendMessage("agentao-msg--thinking", `← sub-agent done: ${data.agent} (${data.state})`);

        break;

      case EVENTS.ERROR:

        if (data.message) appendError(data.message);

        break;

      case EVENTS.TURN_END:

        // TURN_END 转为 CHAT_TURN_END，定稿助手回复

        break;

      default:

        // 兼容旧版 agentao：忽略 SKILL_ACTIVATED / MEMORY_WRITE 等事件

        break;

    }

  }

  // ── 事件处理 ─────────────────────────────────────────────────────────

  function showPermissionPrompt(msg) {

    state.activePermissionRequestId = msg.requestId;

    const card = els.permissionPrompt.querySelector(".agentao-prompt-card");

    card.querySelector(".agentao-prompt-tool").textContent = msg.toolName || "";

    card.querySelector(".agentao-prompt-description").textContent = msg.description || "";

    card.querySelector(".agentao-prompt-args").textContent = formatArgs(msg.args);

    els.permissionPrompt.classList.remove("agentao-prompt--hidden");

    // 参考 claw-in-chrome 的事件处理模式，但使用可读的代码结构
    if (els.thinking) {
      els.thinking.classList.add("agentao-thinking--hidden");
    }
  }

  function hidePermissionPrompt() {

    els.permissionPrompt.classList.add("agentao-prompt--hidden");

    state.activePermissionRequestId = null;

    // 参考 claw-in-chrome 的权限弹窗实现，但使用可读的 DOM 操作
    if (state.running && els.thinking) {
      els.messages.appendChild(els.thinking);
      els.thinking.classList.remove("agentao-thinking--hidden");
      scrollToBottom();
    }  }

  function respondPermission(allowed) {

    if (!state.activePermissionRequestId) return;

    chrome.runtime.sendMessage({

      type: MSG.PERMISSION_RESPONSE,

      requestId: state.activePermissionRequestId,

      allowed,

    });

    hidePermissionPrompt();

  }

  // ── ask_user 弹窗 ───────────────────────────────────────────────────

  function showAskUserPrompt(msg) {

    state.activeAskUserRequestId = msg.requestId;

    const card = els.askUserPrompt.querySelector(".agentao-prompt-card");

    card.querySelector(".agentao-prompt-question").textContent = msg.question || "";

    const optionsContainer = card.querySelector(".agentao-prompt-options");

    optionsContainer.innerHTML = "";

    const input = card.querySelector(".agentao-prompt-input");

    input.value = "";

    input.style.display = msg.allowCustom === false ? "none" : "block";

    if (msg.options && msg.options.length) {

      msg.options.forEach((opt) => {

        const btn = document.createElement("button");

        btn.className = "agentao-prompt-option";

        btn.textContent = opt;

        btn.addEventListener("click", () => respondAskUser(opt));

        optionsContainer.appendChild(btn);

      });

    }

    els.askUserPrompt.classList.remove("agentao-prompt--hidden");

    if (msg.allowCustom !== false) {

      input.focus();

    }

  }

  function hideAskUserPrompt() {

    els.askUserPrompt.classList.add("agentao-prompt--hidden");

    state.activeAskUserRequestId = null;

  }

  function respondAskUser(answer) {

    if (!state.activeAskUserRequestId) return;

    chrome.runtime.sendMessage({

      type: MSG.ASK_USER_RESPONSE,

      requestId: state.activeAskUserRequestId,

      answer,

    });

    hideAskUserPrompt();

  }

  // ── 宿主状态 ────────────────────────────────────────────────────────

  function updateHostStatus(status, detail) {

    const statusEl = els.status;

    statusEl.className = `agentao-status agentao-status--${status}`;

    const textEl = statusEl.querySelector(".agentao-status-text");

    const i18nKey = {

      connected: "statusConnected",

      connecting: "statusConnecting",

      disconnected: "statusDisconnected",
      llm_error: "statusLlmError",

    }[status];

    if (i18nKey) {

      const message = globalThis.__AIC_I18N__?.getMessage(i18nKey);

      textEl.textContent = message || status;

    } else {

      textEl.textContent = status;

    }

    // disconnected 时提取 error detail 显示在 title 中

    if (status === "disconnected" && detail && detail.error) {
      statusEl.title = detail.error;
    } else if (status === "llm_error" && detail && detail.detail) {
      statusEl.title = detail.detail;
    } else {
      statusEl.title = "";
    }

    // When the host (re)connects successfully, remove stale config-time
    // error bubbles (e.g. "No provider configured") that were appended
    // to the chat area on a previous failed config. They are no longer
    // relevant once the connection is healthy.
    if (status === "connected") {
      const staleErrors = els.messages.querySelectorAll(".agentao-msg--error");
      staleErrors.forEach((el) => el.remove());
      // If the chat area is now empty, restore the empty hint.
      if (els.messages.children.length === 0) {
        const hint = document.createElement("div");
        hint.className = "agentao-empty";
        hint.setAttribute("data-i18n", "emptyHint");
        hint.textContent =
          globalThis.__AIC_I18N__?.getMessage("emptyHint") ||
          "Agentao is ready. Type a message below to start.";
        els.messages.appendChild(hint);
      }
    }

  }

  // ── 发送消息 ────────────────────────────────────────────────────────

  function sendMessage() {

    const text = els.input.value.trim();

    const attachments = buildAttachmentsPayload();

    if ((!text && attachments.length === 0) || state.running) return;

    renderUserMessage(text || (globalThis.__AIC_I18N__?.getMessage("attachSent") || "Sent with attachments"));

    els.input.value = "";

    autoResize();

    clearAttachments();

    chrome.runtime.sendMessage({

      type: MSG.CHAT_SEND,

      sessionId: state.sessionId,

      prompt: text,

      attachments: attachments,

    });

    beginTurn();

  }

  function cancelTurn() {

    chrome.runtime.sendMessage({

      type: MSG.CHAT_CANCEL,

      sessionId: state.sessionId,

    });

  }

  // ── 附件处理 ────────────────────────────────────────────────────────

  function autoResize() {

    els.input.style.height = "auto";

    els.input.style.height = Math.min(els.input.scrollHeight, 120) + "px";

  }

  // ── 会话管理 ────────────────────────────────────────────────────────

  els.send.addEventListener("click", sendMessage);

  els.attach.addEventListener("click", () => {

    els.fileInput.click();

  });

  els.fileInput.addEventListener("change", async (e) => {

    const files = Array.from(e.target.files || []);

    for (const file of files) {

      await addAttachment(file);

    }

    els.fileInput.value = "";

  });

  els.stop.addEventListener("click", cancelTurn);

  els.input.addEventListener("input", autoResize);

  els.input.addEventListener("keydown", (e) => {

    if (e.key === "Enter" && !e.shiftKey) {

      e.preventDefault();

      sendMessage();

    }

  });

  // ask_user 弹窗隐藏

  els.permissionPrompt

    .querySelector(".agentao-btn--allow")

    .addEventListener("click", () => respondPermission(true));

  els.permissionPrompt

    .querySelector(".agentao-btn--deny")

    .addEventListener("click", () => respondPermission(false));

  // ask_user 弹窗关闭

  els.askUserPrompt

    .querySelector(".agentao-btn--allow")

    .addEventListener("click", () => {

      const input = els.askUserPrompt.querySelector(".agentao-prompt-input");

      respondAskUser(input.value);

    });

  els.askUserPrompt

    .querySelector(".agentao-btn--deny")

    .addEventListener("click", () => respondAskUser("[cancelled]"));

  els.askUserPrompt

    .querySelector(".agentao-prompt-input")

    .addEventListener("keydown", (e) => {

      if (e.key === "Enter") {

        e.preventDefault();

        const input = els.askUserPrompt.querySelector(".agentao-prompt-input");

        respondAskUser(input.value);

      }

    });

  // 响应 service worker 的消息

  chrome.runtime.onMessage.addListener((msg) => {

    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {

      case MSG.CHAT_EVENT:

        handleChatEvent(msg.event);

        break;

      case MSG.CHAT_TURN_END:
        finalizeThinkingBlock();

        if (msg.finalText && !state.currentAssistantText) {

          // 权限请求超时后自动拒绝，避免 pending promise 泄漏

          state.currentAssistantText = msg.finalText;

          const block = ensureAssistantBlock();

          block.innerHTML = renderMarkdown(msg.finalText);

        }

        if (msg.error) {

          appendError(msg.error);

        }

        endTurn();
        saveCurrentSession();

        break;

      case MSG.CHAT_ERROR:

        appendError(msg.message || "Unknown error");

        endTurn();

        break;

      case MSG.PERMISSION_REQUEST:

        showPermissionPrompt(msg);

        break;

      case MSG.ASK_USER_REQUEST:

        showAskUserPrompt(msg);

        break;

      case MSG.HOST_STATUS_CHANGED:

        updateHostStatus(msg.status, msg.detail);

        break;

      case MSG.HOST_ERROR:

        // 收到 HOST_STATUS_CHANGED 后更新状态栏显示

        // appendError 将错误信息追加到 DOM 消息区，不弹窗

        console.warn("[agentao] host error:", msg.message);

        break;

      case MSG.PING_SIDEPANEL:

        // service worker 转发 sidepanel 的消息

        break;

      default:

        break;

    }

  });

  // 监听 service worker 和 sidepanel 的消息

  // ── Session management ──────────────────────────────────────
  var SESSIONS_KEY = "agentaoSessionList";
  var SESSION_DATA_PREFIX = "agentao.session.data.";

  chrome.runtime.sendMessage({ type: MSG.PANEL_OPENED, tabId: null }).catch(() => {});

  // 当 service worker 推送 HOST_STATUS_CHANGED 时同步更新 sidepanel 状态

  // 接收到 HOST_STATUS_CHANGED 事件后更新状态栏

  chrome.runtime

    .sendMessage({ type: MSG.GET_HOST_STATUS })

    .then((resp) => {

      if (resp && resp.status) updateHostStatus(resp.status);

    })

    .catch(() => {});

  // 页面加载时主动查询

  // 恢复上次的活跃会话：读取存储的 activeSessionId 及对应会话数据，
  // 如果存在则恢复消息历史，否则保持新生成的空会话。
  (async function restoreLastSession() {
    try {
      const result = await chrome.storage.local.get([
        contract.session.ACTIVE_SESSION_ID_STORAGE_KEY,
      ]);
      const lastSessionId = result[contract.session.ACTIVE_SESSION_ID_STORAGE_KEY];
      if (!lastSessionId) return;

      const dataResult = await chrome.storage.local.get([
        SESSION_DATA_PREFIX + lastSessionId,
      ]);
      const data = dataResult[SESSION_DATA_PREFIX + lastSessionId];
      if (!data || !data.messages || data.messages.length === 0) return;

      // 恢复会话 ID 和消息
      state.sessionId = lastSessionId;
      els.messages.innerHTML = "";
      if (els.thinking) els.messages.appendChild(els.thinking);
      renderHistoryMessages(data.messages);
      scrollToBottom();

      // 通知宿主恢复历史，使 agent 拥有上下文
      var historyMessages = data.messages
        .filter(function (m) { return m.role === "user" || m.role === "assistant"; })
        .map(function (m) { return { role: m.role, content: m.role === "assistant" ? m.text.replace(/<[^>]+>/g, "") : m.text }; });
      chrome.runtime.sendMessage({
        type: MSG.RESTORE_HISTORY,
        sessionId: lastSessionId,
        messages: historyMessages,
      });
    } catch (err) {
      console.error("[agentao] restoreLastSession error:", err);
    }
  })();

  window.addEventListener("beforeunload", () => {

    // 关闭侧边栏时保存当前会话，并记录活跃 sessionId 以便下次恢复。
    // beforeunload 不会等待 Promise，所以直接同步收集消息并调
    // chrome.storage.local.set（浏览器会在卸载前排入写入队列）。
    // 仅在本会话有新内容（sessionDirty）时才写：否则会话数据与时间戳
    // 原样保留，历史列表显示的仍是最后一次真实对话的时间。
    try {
      var messages = state.sessionDirty ? collectMessages() : [];
      if (messages.length > 0 && state.sessionId) {
        var firstUser = messages.find(function(m) { return m.role === "user"; });
        var title = firstUser ? firstUser.text.slice(0, 40) : "Chat";
        var saveObj = {};
        saveObj[SESSION_DATA_PREFIX + state.sessionId] = {
          id: state.sessionId, title: title, messages: messages, ts: Date.now(),
        };
        saveObj[contract.session.ACTIVE_SESSION_ID_STORAGE_KEY] = state.sessionId;
        chrome.storage.local.set(saveObj);
      }
    } catch {}

    try {

      chrome.runtime.sendMessage({ type: MSG.PANEL_CLOSED });

    } catch {}

  });

  // ── 初始化 ─────────────────────────────────────────────────────────

  function openSettings() {

    chrome.runtime.openOptionsPage().catch(() => {});

  }

  // ── Session management helpers ──────────────────────────────

  function getSessionList() {
    return new Promise(function(resolve) {
      chrome.storage.local.get([SESSIONS_KEY], function(result) {
        resolve(result[SESSIONS_KEY] || []);
      });
    });
  }

  function saveSessionList(list) {
    return new Promise(function(resolve) {
      var obj = {};
      obj[SESSIONS_KEY] = list;
      chrome.storage.local.set(obj, function() { resolve(); });
    });
  }

  // ── 历史序列化与恢复渲染 ──────────────────────────────────────────────

  // 收集当前消息 DOM 为可序列化条目（saveCurrentSession 与 beforeunload 共用）。
  // 思考流（agentao-thinking-stream）保存正文并标记 kind:"stream"，恢复时重建为
  // 可折叠块；普通思考行（子智能体起止等）标记 kind:"note"，按普通行恢复。
  function collectMessages() {
    var messages = [];
    els.messages.querySelectorAll(".agentao-msg").forEach(function(el) {
      if (el.classList.contains("agentao-msg--user")) {
        messages.push({ role: "user", text: el.textContent });
      } else if (el.classList.contains("agentao-msg--assistant")) {
        messages.push({ role: "assistant", text: el.innerHTML });
      } else if (el.classList.contains("agentao-msg--tool")) {
        var name = el.querySelector(".agentao-tool-header");
        messages.push({ role: "tool", text: name ? name.textContent : "tool" });
      } else if (el.classList.contains("agentao-msg--thinking")) {
        if (el.classList.contains("agentao-thinking-stream")) {
          var body = el.querySelector(".agentao-thinking-body");
          messages.push({ role: "thinking", kind: "stream", text: body ? body.textContent : "" });
        } else {
          messages.push({ role: "thinking", kind: "note", text: el.textContent });
        }
      } else if (el.classList.contains("agentao-msg--error")) {
        messages.push({ role: "error", text: el.textContent });
      }
    });
    return messages;
  }

  // 按实时聊天相同的结构渲染历史消息（switchToSession 与 restoreLastSession
  // 共用）。思考流重建为可折叠块：默认收起（data-expanded="false"），点击标题
  // 可展开/收起——修复历史恢复后思考/调用过程整体展开且无法收起的问题。
  function renderHistoryMessages(messages) {
    (messages || []).forEach(function(m) {
      if (m.role === "user") {
        renderUserMessage(m.text);
      } else if (m.role === "assistant") {
        var block = document.createElement("div");
        block.className = "agentao-msg agentao-msg--assistant";
        block.innerHTML = m.text;
        els.messages.appendChild(block);
      } else if (m.role === "tool") {
        renderRestoredToolBlock(m.text);
      } else if (m.role === "thinking") {
        if (m.kind === "note") {
          if (m.text) appendMessage("agentao-msg--thinking", m.text);
        } else if (m.text) {
          // 旧格式记录无 kind：非空文本是思考流正文（旧版笔记恒为空串），
          // 统一按可折叠思考流恢复，保证旧历史也能收起。
          renderThinkingStream(m.text);
        }
      } else if (m.role === "error") {
        appendMessage("agentao-msg--error", m.text);
      }
    });
    // 恢复历史只是重建 DOM，不算新内容：清掉渲染过程中经
    // appendMessage 等入口误标的 dirty，避免关闭侧栏时把 ts 刷成当前时间。
    state.sessionDirty = false;
  }

  // 重建已结束的可折叠思考流块，结构与交互对齐实时渲染的
  // ensureThinkingBlock / finalizeThinkingBlock（标题取正文首行）。
  function renderThinkingStream(text) {
    clearEmptyHint();
    var block = document.createElement("div");
    block.className = "agentao-msg agentao-msg--thinking agentao-thinking-stream agentao-thinking-done";
    block.setAttribute("data-expanded", "false");
    var header = document.createElement("div");
    header.className = "agentao-thinking-header";
    header.innerHTML = '<span class="agentao-thinking-title"></span>' +
      '<svg class="agentao-thinking-toggle" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    var firstLine = (text || "").trim().split("\n")[0];
    header.querySelector(".agentao-thinking-title").textContent =
      firstLine ? firstLine.slice(0, 80) : (globalThis.__AIC_I18N__?.getMessage("statusThinking") || "Thinking");
    var body = document.createElement("div");
    body.className = "agentao-thinking-body";
    body.textContent = text || "";
    block.appendChild(header);
    block.appendChild(body);
    header.addEventListener("click", function() {
      var expanded = block.getAttribute("data-expanded") === "true";
      block.setAttribute("data-expanded", expanded ? "false" : "true");
    });
    els.messages.appendChild(block);
  }

  // 重建工具调用块。历史只保存头部文本（工具名+状态符），拆出状态符还原为
  // 状态徽标，使恢复后的块与实时渲染的结构一致。
  function renderRestoredToolBlock(text) {
    clearEmptyHint();
    var block = document.createElement("div");
    block.className = "agentao-msg agentao-msg--tool";
    var header = document.createElement("div");
    header.className = "agentao-tool-header";
    var match = /^(.*?)([✓✗⊘])\s*$/.exec((text || "").trim());
    header.textContent = match ? match[1] : (text || "tool");
    if (match) {
      var status = document.createElement("span");
      status.className = "agentao-tool-status agentao-tool-status--" +
        (match[2] === "✓" ? "ok" : match[2] === "✗" ? "error" : "cancelled");
      status.textContent = match[2];
      header.appendChild(status);
    }
    block.appendChild(header);
    els.messages.appendChild(block);
  }

  function saveCurrentSession() {
    if (!state.sessionId) return Promise.resolve();
    // 无新内容时跳过：不覆盖存储，也不刷新列表时间戳，让历史列表
    // 显示的始终是该会话最后一次真实对话的时间。
    if (!state.sessionDirty) return Promise.resolve();
    var messages = collectMessages();
    if (messages.length === 0) return Promise.resolve();
    // 消息已在上方同步收集完毕，此刻即可视为已保存；此后到异步写入
    // 完成之间若再产生新内容，会重新把 dirty 置 true，触发下一次保存。
    state.sessionDirty = false;

    var firstUser = messages.find(function(m) { return m.role === "user"; });
    var title = firstUser ? firstUser.text.slice(0, 40) : "Chat";
    var sessionData = { id: state.sessionId, title: title, messages: messages, ts: Date.now() };

    return getSessionList().then(function(list) {
      var existing = list.findIndex(function(s) { return s.id === state.sessionId; });
      if (existing >= 0) {
        list[existing].title = title;
        list[existing].ts = Date.now();
      } else {
        list.unshift({ id: state.sessionId, title: title, ts: Date.now() });
      }
      if (list.length > 50) list = list.slice(0, 50);
      var promises = [saveSessionList(list)];
      var dataObj = {};
      dataObj[SESSION_DATA_PREFIX + state.sessionId] = sessionData;
      promises.push(new Promise(function(resolve) { chrome.storage.local.set(dataObj, function() { resolve(); }); }));
      return Promise.all(promises);
    });
  }

  function loadSessionList() {
    return getSessionList().then(function(list) {
      if (!els.sessionsList) return;
      els.sessionsList.innerHTML = "";
      if (list.length === 0) {
        var empty = document.createElement("div");
        empty.className = "agentao-sessions-empty";
        empty.textContent = globalThis.__AIC_I18N__?.getMessage("noSessions") || "No recent chats";
        els.sessionsList.appendChild(empty);
        return;
      }
      list.forEach(function(s) {
        var item = document.createElement("div");
        item.className = "agentao-session-item";
        if (s.id === state.sessionId) item.classList.add("agentao-session-item--active");
        var titleEl = document.createElement("div");
        titleEl.className = "agentao-session-title";
        titleEl.textContent = s.title || "Chat";
        var timeEl = document.createElement("div");
        timeEl.className = "agentao-session-time";
        var d = new Date(s.ts);
        timeEl.textContent = d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
        var delBtn = document.createElement("button");
        delBtn.className = "agentao-session-del";
        delBtn.textContent = "\u00d7";
        delBtn.title = globalThis.__AIC_I18N__?.getMessage("delete") || "Delete";
        delBtn.addEventListener("click", function(e) { e.stopPropagation(); deleteSession(s.id); });
        item.appendChild(titleEl);
        item.appendChild(timeEl);
        item.appendChild(delBtn);
        item.addEventListener("click", function() { switchToSession(s.id); });
        els.sessionsList.appendChild(item);
      });
    });
  }

  function switchToSession(sessionId) {
    return new Promise(function(resolve) {
      chrome.storage.local.get([SESSION_DATA_PREFIX + sessionId], function(result) {
        var data = result[SESSION_DATA_PREFIX + sessionId];
        if (!data) { resolve(); return; }
        // Save current session first
        saveCurrentSession().then(function() {
          state.sessionId = sessionId;
          // 记录当前活跃会话 ID，以便侧边栏关闭后能恢复
          chrome.storage.local.set({
            [contract.session.ACTIVE_SESSION_ID_STORAGE_KEY]: sessionId,
          });
          // Clear messages
          els.messages.innerHTML = "";
          // Re-add thinking indicator
          if (els.thinking) els.messages.appendChild(els.thinking);
          // Render saved messages
          renderHistoryMessages(data.messages);
          scrollToBottom();
          toggleSessionsPanel(false);
          loadSessionList();
          // Send conversation history to the native host so the agent has context
          var historyMessages = data.messages
            .filter(function(m) { return m.role === "user" || m.role === "assistant"; })
            .map(function(m) { return { role: m.role, content: m.role === "assistant" ? m.text.replace(/<[^>]+>/g, "") : m.text }; });
          chrome.runtime.sendMessage({
            type: MSG.RESTORE_HISTORY,
            sessionId: sessionId,
            messages: historyMessages,
          });
          resolve();
        }).catch(function(err) { console.error("[agentao] switchToSession error:", err); resolve(); });
      });
    });
  }

  function deleteSession(sessionId) {
    getSessionList().then(function(list) {
      var newList = list.filter(function(s) { return s.id !== sessionId; });
      var promises = [saveSessionList(newList)];
      var delObj = {};
      delObj[SESSION_DATA_PREFIX + sessionId] = null;
      promises.push(new Promise(function(resolve) { chrome.storage.local.remove(SESSION_DATA_PREFIX + sessionId, function() { resolve(); }); }));
      return Promise.all(promises);
    }).then(function() { loadSessionList(); });
  }

  function startNewSession() {
    saveCurrentSession().then(function() {
      state.sessionId = generateSessionId();
      // 记录当前活跃会话 ID
      chrome.storage.local.set({
        [contract.session.ACTIVE_SESSION_ID_STORAGE_KEY]: state.sessionId,
      });
      state.currentAssistantText = "";
      state.currentThinkingText = "";
      state.thinkingBlock = null;
      // 新会话从空开始：复位脏标记，避免首次关闭侧栏时以当前时间落库
      state.sessionDirty = false;
      els.messages.innerHTML = "";
      if (els.thinking) els.messages.appendChild(els.thinking);
      var empty = document.createElement("div");
      empty.className = "agentao-empty";
      empty.setAttribute("data-i18n", "emptyHint");
      empty.textContent = globalThis.__AIC_I18N__?.getMessage("emptyHint") || "Agentao is ready. Type a message below to start.";
      els.messages.appendChild(empty);
      toggleSessionsPanel(false);
      loadSessionList();
      // Clear agent conversation history for the new session
      chrome.runtime.sendMessage({
        type: MSG.RESTORE_HISTORY,
        sessionId: state.sessionId,
        messages: [],
      });
      els.input.focus();
    }).catch(function(err) { console.error("[agentao] startNewSession error:", err); });
  }

  function toggleSessionsPanel(force) {
    if (!els.sessionsPanel) return;
    var isHidden = els.sessionsPanel.classList.contains("agentao-sessions-panel--hidden");
    var show = force !== undefined ? force : isHidden;
    if (show) {
      els.sessionsPanel.classList.remove("agentao-sessions-panel--hidden");
      loadSessionList();
    } else {
      els.sessionsPanel.classList.add("agentao-sessions-panel--hidden");
    }
  }

  async function refreshSetupBanner() {

    // 设置页打开时确保 API Key 已配置，否则显示引导条

    const stored = await chrome.storage.local.get([

      P.STORAGE_KEY,

      P.PROFILES_STORAGE_KEY,

      P.ACTIVE_PROFILE_STORAGE_KEY,

    ]);

    const profiles = stored[P.PROFILES_STORAGE_KEY] || [];

    const activeId = stored[P.ACTIVE_PROFILE_STORAGE_KEY];

    const active =

      profiles.find((p) => p[F.ID] === activeId) || profiles[0] || {};

    const snapshot = stored[P.STORAGE_KEY] || {};

    const apiKey = (active[F.API_KEY] || snapshot[F.API_KEY] || "").trim();

    if (apiKey) {

      els.setupBanner.classList.add("agentao-setup-banner--hidden");

    } else {

      els.setupBanner.classList.remove("agentao-setup-banner--hidden");

    }

  }

  if (els.openSettings) {

    els.openSettings.addEventListener("click", openSettings);
  if (els.sessionsBtn) {
    els.sessionsBtn.addEventListener("click", function(e) { e.stopPropagation(); toggleSessionsPanel(); });
  }
  if (els.newChatBtn) {
    els.newChatBtn.addEventListener("click", startNewSession);
  }
  document.addEventListener("click", function(e) {
    if (els.sessionsPanel && !els.sessionsPanel.classList.contains("agentao-sessions-panel--hidden")) {
      if (!els.sessionsPanel.contains(e.target) && !(els.sessionsBtn && els.sessionsBtn.contains(e.target))) {
        toggleSessionsPanel(false);
      }
    }
  });

  }

  if (els.setupOpenSettings) {

    els.setupOpenSettings.addEventListener("click", openSettings);

  }

  // 设置页关闭时保存配置

  chrome.storage.onChanged.addListener((changes, area) => {

    if (area !== "local") return; if (contract.ui.THEME_STORAGE_KEY in changes) { const _pref = changes[contract.ui.THEME_STORAGE_KEY].newValue; try { localStorage.setItem(contract.ui.THEME_STORAGE_KEY, _pref); } catch {} globalThis.__AIC_THEME__?.applyTheme(_pref); } if (contract.ui.PREFERRED_LOCALE_STORAGE_KEY in changes) { globalThis.__AIC_I18N__?.setLocale(changes[contract.ui.PREFERRED_LOCALE_STORAGE_KEY].newValue); }

    if (

      P.STORAGE_KEY in changes ||

      P.PROFILES_STORAGE_KEY in changes ||

      P.ACTIVE_PROFILE_STORAGE_KEY in changes

    ) {

      refreshSetupBanner();

    }

  });

  // 应用 i18n

  applyI18n();

  function applyI18n() {

    // 运行时 i18n：用 chrome.i18n 的消息替换 data-i18n 属性的元素

    document.querySelectorAll("[data-i18n]").forEach((el) => {

      const key = el.getAttribute("data-i18n");

      const message = globalThis.__AIC_I18N__?.getMessage(key);

      if (message) el.textContent = message;

    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {

      const key = el.getAttribute("data-i18n-placeholder");

      const message = globalThis.__AIC_I18N__?.getMessage(key);

      if (message) el.placeholder = message;

    });

  }

  // 页面卸载时清理

  els.input.focus();

  // 防止误触发送按钮，输入框聚焦时隐藏快捷操作

  refreshSetupBanner();

})();

