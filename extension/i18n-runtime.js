// i18n-runtime.js
// 运行时国际化：支持在设置页切换语言后立即生效，无需依赖 chrome.i18n 的 UI 语言。
// 从 _locales/<locale>/messages.json 异步加载消息表，提供 getMessage / apply / setLocale。

(function () {
  const contract = globalThis.__AIC_CONTRACT__;
  const localeKey =
    contract?.ui?.PREFERRED_LOCALE_STORAGE_KEY || "agentaoPreferredLocale";

  const SUPPORTED = ["en", "zh-CN"];
  const DIR_MAP = { en: "en", "zh-CN": "zh_CN" };

  let messages = {};
  let currentLocale = null;
  let loaded = false;

  function normalizeLocale(l) {
    if (!l) return null;
    const norm = String(l).replace("_", "-");
    if (SUPPORTED.includes(norm)) return norm;
    if (norm.toLowerCase().startsWith("zh")) return "zh-CN";
    if (norm.toLowerCase().startsWith("en")) return "en";
    return null;
  }

  async function loadLocale(locale) {
    const dir = DIR_MAP[locale] || "en";
    try {
      const url = chrome.runtime.getURL("_locales/" + dir + "/messages.json");
      const resp = await fetch(url);
      const text = await resp.text();
      const data = JSON.parse(text);
      const map = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v.message === "string") map[k] = v.message;
      }
      return map;
    } catch (e) {
      console.error("[i18n] loadLocale failed:", locale, e);
      return {};
    }
  }

  function getMessage(key) {
    if (messages[key]) return messages[key];
    try {
      return chrome.i18n?.getMessage(key) || "";
    } catch {
      return "";
    }
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const message = getMessage(key);
      if (message) el.textContent = message;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const message = getMessage(key);
      if (message) el.placeholder = message;
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      const message = getMessage(key);
      if (message) el.title = message;
    });
  }

  async function setLocale(locale) {
    const norm = normalizeLocale(locale) || "en";
    if (currentLocale === norm && loaded) {
      apply();
      return;
    }
    messages = await loadLocale(norm);
    currentLocale = norm;
    loaded = true;
    apply();
  }

  function getLocale() {
    return currentLocale;
  }

  async function init() {
    let pref = null;
    try {
      const stored = await chrome.storage.local.get([localeKey]);
      pref = stored[localeKey];
    } catch {}
    const locale =
      normalizeLocale(pref) ||
      normalizeLocale(
        typeof chrome.i18n?.getUILanguage === "function"
          ? chrome.i18n.getUILanguage()
          : null
      ) ||
      "en";
    await setLocale(locale);
  }

  globalThis.__AIC_I18N__ = {
    getMessage,
    apply,
    setLocale,
    getLocale,
    init,
    normalizeLocale,
  };

  init();
})();
