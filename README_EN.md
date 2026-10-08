# Agentao in Chrome

<div align="center">

![Agentao in Chrome](https://img.shields.io/badge/Agentao-in%20Chrome-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-3.0.0-green?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.1.0-green?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Chrome%20116%2B-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

</div>

English | [简体中文](./README.md)

Put [Agentao](https://github.com/jin-bo/agentao) — a local-first, privacy-first, embeddable governed agent runtime — into the Chrome sidebar. Chat with your own model provider while browsing, and hand in-browser operations to the AI.

> **"Order in Chaos, Path in Intelligence."**

---

## 📖 Overview

**Agentao in Chrome** is a Chrome MV3 extension that embeds the Agentao agent runtime into the browser sidebar. While browsing any page, you can open the sidebar to chat with your own LLM and let the AI directly operate the current page — navigate, screenshot, read the DOM, click elements, even auto-fill forms.

Unlike cloud-based agent products, this project runs **all LLM calls and tool execution locally**: the extension is just a UI shell; the real agent runtime lives in a local process (the native host) on your machine. Your API keys, conversation content, and workspace files never pass through any third-party server (other than your own model provider).

### Core positioning

- **Local-first**: The agent runtime runs in a local Python process — no cloud agent service required.
- **Privacy-first**: Credentials are stored only in `chrome.storage.local` and sent only to your configured model provider.
- **Governed**: Inherits Agentao's permission engine; tool execution can require human confirmation, with fail-closed timeouts.
- **Embeddable**: Constructs the runtime via Agentao's pure-injection API without modifying Agentao itself — only its public embedding surface is used.

---

## ✨ Features

### 🧠 Agentao governed runtime

The backend is powered by [agentao](https://github.com/jin-bo/agentao) and fully inherits its capabilities:

- **Four permission modes**:
  - `read-only`: Blocks all write and shell operations.
  - `workspace-write` (default): Allows writes only within the working directory.
  - `full-access`: Allows arbitrary file and command operations.
  - `plan`: Plans only, never executes.
- **Tool confirmation**: Each time a sensitive tool is invoked, the sidebar shows a confirmation card with the tool name, description, and arguments — you decide Allow / Deny.
- **Memory**: Persists key information across sessions.
- **Skills**: An extensible site/task-specific guidance system — drop a `SKILL.md` to load it, no code changes needed. See the [Skills](#-skills) section below.
<<<<<<< HEAD
- **MCP (Model Context Protocol)**: Connect external MCP servers to extend tool capabilities. The settings page's **MCP Servers** section manages connections visually (add / edit / test / enable / trust), with config flowing `chrome.storage` → native host → `InMemoryMCPRegistry` into the runtime; file-based config (`~/.agentao/mcp.json` and `<workspace>/.agentao/mcp.json`) remains supported, with UI entries winning name collisions.
=======
- **MCP (Model Context Protocol)**: Connect external MCP servers to extend tool capabilities.
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
- **Sub-agents**: Delegate subtasks to independent agents.

### 🌐 Browser automation

Driven by the Chrome DevTools Protocol (`chrome.debugger`) on the active tab, the AI can:

| Tool | Capability | Read-only |
|------|-----------|-----------|
| `browser_navigate` | Navigate the active tab to a URL | No |
| `browser_screenshot` | Capture the current page, returns base64 PNG | Yes |
| `browser_eval` | Execute JavaScript in the page — read DOM / extract text / query attributes | No |
| `browser_click` | Click an element by CSS selector (auto-scrolls into view) | No |

> The screenshot tool requires a model that supports vision input (enable the **Vision** toggle in settings). When disabled, the tool is automatically deactivated to avoid sending images to a non-multimodal model.

### 🧩 Sidebar-native experience

- Runs as a Chrome extension — **no desktop client needed**. Open the sidebar to chat.
- Streaming output: model replies render token-by-token in real time.
- Thinking indicator: inline in the conversation flow, showing the current turn status.
- One-click stop: The Stop button trips a `CancellationToken`; Agentao checks it at every tool boundary and LLM chunk and exits gracefully.
- Shortcut: `Ctrl+E` (macOS `Command+E`) toggles the sidebar.

### 📎 File attachment parsing

The sidebar supports file uploads; the native host parses them into HTML before sending to the model, **preserving tables, images, and formatting**:

| Format | Support | Dependency |
|--------|---------|------------|
| `.docx` | ✅ Full | python-docx (bundled) |
| `.pdf` | ✅ Full | PyMuPDF (bundled) |
| `.md` | ✅ Full | None |
| `.doc` | ⚠️ Needs LibreOffice | Optional, see below |

> Legacy binary `.doc` files are converted to `.docx` via LibreOffice headless mode before parsing. LibreOffice is an **optional dependency** — when not installed, `.doc` attachments return a notice instead of erroring; all other formats are unaffected.

### ⚙️ Custom model providers

Configured on the settings page; supports any OpenAI-compatible endpoint, with a native Anthropic protocol option retained:

- **Multiple profiles**: Save several provider configs and switch with one click.
- **Fetch model list**: After entering Base URL + API Key, click **Fetch Models** to auto-pull the available model list.
- **Multimodal toggle**: Mark whether a model supports image input.
- **Sampling parameters**: Temperature, Max Tokens adjustable.
- Fields: `Profile Name`, `Provider Format`, `Base URL`, `API Key`, `Model`, `Temperature`, `Max Tokens`, `Vision`.

### 📦 Out-of-the-box packaged host

<<<<<<< HEAD
The native host is packaged with PyInstaller into a **standalone executable** that bundles the Agentao runtime (v3.0.0 ships with agentao **0.5.11**) and all dependencies, distributed together with the extension (`extension/native-host/`). Double-click install.bat — **no Python or agentao installation needed**.

### 🌐 Multi-browser support

Installing the native host (double-click install.bat or run `--install`) registers it with **every Chromium-family browser on the machine**: **Chrome / Edge / Brave / Chromium / Vivaldi**. Load the extension in any of them and start using it — the host is installed once.

> Firefox / Safari are not supported yet: they lack the `chrome.sidePanel` / `chrome.debugger` APIs and use a different Native Messaging manifest format.
=======
The native host is packaged with PyInstaller into a **standalone executable** that bundles Agentao and all dependencies. Download it, run one install command — **no Python or agentao installation needed**.
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a

### 🔗 Native messaging bridge

The extension communicates with the local host process via Chrome Native Messaging (4-byte little-endian length-prefixed JSON); the host process embeds the Agentao runtime, so all LLM calls and tool execution happen locally.

### 🔒 Privacy & security

- **Credentials stay local**: API keys are stored in `chrome.storage.local` and sent only to your configured model provider — never through any intermediary service.
- **Fail-closed permissions**: When a permission confirmation times out (e.g. sidebar closed, user away), the tool call is automatically denied rather than silently approved.
- **Working directory isolation**: File tools treat the settings-configured working directory as root, constraining read/write scope per the permission mode.

### 🌍 i18n & themes

- Bundled **Simplified Chinese / English** bilingual resources (`_locales/`).
- Themes: **Auto (follow system) / Light / Dark**, switchable on the settings page.

### 🛠️ Maintainable source structure

- The repo ships **100% readable source** (no obfuscated bundles); every file is hand-written and commented for easy auditing and secondary development.
- **Centralized contract**: All message types, storage keys, field names, and DOM IDs are consolidated in `agentao-contract.js` (extension side) and `host_protocol.py` (host side) — mirrored on both sides and guarded by a freeze test.

---

## 🏗️ Architecture

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
│  │  native_host.py  (Native Messaging read/write loop)  │  │
│  │       │                                               │  │
│  │       ▼                                               │  │
│  │  AgentaoChromeTransport  (Transport implementation)  │  │
│  │       │  emit() → serialize to JSON → write to ext   │  │
│  │       │  confirm_tool/ask_user → wait for reply      │  │
│  │       ▼                                               │  │
│  │  Agentao(working_directory, llm_client, transport)   │  │
│  │       │  agent.chat() / agent.arun()                 │  │
│  │       ▼                                               │  │
│  │  LLM + Tools + Skills + MCP + Memory                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Design highlights:**

1. **Extension frontend** references the `claw-in-chrome` shell pattern, but uses entirely readable source (no obfuscated bundles).
<<<<<<< HEAD
2. **Native host** is packaged with PyInstaller into a standalone executable that bundles agentao and all dependencies — no Python needed on the user's machine; the install script registers the host with every Chromium-family browser (Chrome / Edge / Brave / Chromium / Vivaldi).
=======
2. **Native host** is packaged with PyInstaller into a standalone executable that bundles agentao and all dependencies — no Python needed on the user's machine.
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
3. **Transport bridge**: A custom `AgentaoChromeTransport` implements agentao's `Transport` protocol, serializing runtime events to JSON written back to the extension, and routing the extension's permission confirmations / user answers back to the runtime.
4. **Centralized contract**: All message types, storage keys, and field names are consolidated in `agentao-contract.js` (extension side) and `host_protocol.py` (host side) — mirrored on both sides.

For more detail see [docs/architecture.md](./docs/architecture.md).

---

## 🚀 Quick Start

<<<<<<< HEAD
### Option A: Use the v3.0.0 all-in-one package (recommended)

> **No Python or agentao installation needed** — the native host is packaged as a standalone executable and bundles the Agentao runtime (0.5.11).
>
> Supported browsers: **Chrome / Edge / Brave / Chromium / Vivaldi** (Chromium 116+). Firefox / Safari are not supported yet.

There are two ways to obtain the package; Steps 1–2 pick the location per channel, everything else is identical:

| Channel | Contents | Best for |
|---------|----------|----------|
| **A. Full release package** | The `Releases/extension/` folder: extension + bundled host in one place | Local use after building / direct distribution (cloud drive, LAN share) |
| **B. GitHub Releases** | Two zips: `agentao-in-chrome-extension.zip` (extension) + `agentao-chrome-host-windows.zip` (host) | Downloading from the Release page |

Channel A's full release package layout:

```
Releases/extension/                 # ← this folder is both the extension and the install root
├── manifest.json ...               # extension files (load this folder)
├── 安装说明.md                     # three-step install guide (with FAQ)
└── native-host/                    # bundled native host
    ├── agentao-chrome-host.exe     # PyInstaller-frozen host
    └── install.bat                 # double-click to install
```

> Keep in mind: the source tree's `extension/` does **not** contain `native-host/` (build artifacts are not committed), and Channel B's extension zip does not either — the host ships in its own zip.

#### Step 1: Load the extension

1. Open `chrome://extensions/` and enable **Developer mode** (top right).
2. Click **Load unpacked** and select the extension folder (the one containing `manifest.json`):
   - Channel A: `Releases/extension/`
   - Channel B: the folder extracted from `agentao-in-chrome-extension.zip`
3. The extension ID is fixed via the `key` field in `manifest.json` — no need to copy it manually; the host installer uses it automatically.

#### Step 2: Install the native host

Go into the host directory (Channel A: `Releases/extension/native-host/`; Channel B: the folder extracted from `agentao-chrome-host-windows.zip` — extract it to a **permanent location** such as `C:\agentao-chrome-host\`, since the browser launches the host from that path and it must not move afterwards) and double-click **install.bat** (Windows) / install.command (macOS) / install.sh (Linux), or run in a terminal:
=======
### Option A: Download the packaged executable (recommended)

> **No Python or agentao installation needed** — the executable bundles the full runtime.

#### Step 1: Download the native host

Download the native host archive for your OS from [Releases](../../releases):

| OS | File |
|----|------|
| Windows | `agentao-chrome-host-windows.zip` |
| macOS | Coming soon |
| Linux | Coming soon |

> Only **Windows** is available for now; macOS / Linux builds are coming soon.

Extract it to a **permanent location** (e.g. `~/agentao-chrome-host/` or `C:\agentao-chrome-host\`) — don't leave it in Downloads. Chrome launches it from this path, so the path must not change.

#### Step 2: Load the extension

1. Download `agentao-in-chrome-extension.zip` from the same Release and extract it to a folder.
2. Open `chrome://extensions/` and enable **Developer mode** (top right).
3. Click **Load unpacked** and select the extracted extension folder (the one containing `manifest.json`).
4. The extension ID is fixed via the `key` field in `manifest.json` — no need to copy it manually; the host installer uses it automatically.

#### Step 3: Install the native host

Double-click `install.bat` (Windows) / `install.command` (macOS) / `install.sh` (Linux) in the host directory, or run in a terminal:
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a

```bash
# macOS / Linux
./agentao-chrome-host --install

# Windows
agentao-chrome-host.exe --install
```

<<<<<<< HEAD
This writes the Native Messaging manifest and registers it with every Chromium-family browser on the machine (Chrome / Edge / Brave / Chromium / Vivaldi). On success you'll see something like:
=======
This writes the Native Messaging manifest and registers it with Chrome. On success you'll see something like:
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a

```
✓ Native Messaging host installed (macos)
  manifest: /Users/you/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentao.chrome_extension.json
  host:     /Users/you/agentao-chrome-host/agentao-chrome-host
```

<<<<<<< HEAD
> For install details and FAQ see the bundled [extension/安装说明.md](./extension/安装说明.md).

#### Step 3: Configure your model provider
=======
#### Step 4: Configure your model provider
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a

1. Right-click the Agentao icon → **Options** to open the settings page.
2. Fill in the **Model Provider** section:
   - `Profile Name`: any name
   - `Provider Format`: `OpenAI-compatible` (default) or `Anthropic`
   - `Base URL`: `https://api.openai.com/v1` (or your gateway)
   - `API Key`: `sk-...`
   - `Model`: `gpt-4o` (click **Fetch Models** to auto-pull the list)
   - Enable `Vision` and adjust `Temperature` / `Max Tokens` as needed
3. Click **Save**.

<<<<<<< HEAD
#### Step 4: Start chatting
=======
#### Step 5: Start chatting
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a

Open the sidebar (`Ctrl+E` or click the toolbar icon). The status indicator turns green (Connected) when the host is connected. Type a message in the input box and press Enter to send.

### Option B: From source (development)

For developers who need to modify the host code and want changes to take effect immediately:

```bash
cd agentao-in-chrome
pip install agentao
python scripts/install_native_host.py
```

The source installer creates a launcher script that invokes the Python host. See [docs/native-host-setup.md](./docs/native-host-setup.md).

### Option C: Build the executable yourself

For testing a release package locally or customizing the build contents:

```bash
pip install "agentao>=0.4.18" "pyinstaller>=6.0"
python scripts/build_native_host.py --clean
# Output in Releases/dist/agentao-chrome-host/
```

<<<<<<< HEAD
> The build script excludes heavyweight ML packages (torch / transformers / etc.) that the native host never uses — their deeply nested license trees can hit the Windows MAX_PATH limit during the freeze. The output is roughly 200 MB.

=======
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
### Runtime configuration

On the settings page, the **Runtime** section also lets you configure:

- `Permission Mode`: permission mode (read-only / workspace-write / full-access / plan).
- `Working Directory`: the agent's working directory path; file tools resolve against this root.

Configure theme and language in the **Appearance** section. Save, then close and reopen the sidebar for changes to take effect.

---

### 🧩 Skills

A skill is **an instruction manual for the AI** (a Markdown file) that tells it how to operate a specific website or complete a specific task. When activated, the skill content is injected into the AI's system prompt for every turn — no code changes required.

#### Skill file structure

Each skill is **a folder** that must contain `SKILL.md`:

```
skills/
└── my-skill/              # skill folder (any name)
    ├── SKILL.md            # required: skill instructions
    ├── references/         # optional: reference docs (*.md)
    ├── assets/             # optional: asset docs (*.md)
    └── scripts/            # optional: executable scripts (AI can run directly)
```

`SKILL.md` may have an optional frontmatter (declaring name, description, when to use):

```markdown
---
name: my-skill
description: One sentence describing what this skill does
when_to_use: Keywords that trigger this skill
---

# Skill Title

Body: steps, DOM structure, API endpoints, code samples, caveats for the AI ...
```

> Frontmatter is optional — without it the skill name defaults to the folder name, and the first `# Heading` in `SKILL.md` becomes the title.

#### Source mode (development) — where to put skills

In source mode, skills go in the repository's `native-host/skills/` directory. The host discovers them on restart:

```
agentao-in-chrome/
└── native-host/
    └── skills/              # ← source-mode skills directory
<<<<<<< HEAD
=======
        ├── form-fill-9902/  #   bundled: 9902 form-filling guide
        │   └── SKILL.md
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
        └── my-skill/        #   your new skill
            └── SKILL.md
```

The host scans this directory on startup (`_bundled_skills_dir` in `native_host.py`), so **just drop it in — no code changes**.

#### Packaged build (for end users) — where to put skills

> ⚠️ The packaged build does **not** scan `native-host/skills/` (PyInstaller does not collect that directory into the exe). In the packaged build, skills live under the user's **working directory**.

Skill directories are resolved relative to the working directory. There are two layers (either works):

| Directory | Description |
|-----------|-------------|
| `<working-dir>/skills/` | Skills at the working-directory root |
| `<working-dir>/.agentao/skills/` | Skills under the working directory's `.agentao` config |

The working directory defaults to `~/.agentao-chrome/workspace` (configurable at **Settings → Runtime → Working Directory**), so by default place skills here:

```
~/.agentao-chrome/workspace/
└── skills/                  # ← packaged-build skills directory
    └── my-skill/
        └── SKILL.md
```

After placing the skill folder, **reopen the sidebar** (to let the host reconnect) to discover the new skill.

> The global directory `~/.agentao/skills/` also works — that is where agentao's built-in skills (e.g. skill-creator) live. Put your business skills under the working directory to avoid mixing with global ones.

#### Skill lifecycle

```
Scan directories → available_skills (discovered)
                      ↓  activate_skill(name, task)
              active_skills (activated)
                      ↓  get_skills_context()
        Injected into the LLM system prompt (every turn)
```

1. **Discovery**: On host startup, skill directories are scanned; every subfolder containing `SKILL.md` enters the available list.
2. **Activation**: The AI auto-activates matching skills based on user intent (or via an explicit `activate_skill` call).
3. **Injection**: On each turn, the full `SKILL.md` text + resource file list of all active skills is injected into the system prompt.
4. **Deactivation**: Once the task is done the skill is deactivated and no longer injected.

---
## 🗂️ Project Structure

```
agentao-in-chrome/
├── extension/                     # Chrome extension (load this directory)
│   ├── manifest.json              # Chrome MV3 manifest
│   ├── agentao-contract.js        # Frozen contract (message types / storage keys / field names)
│   ├── service-worker-loader.js   # Service Worker loader entry
│   ├── service-worker-runtime.js  # Service Worker maintainable runtime
│   ├── native-host-binding.js     # Native host binding patch
│   ├── sidepanel.html / .js / .css # Sidebar chat UI
│   ├── options.html / .js / .css  # Settings page
│   ├── theme-init.js              # Theme initialization
│   ├── i18n-runtime.js            # Runtime i18n
│   ├── icon-128.png / icon.svg    # Extension icons
<<<<<<< HEAD
│   ├── 安装说明.md                # Release install guide (shipped since v3.0.0)
=======
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
│   └── _locales/                  # i18n resources (en / zh-CN)
├── native-host/                   # Native messaging host (Python)
│   ├── native_host.py             # Host entry (read/write loop + --install mode)
│   ├── agentao_transport.py       # Agentao Transport implementation
│   ├── browser_tools.py           # Browser automation tools (CDP bridge)
│   ├── host_protocol.py           # Host-side contract mirror
│   ├── installer.py               # Shared install logic (manifest write + register)
│   ├── install.bat / .command / .sh  # Double-click install scripts
│   ├── skills/                    # Extensible skills directory
│   ├── pyproject.toml             # Python project metadata
│   └── README.md
├── scripts/
<<<<<<< HEAD
│   ├── build_native_host.py       # PyInstaller build script (excludes ML packages)
│   ├── pack-release-windows.ps1   # Windows release zip packaging
│   ├── install_native_host.py     # Source-mode install script
│   ├── fix_mojibake.py            # Source mojibake repair tool
=======
│   ├── build_native_host.py       # PyInstaller build script
│   ├── install_native_host.py     # Source-mode install script
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
│   ├── generate_icon.py           # Icon generation
│   ├── generate_extension_key.py  # Extension key generation
│   ├── compute_extension_id.py    # Extension ID computation
│   └── check-release-package.js   # Release package check
├── .github/workflows/release.yml  # Cross-platform build + release
├── docs/
│   ├── architecture.md            # Architecture notes
│   ├── message-protocol.md        # Message protocol index
│   └── native-host-setup.md       # Host setup guide
<<<<<<< HEAD
├── Releases/                     # Local build output (gitignored; dist/ host build + extension/ out-of-the-box snapshot for distribution)
=======
├── Releases/                     # Local build output (gitignored; dist/ + extension/ copies for distribution)
>>>>>>> b97cb58fcb1fbbe6434a08d1a4d93c9a2f3ee72a
└── tests/
    ├── run-all-tests.js
    ├── run-suite.js
    └── unit/
        ├── contract.freeze.test.js   # Contract freeze guard
        ├── manifest.test.js          # Manifest validation
        ├── message-protocol.test.js  # Message protocol
        ├── host-status-query.test.js # Host status query
        └── installer.test.js         # Installer logic
```

---

> 💡 **Load the extension from source (development)**: On `chrome://extensions/`, enable Developer mode, click "Load unpacked", and select the **`extension/`** folder at the repository root (the one containing `manifest.json`) — not the repository root itself. `Releases/extension/` is a distribution copy; you do not need it for development.

## 🧪 Development & Testing

```bash
# Run all unit tests (contract freeze, manifest validation, message protocol,
# host status query, installer)
npm test

# Run only the unit test suite
npm run test:unit

# Check release package integrity
npm run check:release-package
```

---

## 🙏 Acknowledgements

This project stands on the shoulders of giants. Special thanks to the following projects and communities:

### Core dependency

- **[Agentao](https://github.com/jin-bo/agentao)** — the soul of this project. Agentao is a local-first, privacy-first, embeddable governed agent runtime that provides the permission engine, tool system, skills, MCP, memory, and sub-agents. Agentao in Chrome simply moves this runtime into the Chrome sidebar; all agent capabilities come from Agentao. Thanks to the Agentao author for designing and maintaining such a clean, embeddable runtime interface, enabling this project to integrate via pure injection (`Agentao(working_directory=..., llm_client=..., transport=...)`) without forking or modifying upstream.

### Architecture reference

- **claw-in-chrome** — the extension shell architecture (centralized frozen contract, service-worker loader, native-host binding, custom provider config) references claw-in-chrome's pattern. We reuse its **architectural ideas**, but all code is hand-written readable source with no obfuscated bundles.

### Toolchain

- [PyInstaller](https://pyinstaller.org/) — packages the Python host into a standalone executable so end users don't need Python.
- [python-docx](https://python-docx.org/) / [PyMuPDF](https://pymupdf.readthedocs.io/) — file attachment parsing.
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — the foundation for browser automation.

> If Agentao in Chrome helps you, please also go to the [Agentao](https://github.com/jin-bo/agentao) repo and give it a Star to support the upstream runtime's continued development.

---

## ⚖️ License

**MIT**

---

**⭐ If this project helps you, a Star is appreciated.**
