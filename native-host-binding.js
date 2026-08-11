// native-host-binding.js
//
// 参考 claw-in-chrome 的 native-host-binding.js：在 chrome.runtime.connectNative
// 外包一层，首次连接目标宿主时发送一条 binding_hello，让宿主知道是哪个浏览器
// 实例、哪个扩展版本在连接。绑定上报失败不影响原本的 native messaging 行为。

(function () {
  const runtimeApi = globalThis.chrome?.runtime;
  if (!runtimeApi || typeof runtimeApi.connectNative !== "function") {
    return;
  }

  if (globalThis.__AIC_NATIVE_HOST_BINDING_PATCHED__) {
    return;
  }
  globalThis.__AIC_NATIVE_HOST_BINDING_PATCHED__ = true;

  const contract = globalThis.__AIC_CONTRACT__;
  const nativeMessagingContract = contract?.nativeMessaging || {};
  const hostName =
    nativeMessagingContract.HOST_NAME || "com.agentao.chrome_extension";
  const bindingMessageType = nativeMessagingContract.BINDING_TYPE || "binding_hello";
  const bindingProtocolVersion =
    nativeMessagingContract.BINDING_PROTOCOL_VERSION || 1;
  const instanceIdStorageKey =
    nativeMessagingContract.BINDING_INSTANCE_ID_STORAGE_KEY ||
    "agentao.nativeHostBinding.instanceId.v1";
  let instanceIdPromise = null;

  const originalConnectNative = runtimeApi.connectNative.bind(runtimeApi);
  runtimeApi.connectNative = function patchedConnectNative(targetHostName) {
    const port = originalConnectNative(...arguments);
    if (
      typeof targetHostName === "string" &&
      targetHostName === hostName &&
      port &&
      typeof port.postMessage === "function"
    ) {
      // 不阻塞主链路；绑定上报失败也不能影响原本的 native messaging 行为。
      void sendBindingHello(port, targetHostName);
    }
    return port;
  };

  async function sendBindingHello(port, targetHostName) {
    try {
      port.postMessage({
        type: bindingMessageType,
        protocolVersion: bindingProtocolVersion,
        browser: await detectBrowser(),
        extensionId: runtimeApi.id,
        extensionVersion: runtimeApi.getManifest?.()?.version,
        hostName: targetHostName,
        instanceId: await getOrCreateInstanceId(),
      });
    } catch {}
  }

  async function getOrCreateInstanceId() {
    if (!instanceIdPromise) {
      instanceIdPromise = (async () => {
        const existing = await storageLocalGet(instanceIdStorageKey);
        const persisted = normalizeNonEmptyString(existing?.[instanceIdStorageKey]);
        if (persisted) {
          return persisted;
        }

        const created =
          typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID()
            : `binding-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await storageLocalSet({ [instanceIdStorageKey]: created });
        return created;
      })();
    }

    return instanceIdPromise;
  }

  async function detectBrowser() {
    const brandText = readBrandText();
    const userAgent = navigator?.userAgent || "";

    if (/microsoft edge/i.test(brandText) || /\bedg\//i.test(userAgent)) {
      return "edge";
    }
    if (/opera/i.test(brandText) || /\bopr\//i.test(userAgent)) {
      return "opera";
    }
    if (/vivaldi/i.test(brandText) || /vivaldi/i.test(userAgent)) {
      return "vivaldi";
    }
    if (/arc/i.test(brandText) || /\barc\//i.test(userAgent)) {
      return "arc";
    }
    try {
      if (navigator?.brave && typeof navigator.brave.isBrave === "function") {
        if (await navigator.brave.isBrave()) {
          return "brave";
        }
      }
    } catch {}
    if (/chromium/i.test(brandText) && !/google chrome/i.test(brandText)) {
      return "chromium";
    }
    return "chrome";
  }

  function readBrandText() {
    const brands = navigator?.userAgentData?.brands;
    if (!Array.isArray(brands)) {
      return "";
    }
    return brands
      .map((entry) => normalizeNonEmptyString(entry?.brand) || "")
      .filter(Boolean)
      .join(" ");
  }

  function storageLocalGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (value) => {
          resolve(value || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function storageLocalSet(value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(value, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function normalizeNonEmptyString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
})();
