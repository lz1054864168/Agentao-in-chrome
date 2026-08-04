# Agentao Browser Extension

> 🤖 基于 [Agentao](https://github.com/your-repo/agentao) 的智能浏览器插件，让 AI 代理赋能您的浏览体验。

---

## 📖 简介

本项目是一个浏览器插件，深度集成 **Agentao** 框架，将多智能体协作能力直接带入浏览器环境。您可以在网页上下文中调用 AI 代理，执行自动化任务、信息提取、内容生成、智能问答等操作，所有交互均在侧边栏或弹出窗口中完成，无需离开当前页面。

---

## ✨ 主要功能

- **智能侧边栏**：在任意网页上呼出 Agentao 对话面板，与 AI 代理实时交流。
- **上下文感知**：自动捕获当前页面的标题、URL、选中的文本或 DOM 结构，作为代理的输入上下文。
- **多代理协作**：支持同时运行多个专用代理（如摘要代理、翻译代理、代码生成代理），并查看它们之间的消息流转。
- **自定义工作流**：通过 Agentao 的 `Pipeline` 和 `Tool` 接口，配置一键执行的自动化任务（如“总结本文并生成推文”）。
- **本地/云端模型支持**：可连接 OpenAI、Anthropic、Ollama 等 API，或使用浏览器内置的 WebLLM 运行本地模型。
- **历史记录与书签**：保存对话历史和常用提示词，支持快速复用。

---

## 🛠️ 技术栈

- **核心框架**：Agentao (TypeScript)
- **浏览器 API**：Manifest V3 (Chrome / Edge / Firefox)
- **UI 组件**：React + Tailwind CSS
- **状态管理**：Zustand
- **构建工具**：Vite + SWC

---

## 📦 安装指南

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/your-username/agentao-browser-extension.git
cd agentao-browser-extension

# 安装依赖
pnpm install

# 构建插件（输出到 dist/ 目录）
pnpm build