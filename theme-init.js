// theme-init.js
// 在页面渲染前根据 storage / 系统偏好设置 data-theme，避免闪烁。
// 参考 claw-in-chrome 的 theme-init.js 模式。

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

  try {
    const stored = localStorage.getItem(storageKey);
    const resolved = resolveTheme(stored);
    document.documentElement.setAttribute("data-theme", resolved);
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
