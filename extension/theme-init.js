// theme-init.js
// 在页面渲染前根据 storage / 系统偏好设置 data-theme，避免闪烁。
// 同时读 localStorage（同步，避免闪烁）和 chrome.storage.local（跨页面同步源）。

(function () {
  const contract = globalThis.__AIC_CONTRACT__;
  const storageKey = contract?.ui?.THEME_STORAGE_KEY || "agentaoTheme";
  const themes = contract?.ui?.THEMES || { LIGHT: "light", DARK: "dark", AUTO: "auto" };

  function resolveTheme(preference) {
    if (preference === themes.DARK) return "dark";
    if (preference === themes.LIGHT) return "light";
    // auto / unset: 跟随系统
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(preference) {
    document.documentElement.setAttribute("data-theme", resolveTheme(preference));
  }

  // 导出供 sidepanel.js / options.js 复用
  globalThis.__AIC_THEME__ = { resolveTheme, applyTheme, storageKey };

  // 同步：先从 localStorage 读（避免闪烁）
  try {
    applyTheme(localStorage.getItem(storageKey));
  } catch {
    applyTheme(null);
  }

  // 异步：从 chrome.storage.local 校正（跨页面同步的权威源）
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get([storageKey]).then((stored) => {
        const pref = stored[storageKey];
        if (pref) {
          try { localStorage.setItem(storageKey, pref); } catch {}
          applyTheme(pref);
        }
      });
    }
  } catch {}
})();
