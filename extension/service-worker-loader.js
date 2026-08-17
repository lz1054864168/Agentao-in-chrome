// service-worker-loader.js
//
// Service Worker 入口。加载顺序：
// 1) agentao-contract.js   — 冻结契约（必须最先）
// 2) native-host-binding.js — connectNative 补丁（在首次连接前生效）
// 3) service-worker-runtime.js — 可维护运行时
//
// 参考 claw-in-chrome 的 service-worker-loader.js 模式：loader 只负责装配，
// 真正的运行时逻辑都在 service-worker-runtime.js 中。

import "./agentao-contract.js";
import "./native-host-binding.js";
import "./service-worker-runtime.js";

const runtimeApi = globalThis.__AIC_SERVICE_WORKER_RUNTIME__;
if (runtimeApi) {
  // 构造并启动运行时。运行时内部会注册 onMessage / onClicked / onCommand
  // 监听器，并尝试连接原生宿主。
  globalThis.__AIC_RUNTIME_INSTANCE__ = runtimeApi.createServiceWorkerRuntime({
    chrome,
    console,
  });
} else {
  console.error("[agentao] __AIC_SERVICE_WORKER_RUNTIME__ not found");
}
