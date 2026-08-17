# Agentao in Chrome

<div align="center">

![Agentao in Chrome](https://img.shields.io/badge/Agentao-in%20Chrome-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.1.0-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome%20116%2B-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

</div>

简体中文 | [English](./README_EN.md)

把 [Agentao](https://github.com/jin-bo/agentao)（一个本地优先、隐私优先、可嵌入的受治理智能体运行时）放进 Chrome 侧边栏。浏览网页时直接与自己的模型供应商对话，并把浏览器内的操作能力交给 AI。

> **"Order in Chaos, Path in Intelligence."**

---

## 📖 项目简介

**Agentao in Chrome** 是一个 Chrome MV3 扩展，它把 Agentao 智能体运行时嵌入到浏览器侧边栏中。你可以在浏览任意网页时，唤出侧边栏与自己的大模型对话，并让 AI 直接操作当前页面——导航、截图、读取 DOM、点击元素，甚至自动填报表单。

与云端 Agent 产品不同，本项目**所有 LLM 调用与工具执行都在本地完成**：扩展只是一个 UI 外壳，真正的智能体运行时跑在你机器上的一个本地进程（原生宿主）里。你的 API Key、对话内容、工作区文件都不会经过任何第三方服务器（除了你自己的模型供应商）。

### 核心定位

- **本地优先**：智能体运行时跑在本地 Python 进程中，不依赖任何云端 Agent 服务。
- **隐私优先**：凭据仅存储在 `chrome.storage.local`，只发送给你配置的模型供应商。
- **受治理**：继承 Agentao 的权限引擎，工具执行前可要求人工确认，超时即拒绝（fail-closed）。
- **可嵌入**：通过 Agentao 的纯注入式 API 构造运行时，不修改 Agentao 本身，只依赖其公开嵌入接口。

---

## ✨ 功能亮点

### 🧠 Agentao 受治理运行时

后端由 [agentao](https://github.com/jin-bo/agentao) 驱动，完整继承其能力：

- **四种权限模式**：
  - `read-only`（只读）：阻止所有写入与 Shell 操作。
  - `workspace-write`（工作区写入，默认）：仅允许在工作目录内写入。
  - `full-access`（完全访问）：允许任意文件与命令操作。
  - `plan`（计划）：只规划不执行。
- **工具确认机制**：每次调用敏感工具时，侧边栏弹出确认卡片，展示工具名、描述与参数，由你决定 Allow / Deny。
- **记忆（Memory）**：跨会话持久化关键信息。
- **技能（Skills）**：可扩展的站点/任务专属指引系统，放置 `SKILL.md` 即可加载，无需改代码。详见下方[技能（Skills）](#-技能skills)小节。
- **MCP（Model Context Protocol）**：接入外部 MCP 服务器扩展工具能力。
- **子智能体（Sub-agents）**：委派子任务给独立智能体。

### 🌐 浏览器自动化

通过 Chrome DevTools Protocol（`chrome.debugger`）驱动当前标签页，AI 可以：

| 工具 | 能力 | 只读 |
|------|------|------|
| `browser_navigate` | 导航当前标签页到指定 URL | 否 |
| `browser_screenshot` | 截取当前页面，返回 base64 PNG | 是 |
| `browser_eval` | 在页面内执行 JavaScript，读取 DOM / 提取文本 / 查询属性 | 否 |
| `browser_click` | 按 CSS 选择器点击元素（自动滚动到可视区） | 否 |

> 截图工具需要模型支持视觉输入（在设置页打开 **Vision** 开关）；关闭时该工具自动禁用，避免向非多模态模型发送图像。

### 🧩 侧边栏原生体验

- 作为 Chrome 扩展运行，**无需额外桌面客户端**，打开侧边栏即可对话。
- 流式输出：模型回复实时逐字渲染。
- 思考指示器：内联于对话流，显示当前回合状态。
- 一键停止：Stop 按钮触发 `CancellationToken`，Agentao 在每个工具边界与 LLM 分块处检查并优雅退出。
- 快捷键：`Ctrl+E`（macOS `Command+E`）切换侧边栏。

### 📎 文件附件解析

侧边栏支持上传文件，原生宿主会将其解析为 HTML 后再发给模型，**保留表格、图片与格式**：

| 格式 | 支持 | 依赖 |
|------|------|------|
| `.docx` | ✅ 完整 | python-docx（已内置） |
| `.pdf` | ✅ 完整 | PyMuPDF（已内置） |
| `.md` | ✅ 完整 | 无 |
| `.doc` | ⚠️ 需 LibreOffice | 可选，见下 |

> 旧版二进制 `.doc` 格式通过 LibreOffice 无头模式转换为 `.docx` 后解析。LibreOffice 为**可选依赖**——未安装时 `.doc` 附件返回提示而非报错，其余格式不受影响。

### ⚙️ 自定义模型供应商

在设置页配置，支持任何 OpenAI 兼容接口，也保留 Anthropic 原生协议选项：

- **多 Profile**：保存多套供应商配置，一键切换。
- **拉取模型列表**：填入 Base URL + API Key 后点击 **Fetch Models**，自动拉取可用模型列表。
- **多模态开关**：标记模型是否支持图像输入。
- **采样参数**：Temperature、Max Tokens 可调。
- 字段：`Profile Name`、`Provider Format`、`Base URL`、`API Key`、`Model`、`Temperature`、`Max Tokens`、`Vision`。

### 📦 开箱即用的打包宿主

原生宿主已用 PyInstaller 打包成**独立可执行文件**，内置 Agentao 及全部依赖。下载后运行一条安装命令即可，**无需安装 Python 或 agentao**。

### 🔗 原生消息桥接

扩展通过 Chrome Native Messaging 与本地宿主进程通信（4 字节小端长度前缀的 JSON）；宿主进程内嵌 Agentao 运行时，所有 LLM 调用与工具执行都在本地完成。

### 🔒 隐私与安全

- **凭据仅存本地**：API Key 存储在 `chrome.storage.local`，只发送给你配置的模型供应商，不经过任何中间服务。
- **Fail-closed 权限**：权限确认超时（如侧边栏关闭、用户离开）时，自动拒绝工具调用，而非静默放行。
- **工作目录隔离**：文件工具以设置页配置的工作目录为根，按权限模式约束读写范围。

### 🌍 多语言与主题

- 内置 **简体中文 / English** 双语资源（`_locales/`）。
- 主题：**Auto（跟随系统）/ Light / Dark**，在设置页切换。

### 🛠️ 可维护的源码结构

- 仓库采用 **100% 可读源码**（非混淆 bundle），每个文件手写并带注释，便于审计与二次开发。
- **契约中心化**：所有消息类型、storage key、字段名、DOM ID 统一收口在 `agentao-contract.js`（扩展侧）与 `host_protocol.py`（宿主侧），两侧镜像，由冻结测试守护。

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  Side Panel  │   │   Options    │   │ Service Worker │  │
│  │  (chat UI)   │◄─►│  (settings)  │   │  (background)  │  │
│  └──────┬───────┘   └──────────────┘   └───────┬────────┘  │
│         │ chrome.runtime / chrome.storage       │           │
│         └────────────────┬──────────────────────┘           │
│                          │ chrome.runtime.connectNative     │
└──────────────────────────┼──────────────────────────────────┘
                           │ stdin / stdout (JSON, length-prefixed)
┌──────────────────────────┼──────────────────────────────────┐
│  Native Host (standalone executable)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  native_host.py  (Native Messaging 读写循环)          │  │
│  │       │                                               │  │
│  │       ▼                                               │  │
│  │  AgentaoChromeTransport  (Transport 实现)             │  │
│  │       │  emit() → 序列化为 JSON → 写回扩展             │  │
│  │       │  confirm_tool/ask_user → 等待扩展回包          │  │
│  │       ▼                                               │  │
│  │  Agentao(working_directory, llm_client, transport)    │  │
│  │       │  agent.chat() / agent.arun()                  │  │
│  │       ▼                                               │  │
│  │  LLM + Tools + Skills + MCP + Memory                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**设计要点：**

1. **扩展前端**参考 `claw-in-chrome` 的壳层结构，但全部使用可读源码（无混淆 bundle）。
2. **原生宿主**用 PyInstaller 打包成独立可执行文件，内置 agentao 及全部依赖，用户机器无需装 Python。
3. **Transport 桥接**：自定义 `AgentaoChromeTransport` 实现 agentao 的 `Transport` 协议，把运行时事件序列化为 JSON 写回扩展，把扩展的权限确认 / 用户回答回包路由回运行时。
4. **契约中心化**：所有消息类型、storage key、字段名统一收口在 `agentao-contract.js`（扩展侧）与 `host_protocol.py`（宿主侧），两侧镜像。

更详细的架构说明见 [docs/architecture.md](./docs/architecture.md)。

---

## 🚀 快速开始

### 方式一：下载打包好的可执行文件（推荐）

> 全程**无需安装 Python 或 agentao**——可执行文件已内置完整运行时。

#### 第 1 步：下载原生宿主

从 [Releases](../../releases) 下载你系统的原生宿主压缩包：

| 系统 | 文件 |
|------|------|
| Windows | `agentao-chrome-host-windows.zip` |
| macOS | 待发布 |
| Linux | 待发布 |

> 目前仅提供 **Windows** 版本，macOS / Linux 版本待发布。

解压到一个**固定目录**（如 `~/agentao-chrome-host/` 或 `C:\agentao-chrome-host\`），不要放在下载文件夹——Chrome 会从该路径启动它，路径不能变。

#### 第 2 步：加载扩展

1. 从同一个 Release 下载 `agentao-in-chrome-extension.zip`，解压到一个文件夹。
2. 打开 `chrome://extensions/`，开启右上角**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择解压出的扩展文件夹（包含 manifest.json 的目录）。
4. 扩展 ID 已通过 manifest.json 中的 key 字段固定，无需手动复制——安装宿主时会自动使用。

#### 第 3 步：安装原生宿主

在宿主解压目录双击 install.bat（Windows）/ install.command（macOS）/ install.sh（Linux），或在终端运行：

```bash
# macOS / Linux
./agentao-chrome-host --install

# Windows
agentao-chrome-host.exe --install
```

该命令会写入 Native Messaging 清单并注册到 Chrome。成功时输出类似：

```
✓ Native Messaging host installed (macos)
  manifest: /Users/you/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentao.chrome_extension.json
  host:     /Users/you/agentao-chrome-host/agentao-chrome-host
```

#### 第 4 步：配置模型供应商

1. 右键 Agentao 图标 → **选项**，打开设置页。
2. 在 **Model Provider** 区填写：
   - `Profile Name`：任意名称
   - `Provider Format`：`OpenAI-compatible`（默认）或 `Anthropic`
   - `Base URL`：`https://api.openai.com/v1`（或你的网关）
   - `API Key`：`sk-...`
   - `Model`：`gpt-4o`（可点 **Fetch Models** 自动拉取列表）
   - 按需开启 `Vision`、调整 `Temperature` / `Max Tokens`
3. 点击 **Save**。

#### 第 5 步：开始对话

打开侧边栏（`Ctrl+E` 或点击工具栏图标），状态指示灯变绿（Connected）即表示宿主已连接。在输入框输入消息，回车发送。

### 方式二：从源码运行（开发用）

适合需要修改宿主代码、希望改动即时生效的开发者：

```bash
cd agentao-in-chrome
pip install agentao
python scripts/install_native_host.py
```

源码安装器会创建一个调用 Python 宿主的启动脚本。详见 [docs/native-host-setup.md](./docs/native-host-setup.md)。

### 方式三：自行打包

适合要本地测试发布包、或定制打包内容的场景：

```bash
pip install "agentao>=0.4.18" "pyinstaller>=6.0"
python scripts/build_native_host.py --clean
# 产物在 Releases/dist/agentao-chrome-host/
```

### 配置运行时

在设置页的 **Runtime** 区还可配置：

- `Permission Mode`：权限模式（只读 / 工作区写入 / 完全访问 / 计划）。
- `Working Directory`：智能体的工作目录路径，文件工具以此为根解析。

在 **Appearance** 区配置主题与语言。保存后关闭并重新打开侧边栏即可生效。

---

### 🧩 技能（Skills）

技能是**给 AI 看的操作指引**（Markdown 文件），用于告诉 AI 如何操作特定网站或完成特定任务。激活后，技能内容会作为上下文注入到 AI 的每一轮对话中，无需改任何代码。

#### 技能文件结构

每个技能是**一个文件夹**，必须包含 `SKILL.md`：

```
skills/
└── my-skill/              # 技能文件夹（名称随意）
    ├── SKILL.md            # 必需：技能指引正文
    ├── references/         # 可选：参考文档（.md）
    ├── assets/             # 可选：素材文档（.md）
    └── scripts/            # 可选：可执行脚本（AI 可直接运行）
```

`SKILL.md` 可选带 frontmatter（声明名称、描述、何时使用），格式如下：

```markdown
---
name: my-skill
description: 一句话描述这个技能做什么
when_to_use: 用户提到什么关键词时使用此技能
---

# 技能标题

正文：给 AI 看的操作步骤、DOM 结构、API 接口、代码示例、注意事项……
```

> 不写 frontmatter 也能用——技能名称默认取文件夹名，`SKILL.md` 的第一个 `# 标题`会作为技能标题。

#### 源码版（开发）放哪

源码模式下，技能放在仓库的 `native-host/skills/` 目录，重启宿主后自动发现：

```
agentao-in-chrome/
└── native-host/
    └── skills/              # ← 源码版技能目录
        ├── form-fill-9902/  #   已内置：9902 网点表单填报指引
        │   └── SKILL.md
        └── my-skill/        #   你新增的技能
            └── SKILL.md
```

宿主启动时会额外扫描这个目录（`native_host.py` 里的 `_bundled_skills_dir`），所以**放到这里即可，无需改代码**。

#### 打包版（分发给用户）放哪

> ⚠️ 打包版**不会**扫描 `native-host/skills/`（PyInstaller 打包时该目录未被收集进 exe）。打包版技能放在用户**工作目录**下的技能目录。

技能目录相对于工作目录，有两层可选（任选其一）：

| 目录 | 说明 |
|------|------|
| `<工作目录>/skills/` | 工作目录根下的技能目录 |
| `<工作目录>/.agentao/skills/` | 工作目录的 `.agentao` 配置下 |

工作目录默认是 `~/.agentao-chrome/workspace`（可在设置页 **Runtime → Working Directory** 修改），所以默认放这里：

```
~/.agentao-chrome/workspace/
└── skills/                  # ← 打包版技能目录
    └── my-skill/
        └── SKILL.md
```

把技能文件夹放进去后，**重新打开侧边栏**（让宿主重连）即可发现新技能。

> 此外，`~/.agentao/skills/`（全局目录）也有效——那里是 agentao 自带的技能（如 skill-creator）。你的业务技能放工作目录即可，避免与全局技能混淆。

#### 技能的生命周期

```
扫描目录 → available_skills（已发现）
                ↓  activate_skill(name, task)
        active_skills（已激活）
                ↓  get_skills_context()
        注入到 LLM 的 system prompt（每轮对话）
```

1. **发现**：宿主启动时扫描技能目录，所有含 `SKILL.md` 的子文件夹进入已发现列表。
2. **激活**：AI 根据用户意图自动激活匹配的技能（也可手动调用 `activate_skill`）。
3. **注入**：每轮对话时，已激活技能的 `SKILL.md` 全文 + 资源文件列表注入到 system prompt。
4. **停用**：任务完成后自动停用，不再注入。

---
## 🗂️ 项目结构

```
agentao-in-chrome/
├── extension/                     # Chrome 扩展（加载此目录）
│   ├── manifest.json              # Chrome MV3 清单
│   ├── agentao-contract.js        # 冻结契约（消息类型 / storage key / 字段名）
│   ├── service-worker-loader.js   # Service Worker 加载入口
│   ├── service-worker-runtime.js  # Service Worker 可维护运行时
│   ├── native-host-binding.js     # 原生宿主绑定补丁
│   ├── sidepanel.html / .js / .css # 侧边栏聊天界面
│   ├── options.html / .js / .css  # 设置页
│   ├── theme-init.js              # 主题初始化
│   ├── i18n-runtime.js            # 运行时国际化
│   ├── icon-128.png / icon.svg    # 扩展图标
│   └── _locales/                  # 多语言资源（en / zh-CN）
├── native-host/                   # 原生消息宿主（Python）
│   ├── native_host.py             # 宿主入口（读写循环 + --install 模式）
│   ├── agentao_transport.py       # Agentao Transport 实现
│   ├── browser_tools.py           # 浏览器自动化工具（CDP 桥接）
│   ├── host_protocol.py           # 宿主侧契约镜像
│   ├── installer.py               # 共享安装逻辑（manifest 写入 + 注册）
│   ├── install.bat / .command / .sh  # 双击安装脚本
│   ├── skills/                    # 可扩展技能目录
│   ├── pyproject.toml             # Python 项目元数据
│   └── README.md
├── scripts/
│   ├── build_native_host.py       # PyInstaller 打包脚本
│   ├── install_native_host.py     # 源码模式安装脚本
│   ├── generate_icon.py           # 图标生成
│   ├── generate_extension_key.py  # 扩展密钥生成
│   ├── compute_extension_id.py    # 扩展 ID 计算
│   └── check-release-package.js   # 发布包检查
├── .github/workflows/release.yml  # 跨平台构建 + 发布
├── docs/
│   ├── architecture.md            # 架构说明
│   ├── message-protocol.md        # 消息协议索引
│   └── native-host-setup.md       # 宿主安装指南
├── Releases/                     # 本地打包产物（gitignore；含 dist/ 与 extension/ 副本，用于分发）
└── tests/
    ├── run-all-tests.js
    ├── run-suite.js
    └── unit/
        ├── contract.freeze.test.js   # 契约冻结守护
        ├── manifest.test.js          # 清单校验
        ├── message-protocol.test.js  # 消息协议
        ├── host-status-query.test.js # 宿主状态查询
        └── installer.test.js         # 安装器逻辑
```

---

> 💡 **从源码加载扩展（开发用）**：在 `chrome://extensions/` 开启开发者模式，点击「加载已解压的扩展程序」，选择仓库根目录下的 **`extension/`** 文件夹（包含 `manifest.json` 的目录），而不是仓库根目录本身。`Releases/extension/` 仅为分发副本，开发时无需使用。

## 🧪 开发与测试

```bash
# 运行全部单元测试（契约冻结、清单校验、消息协议、宿主状态查询、安装器）


npm test

# 仅运行单元测试套件
npm run test:unit

# 检查发布包完整性
npm run check:release-package
```

---

## 🙏 鸣谢

本项目站在巨人的肩膀上，特别感谢以下项目与社区：

### 核心依赖

- **[Agentao](https://github.com/jin-bo/agentao)** —— 本项目的灵魂所在。Agentao 是一个本地优先、隐私优先、可嵌入的受治理智能体运行时，提供了权限引擎、工具系统、技能、MCP、记忆、子智能体等完整能力。Agentao in Chrome 只是把这套运行时搬进了 Chrome 侧边栏，所有智能体能力均来自 Agentao。感谢 Agentao 作者设计与维护了如此清晰、可嵌入的运行时接口，让本项目得以用纯注入方式（`Agentao(working_directory=..., llm_client=..., transport=...)`）集成，而无需 fork 或修改上游。

### 架构参考

- **claw-in-chrome** —— 本项目的扩展壳层架构（中心化冻结契约、Service Worker 加载器、原生宿主绑定、自定义供应商配置）参考了 claw-in-chrome 的模式。我们复用其**架构思想**，但所有代码均为可读源码手写，不含任何混淆 bundle。

### 工具链

- [PyInstaller](https://pyinstaller.org/) —— 将 Python 宿主打包为独立可执行文件，让终端用户免装 Python。
- [python-docx](https://python-docx.org/) / [PyMuPDF](https://pymupdf.readthedocs.io/) —— 文件附件解析。
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) —— 浏览器自动化能力底座。

> 如果 Agentao in Chrome 对你有帮助，请同样去 [Agentao](https://github.com/jin-bo/agentao) 仓库点个 Star，支持上游运行时的持续发展。

---

## ⚖️ License

**MIT**

---

**⭐ 如果这个项目对你有帮助，欢迎点个 Star 支持一下。**
