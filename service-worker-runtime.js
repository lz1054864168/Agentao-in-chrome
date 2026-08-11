// service-worker-runtime.js






//






// Service Worker 可维护运行时。职责：






// 1) 管理与 Python 原生宿主的 Native Messaging 连接（连接 / 重连 / 心跳）






// 2) 在 sidepanel <-> 宿主 之间路由消息






// 3) 管理权限确认 / ask_user 的 pending promise（按 requestId 对账）






// 4) 从 chrome.storage 读取配置并推送给宿主






//






// 参考 claw-in-chrome 的 service-worker-runtime.js 模式：通过 globalThis






// 挂载点暴露 API，由 service-worker-loader.js 装配。






//






// 设计原则：






// - 所有 message type / storage key / 字段名都从 __AIC_CONTRACT__ 读取，不硬编码






// - 宿主断连时自动重连，但指数退避






// - 权限 / ask_user 请求有超时兜底，避免 pending promise 泄漏













(function () {






  const contract = globalThis.__AIC_CONTRACT__;






  if (!contract) {






    console.error("[agentao] __AIC_CONTRACT__ not found; load agentao-contract.js first");






    return;






  }













  const HOST_NAME = contract.nativeMessaging.HOST_NAME;






  const MSG = contract.messages;






  const HOST = contract.host;













  // ── NativeHostConnection ─────────────────────────────────────────────






  // 封装 chrome.runtime.Port，处理连接生命周期与入站消息分发。













  class NativeHostConnection {






    constructor({ chrome, console }) {






      this._chrome = chrome;






      this._console = console;






      this._port = null;






      this._status = "disconnected"; // disconnected | connecting | connected






      this._listeners = new Set(); // (msg) => void






      this._statusListeners = new Set(); // (status, detail?) => void






      this._reconnectAttempts = 0;






      this._reconnectTimer = null;






      this._shouldReconnect = true;






    }













    get status() {






      return this._status;






    }













    onMessage(listener) {






      this._listeners.add(listener);






      return () => this._listeners.delete(listener);






    }













    onStatusChange(listener) {






      this._statusListeners.add(listener);






      return () => this._statusListeners.delete(listener);






    }













    _setStatus(status, detail) {






      this._status = status;






      for (const listener of this._statusListeners) {






        try {






          listener(status, detail);






        } catch (err) {






          this._console.error("[agentao] status listener error:", err);






        }






      }






    }













    connect() {






      if (this._port) {






        return;






      }






      this._shouldReconnect = true;






      this._setStatus("connecting");






      try {






        this._port = this._chrome.runtime.connectNative(HOST_NAME);






      } catch (err) {






        this._setStatus("disconnected", { error: String(err) });






        this._scheduleReconnect();






        return;






      }













      this._port.onMessage.addListener((msg) => {






        for (const listener of this._listeners) {






          try {






            listener(msg);






          } catch (err) {






            this._console.error("[agentao] message listener error:", err);






          }






        }






      });













      this._port.onDisconnect.addListener(() => {






        const lastError = this._chrome.runtime.lastError;






        this._port = null;






        this._setStatus("disconnected", {






          error: lastError?.message || "native host disconnected",






        });






        if (this._shouldReconnect) {






          this._scheduleReconnect();






        }






      });













      // connectNative 成功即视为 connecting -> connected；






      // 宿主会随后发送 ready 消息，但端口建立本身就可发消息了。






      // connectNative 成功：端口已建立，但保持 "connecting" 状态。
      // 等 host 发回 LLM_STATUS "ok" 后才设为 "connected"。
      // READY 消息也会兜底设为 connected（兼容旧版 host）。






      this._reconnectAttempts = 0;






    }













    disconnect() {






      this._shouldReconnect = false;






      if (this._reconnectTimer) {






        clearTimeout(this._reconnectTimer);






        this._reconnectTimer = null;






      }






      if (this._port) {






        try {






          this._port.disconnect();






        } catch {}






        this._port = null;






      }






      this._setStatus("disconnected");






    }













    postMessage(message) {






      if (!this._port) {






        this._console.warn("[agentao] postMessage while disconnected:", message?.type);






        return false;






      }






      try {






        this._port.postMessage(message);






        return true;






      } catch (err) {






        this._console.error("[agentao] postMessage failed:", err);






        return false;






      }






    }













    _scheduleReconnect() {






      if (this._reconnectTimer || !this._shouldReconnect) {






        return;






      }






      this._reconnectAttempts += 1;






      // 指数退避：1s, 2s, 4s, 8s, ... 上限 30s






      const delay = Math.min(30000, 1000 * Math.pow(2, this._reconnectAttempts - 1));






      this._reconnectTimer = setTimeout(() => {






        this._reconnectTimer = null;






        this.connect();






      }, delay);






    }






  }













  // ── ServiceWorkerRuntime ─────────────────────────────────────────────






  // 装配 sidepanel <-> 宿主 的消息路由与 pending promise 管理。













  class ServiceWorkerRuntime {






    constructor({ chrome, console }) {






      this._chrome = chrome;






      this._console = console;






      this._connection = new NativeHostConnection({ chrome, console });






      this._pendingPermission = new Map(); // requestId -> { resolve, reject, timer }






      this._pendingAskUser = new Map(); // requestId -> { resolve, reject, timer }






      this._activeTabId = null; // 当前打开 sidepanel 的 tab














      this._requestTimeoutMs = 60000; // 权限 / ask_user 超时












      this._connection.onMessage((msg) => this._onHostMessage(msg));






      this._connection.onStatusChange((status, detail) =>






        this._onHostStatusChange(status, detail)






      );













      this._registerListeners();






    }













    _registerListeners() {






      // sidepanel / options -> service worker






      this._chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {






        this._onRuntimeMessage(msg, sender, sendResponse);






        return true; // 异步响应






      });













      // action 点击打开 sidepanel






      this._chrome.action.onClicked.addListener((tab) => {






        this._openSidePanel(tab.id);






      });













      // 快捷键






      if (this._chrome.commands) {






        this._chrome.commands.onCommand.addListener((command) => {






          if (command === "toggle-side-panel") {






            this._toggleSidePanel();






          }






        });






      }













      // Service Worker 启动时尝试连接宿主






      this._connection.connect();






    }













    _openSidePanel(tabId) {






      this._activeTabId = tabId;






      this._chrome.sidePanel






        .open({ tabId })






        .catch((err) => this._console.error("[agentao] sidePanel.open failed:", err));






      // 把当前标签加入名为 Agentao 的标签组，与 claw-in-chrome 行为一致






      this._groupTab(tabId);






    }













    _groupTab(tabId) {






      const chrome = this._chrome;






      const GROUP_TITLE = "Agentao";






      const GROUP_COLOR = "blue";






      (async () => {






        try {






          const tab = await chrome.tabs.get(tabId);






          // 已在任意组中则不重复操作






          if (






            tab.groupId !== undefined &&






            tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE






          ) {






            return;






          }






          const groupId = await chrome.tabs.group({ tabIds: [tabId] });






          await chrome.tabGroups.update(groupId, {






            title: GROUP_TITLE,






            color: GROUP_COLOR,






            collapsed: false,






          });






        } catch (err) {






          this._console.error("[agentao] tab grouping failed:", err);






        }






      })();






    }













    _toggleSidePanel() {






      if (this._activeTabId != null) {






        // 切换：已打开则关闭靠 sidePanel API 自身行为，这里只重新打开






        this._openSidePanel(this._activeTabId);






      }






    }













    _onRuntimeMessage(msg, sender, sendResponse) {






      if (!msg || typeof msg.type !== "string") {






        return;






      }













      switch (msg.type) {






      case MSG.PING_SIDEPANEL:





        sendResponse({ success: true, tabId: this._activeTabId });





        return;











      case MSG.GET_HOST_STATUS:





        sendResponse({ success: true, status: this._connection.status });





        return;













        case MSG.PANEL_OPENED:






          this._activeTabId = msg.tabId ?? sender.tab?.id ?? null;






          // sidepanel 打开时确保宿主已连接，并推送当前配置






          this._ensureConnectedAndPushConfig();






          sendResponse({ success: true });






          return;













        case MSG.PANEL_CLOSED:






          sendResponse({ success: true });






          return;













        case MSG.CHAT_SEND:






          this._handleChatSend(msg);






          sendResponse({ success: true });






          return;













        case MSG.CHAT_CANCEL:






          this._connection.postMessage({






            type: HOST.CHAT_CANCEL,






            sessionId: msg.sessionId,






          });






          sendResponse({ success: true });






          return;













        case MSG.PERMISSION_RESPONSE:






          this._connection.postMessage({






            type: HOST.PERMISSION_RESPONSE,






            requestId: msg.requestId,






            allowed: msg.allowed,






          });






          sendResponse({ success: true });






          return;













        case MSG.ASK_USER_RESPONSE:






          this._connection.postMessage({






            type: HOST.ASK_USER_RESPONSE,






            requestId: msg.requestId,






            answer: msg.answer,






          });






          sendResponse({ success: true });






          return;













        case MSG.CONFIG_UPDATED:






          // Reset to connecting: host will send LLM_STATUS to update
          // to connected or llm_error after re-checking the endpoint.
          this._connection._setStatus("connecting");
          this._ensureConnectedAndPushConfig();






          sendResponse({ success: true });






          return;













        case MSG.STOP_AGENT:






          this._connection.postMessage({ type: HOST.CHAT_CANCEL, sessionId: msg.sessionId });






          sendResponse({ success: true });






          return;













        default:






          // 未知消息类型静默忽略






          return;






      }






    }













    _handleChatSend(msg) {






      this._connection.postMessage({






        type: HOST.CHAT,






        sessionId: msg.sessionId,






        prompt: msg.prompt,






        images: msg.images || [],






        attachments: msg.attachments || [],






      });






    }













    async _ensureConnectedAndPushConfig() {






      if (this._connection.status !== "connected") {






        this._connection.connect();






      }






      await this._pushConfigToHost();






    }













    async _pushConfigToHost() {






      const config = await this._loadConfig();






      this._connection.postMessage({






        type: HOST.CONFIG,






        provider: config.provider,






        permissionMode: config.permissionMode,






        workingDirectory: config.workingDirectory,






      });






    }













    async _loadConfig() {






      const contractProvider = contract.provider;






      const keys = [






        contractProvider.STORAGE_KEY,






        contractProvider.ACTIVE_PROFILE_STORAGE_KEY,






        contractProvider.PROFILES_STORAGE_KEY,






        contract.permission.MODE_STORAGE_KEY,






        contract.session.WORKING_DIRECTORY_STORAGE_KEY,






      ];






      const stored = await this._chrome.storage.local.get(keys);













      const profiles = stored[contractProvider.PROFILES_STORAGE_KEY] || [];






      const activeProfileId = stored[contractProvider.ACTIVE_PROFILE_STORAGE_KEY];






      const activeProfile =






        profiles.find((p) => p[contractProvider.FIELDS.ID] === activeProfileId) ||






        profiles[0] ||






        null;













      return {






        provider: activeProfile






          ? {






              format: activeProfile[contractProvider.FIELDS.FORMAT] || "openai",






              baseUrl: activeProfile[contractProvider.FIELDS.BASE_URL] || "",






              apiKey: activeProfile[contractProvider.FIELDS.API_KEY] || "",






              model: activeProfile[contractProvider.FIELDS.MODEL] || "",





              vision: activeProfile[contractProvider.FIELDS.VISION] === true,





              temperature: activeProfile[contractProvider.FIELDS.TEMPERATURE],





              maxTokens: activeProfile[contractProvider.FIELDS.MAX_TOKENS],






            }






          : null,






        permissionMode:






          stored[contract.permission.MODE_STORAGE_KEY] ||






          contract.permission.MODES.WORKSPACE_WRITE,






        workingDirectory:






          stored[contract.session.WORKING_DIRECTORY_STORAGE_KEY] || "",






      };






    }













    _onHostMessage(msg) {






      if (!msg || typeof msg.type !== "string") {






        return;






      }













      switch (msg.type) {






        case HOST.READY:
      // 宿主启动完成，推送配置。
      // 兜底设为 connected：兼容不发 LLM_STATUS 的旧版 host。
      // 新版 host 会在 _rebuild_agent 后发 LLM_STATUS 覆盖此状态。
      this._pushConfigToHost();
      this._connection._setStatus("connected");
      return;













        case HOST.CHAT_EVENT:











          this._broadcastToSidepanel({











            type: MSG.CHAT_EVENT,











            event: msg.event,











            sessionId: msg.sessionId,











          });











          return;












        case HOST.TURN_END:











          this._broadcastToSidepanel({





            type: MSG.CHAT_TURN_END,






            sessionId: msg.sessionId,






            finalText: msg.finalText,






            status: msg.status,






            toolCount: msg.toolCount,






            incompleteReason: msg.incompleteReason,






            error: msg.error,






          });






          return;













        case HOST.ERROR:






          this._broadcastToSidepanel({






            type: MSG.CHAT_ERROR,






            message: msg.message,






            detail: msg.detail,






            sessionId: msg.sessionId,






          });






          return;













        case HOST.PERMISSION_REQUEST:






          this._handlePermissionRequest(msg);






          return;













        case HOST.ASK_USER_REQUEST:






          this._handleAskUserRequest(msg);






          return;













        case HOST.BROWSER_REQUEST:






          this._handleBrowserRequest(msg);






          return;













        case HOST.LOG:
      this._log(msg.level, msg.message);
      return;
    case HOST.LLM_STATUS:
      if (msg.status === "ok") {
        this._connection._setStatus("connected");
      } else {
        this._connection._setStatus("llm_error", { detail: msg.detail || "LLM unreachable" });
      }
      return;













        default:






          this._console.warn("[agentao] unknown host message type:", msg.type);






      }






    }













    _handlePermissionRequest(msg) {






      const requestId = msg.requestId;






      if (!requestId) {






        this._console.warn("[agentao] permission request without requestId");






        return;






      }













      // 转发给 sidepanel；sidepanel 会回 PERMISSION_RESPONSE






      this._broadcastToSidepanel({






        type: MSG.PERMISSION_REQUEST,






        requestId,






        toolName: msg.toolName,






        description: msg.description,






        args: msg.args,






      });













      // 超时兜底：超时后按拒绝收口






      const timer = setTimeout(() => {






        if (this._pendingPermission.has(requestId)) {






          this._pendingPermission.delete(requestId);






          this._connection.postMessage({






            type: HOST.PERMISSION_RESPONSE,






            requestId,






            allowed: false,






          });






        }






      }, this._requestTimeoutMs);






      this._pendingPermission.set(requestId, { timer });






    }













    _handleAskUserRequest(msg) {






      const requestId = msg.requestId;






      if (!requestId) {






        this._console.warn("[agentao] ask_user request without requestId");






        return;






      }













      this._broadcastToSidepanel({






        type: MSG.ASK_USER_REQUEST,






        requestId,






        question: msg.question,






        header: msg.header,






        options: msg.options,






        multiple: msg.multiple,






        allowCustom: msg.allowCustom,






      });













      const timer = setTimeout(() => {






        if (this._pendingAskUser.has(requestId)) {






          this._pendingAskUser.delete(requestId);






          this._connection.postMessage({






            type: HOST.ASK_USER_RESPONSE,






            requestId,






            answer: "[timeout]",






          });






        }






      }, this._requestTimeoutMs);






      this._pendingAskUser.set(requestId, { timer });






    }













    // ── 浏览器工具：宿主发来 browser_request，SW 用 chrome.debugger 执行 CDP ──













    async _handleBrowserRequest(msg) {






      const requestId = msg.requestId;






      if (!requestId) {






        this._console.warn("[agentao] browser_request without requestId");






        return;






      }













      let response;






      try {






        response = await this._executeBrowserAction(msg.action || "", msg.params || {});






      } catch (err) {






        response = { ok: false, error: String(err && err.message || err) };






      }






      this._connection.postMessage({






        type: HOST.BROWSER_RESPONSE,






        requestId,






        response,






      });






    }













    async _executeBrowserAction(action, params) {






      // Get the active tab.






      const tabs = await this._chrome.tabs.query({ active: true, currentWindow: true });






      if (!tabs || !tabs.length) {






        return { ok: false, error: "no active tab" };






      }






      const tabId = tabs[0].id;













      if (action === "navigate") {






        const url = String(params.url || "");






        if (!url) return { ok: false, error: "url is required" };






        await this._chrome.tabs.update(tabId, { url });






        // Wait for the tab to finish loading (best-effort, 15s cap).






        await this._waitForTabLoad(tabId, 15000);






        return { ok: true, data: { url, title: tabs[0].title || "" } };






      }













      if (action === "screenshot") {






        const format = params.format === "jpeg" ? "jpeg" : "png";






        const data = await this._cdpScreenshot(tabId, format);






        return { ok: true, data };






      }













      if (action === "eval") {






        const expression = String(params.expression || "");






        if (!expression) return { ok: false, error: "expression is required" };






        const result = await this._cdpEval(tabId, expression);






        return { ok: true, data: result };






      }













      if (action === "click") {






        const selector = String(params.selector || "");






        if (!selector) return { ok: false, error: "selector is required" };






        const result = await this._cdpClick(tabId, selector);






        return { ok: true, data: result };






      }













      return { ok: false, error: "unknown action: " + action };






    }













    _waitForTabLoad(tabId, timeoutMs) {






      return new Promise((resolve) => {






        let done = false;






        const finish = () => {






          if (done) return;






          done = true;






          this._chrome.tabs.onUpdated.removeListener(listener);






          clearTimeout(timer);






          resolve();






        };






        const listener = (id, info) => {






          if (id === tabId && info.status === "complete") finish();






        };






        this._chrome.tabs.onUpdated.addListener(listener);






        const timer = setTimeout(finish, timeoutMs);






      });






    }













    _cdpAttach(tabId) {






      return new Promise((resolve, reject) => {






        this._chrome.debugger.attach({ tabId }, "1.3", () => {






          const err = this._chrome.runtime.lastError;






          if (err) {






            // Already attached is fine.






            if (String(err.message).includes("Already attached")) {






              resolve({ tabId, alreadyAttached: true });






            } else {






              reject(err);






            }






          } else {






            resolve({ tabId, alreadyAttached: false });






          }






        });






      });






    }













    _cdpDetach(session, suppressError) {






      if (session && !session.alreadyAttached) {






        return new Promise((resolve) => {






          this._chrome.debugger.detach({ tabId: session.tabId }, () => {






            if (!suppressError && this._chrome.runtime.lastError) {






              // ignore






            }






            resolve();






          });






        });






      }






      return Promise.resolve();






    }













    _cdpSendCommand(session, method, params) {






      return new Promise((resolve, reject) => {






        this._chrome.debugger.sendCommand({ tabId: session.tabId }, method, params || {}, (result) => {






          const err = this._chrome.runtime.lastError;






          if (err) reject(err);






          else resolve(result);






        });






      });






    }













    async _cdpScreenshot(tabId, format) {






      const session = await this._cdpAttach(tabId);






      try {






        const result = await this._cdpSendCommand(session, "Page.captureScreenshot", {






          format,






          quality: format === "jpeg" ? 80 : undefined,






        });






        const dataUri = "data:image/" + format + ";base64," + result.data;






        return dataUri;






      } finally {






        await this._cdpDetach(session, true);






      }






    }













    async _cdpEval(tabId, expression) {






      const session = await this._cdpAttach(tabId);






      try {






        const result = await this._cdpSendCommand(session, "Runtime.evaluate", {






          expression,






          returnByValue: true,






          awaitPromise: true,






        });






        if (result.exceptionDetails) {






          throw new Error(result.exceptionDetails.exception






            ? result.exceptionDetails.exception.description






            : "eval error");






        }






        return result.result ? result.result.value : undefined;






      } finally {






        await this._cdpDetach(session, true);






      }






    }













    async _cdpClick(tabId, selector) {






      // Click via injected JS: scroll into view + dispatch click event.






      const expr = "(function(){var el=document.querySelector(" + JSON.stringify(selector) + ");if(!el){throw new Error('element not found: " + selector.replace(/'/g, "") + "');}el.scrollIntoView({block:'center'});el.click();return 'clicked';})()";






      const result = await this._cdpEval(tabId, expr);






      return result;






    }













    _onHostStatusChange(status, detail) {






      const message = MSG.HOST_STATUS_CHANGED;






      let type = MSG.HOST_DISCONNECTED;
      if (status === "connecting") type = MSG.HOST_CONNECTING;
      else if (status === "connected") type = MSG.HOST_CONNECTED;
      else if (status === "disconnected") type = MSG.HOST_DISCONNECTED;
      else if (status === "llm_error") type = MSG.LLM_STATUS_CHANGED;













      this._broadcastToSidepanel({






        type: message,






        status,






        detail: detail || null,






      });













      if (status === "disconnected" && detail?.error) {
      this._broadcastToSidepanel({
        type: MSG.HOST_ERROR,
        message: detail.error,
      });
    }
    if (status === "llm_error" && detail?.detail) {
      this._broadcastToSidepanel({
        type: MSG.HOST_ERROR,
        message: detail.detail,
      });
    }






    }













    _broadcastToSidepanel(message) {






      try {






        this._chrome.runtime.sendMessage(message).catch(() => {






          // sidepanel 未打开时 sendMessage 会失败，静默忽略






        });






      } catch {






        // 忽略






      }






    }













    _log(level, message) {






      const prefix = "[agentao host]";






      if (level === "error") this._console.error(prefix, message);






      else if (level === "warn") this._console.warn(prefix, message);






      else this._console.log(prefix, message);






    }






  }













  // ── 装配 ─────────────────────────────────────────────────────────────






  // 暴露到 globalThis，供 service-worker-loader.js 使用。













  globalThis.__AIC_SERVICE_WORKER_RUNTIME__ = {






    ServiceWorkerRuntime,






    NativeHostConnection,






    createServiceWorkerRuntime({ chrome, console }) {






      return new ServiceWorkerRuntime({ chrome, console });






    },






  };






})();






