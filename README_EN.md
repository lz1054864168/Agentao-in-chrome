# Agentao in Chrome

<div align="center">

![Agentao in Chrome](https://img.shields.io/badge/Agentao-in%20Chrome-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.1.0-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome%20116%2B-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

</div>

English | [简体中文](./README.md)

Put [Agentao](https://github.com/jin-bo/agentao) — a local-first, private-first, embeddable governed agent runtime — into the Chrome sidebar. Chat with your own model provider while browsing, and hand browser operations to the AI.

> **"Order in Chaos, Path in Intelligence."**

---

## ✨ Features

- **🧠 Agentao governed runtime**
  - Backend powered by [agentao](https://github.com/jin-bo/agentao): permission modes (read-only / workspace-write / full-access / plan), tool confirmation, memory, skills, MCP, sub-agents.
- **🧩 Sidebar-native**
  - Runs as a Chrome extension; no desktop client needed. Open the sidebar to chat.
- **📦 Out-of-the-box packaged host**
  - The native host is packaged with PyInstaller into a standalone executable. Download it, run one install command — **no Python or agentao installation needed**.
- **🔗 Native messaging bridge**
  - The extension talks to a local host process via Chrome Native Messaging; the host embeds the Agentao runtime, so all LLM calls and tool execution happen locally.
- **⚙️ Custom model providers**
  - Configure `Base URL`, `API Key`, `Model` in the settings page. Any OpenAI-compatible endpoint works.
- **🌍 Maintainable structure**
  - Readable source (no obfuscated bundles), bundled i18n resources.

## 🚀 Quick Start

### Option A: Download the packaged executable (recommended)

1. Download the native host archive for your OS from [Releases](../../releases):
   - Windows: `agentao-chrome-host-windows.zip`
   - macOS: `agentao-chrome-host-macos.tar.gz`
   - Linux: `agentao-chrome-host-linux.tar.gz`
2. Extract it to a permanent location (not Downloads — Chrome launches it from this path).
3. Download `agentao-in-chrome-extension.zip` from the same Release, extract it, load it unpacked in `chrome://extensions/` (Developer mode), and copy the extension ID.
4. Run the install command in the host directory:

```bash
# macOS / Linux
./agentao-chrome-host --install --extension-id <YOUR_EXTENSION_ID>

# Windows
agentao-chrome-host.exe --install --extension-id <YOUR_EXTENSION_ID>
```

5. Open the extension options page, configure `Base URL`, `API Key`, `Model`, and save.
6. Open the sidebar and start chatting.

**No Python or agentao installation required** — the executable bundles the full runtime.

### Option B: From source (development)

```bash
cd agentao-in-chrome
pip install agentao
python scripts/install_native_host.py --extension-id <YOUR_EXTENSION_ID>
```

### Option C: Build the executable yourself

```bash
pip install "agentao>=0.4.18" "pyinstaller>=6.0"
python scripts/build_native_host.py --clean
# Output in dist/agentao-chrome-host/
```

## 🏗️ Architecture

See [README.md](./README.md#-架构) for the full architecture diagram and design notes.

## 🗂️ Project Structure

See [README.md](./README.md#-项目结构) for the full layout.

## ⚖️ License

**MIT**
