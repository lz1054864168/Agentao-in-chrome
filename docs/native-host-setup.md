# Native Host Setup

The Chrome extension needs a local process (the "native host") to run
the Agentao runtime. There are two ways to install it:

- **Packaged (recommended)** — download a standalone executable from
  the [Releases](../../releases) page. No Python installation needed.
- **From source** — for development; requires Python + agentao.

---

## Option A: Packaged executable (recommended)

### Step 1: Download

Download the archive for your OS from the latest
[Release](../../releases):

| OS | File |
|----|------|
| Windows | `agentao-chrome-host-windows.zip` |
| macOS | `agentao-chrome-host-macos.tar.gz` |
| Linux | `agentao-chrome-host-linux.tar.gz` |

Extract it to a permanent location (e.g., `~/agentao-chrome-host/` on
macOS/Linux, `C:\agentao-chrome-host\` on Windows). Don't put it in
Downloads — Chrome will launch it from this path, so it must stay put.

### Step 2: Load the extension and get the ID

1. Download `agentao-in-chrome-extension.zip` from the same Release.
2. Extract it to a folder.
3. Open `chrome://extensions/`, enable **Developer mode**.
4. Click **Load unpacked**, select the extracted extension folder.
5. Copy the **ID** (a 32-char string).

### Step 3: Install the host

Open a terminal in the folder where you extracted the host and run:

```bash
# macOS / Linux
./agentao-chrome-host --install --extension-id <YOUR_EXTENSION_ID>

# Windows
agentao-chrome-host.exe --install --extension-id <YOUR_EXTENSION_ID>
```

This writes the Native Messaging manifest and registers it with Chrome.
You should see:

```
✓ Native Messaging host installed (macos)
  manifest: /Users/you/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agentao.chrome_extension.json
  host:     /Users/you/agentao-chrome-host/agentao-chrome-host
```

### Step 4: Configure and chat

1. Right-click the Agentao icon → Options.
2. Fill in Base URL, API Key, Model. Click **Save**.
3. Open the sidebar. The status should turn green ("Connected").
4. Type a message and press Enter.

---

## Option B: From source (development)

### Prerequisites

- Python ≥ 3.10
- agentao ≥ 0.4.18 (`pip install agentao`)

### Steps

```bash
cd agentao-in-chrome
pip install agentao
python scripts/install_native_host.py --extension-id <YOUR_EXTENSION_ID>
```

The source installer creates a launcher script that invokes the Python
host. Use this when you're editing the host code and want changes to
take effect without rebuilding.

---

## Building the executable yourself

If you want to build the standalone executable locally (e.g., to test a
change before cutting a release):

```bash
pip install "agentao>=0.4.18" "pyinstaller>=6.0"
python scripts/build_native_host.py --clean
```

Output lands in `dist/agentao-chrome-host/`. The `--onefile` flag
produces a single executable instead of a directory (slower startup,
simpler distribution).

---

## Troubleshooting

### Status stays "Disconnected"

1. **Check the manifest exists** in the NativeMessagingHosts directory
   (see the install output for the path).
2. **Check the manifest `path`** points to the real executable. On
   Windows the path must use backslashes.
3. **Check the extension ID** in the manifest's `allowed_origins`
   matches your loaded extension. If you reload with a different key,
   the ID changes — re-run `--install`.
4. **Check the host log**: `~/.agentao-chrome/logs/host.log`
5. **Test the host standalone** — run the executable directly; it
   should start and wait for input (no output). Press Ctrl+C to exit.

### "No provider configured"

Open the extension options page, fill in the API Key, click Save, then
close and reopen the sidebar.

### Host crashes on startup (packaged)

The packaged executable is self-contained. If it crashes, check
`~/.agentao-chrome/logs/host.log`. A missing system library (rare)
would show up there. On macOS, the first run may be blocked by
Gatekeeper — right-click → Open to allow it.

### Host crashes on startup (source)

```bash
python -c "from agentao import Agentao; print('ok')"
```

If that fails, reinstall agentao: `pip install --force-reinstall agentao`.

---

## Attachment parsing

The sidebar accepts file attachments (`.docx`, `.pdf`, `.md`, `.doc`).
The native host parses them into HTML before sending to the LLM, so
tables, images, and formatting are preserved.

| Format | Support | Dependency |
|--------|---------|------------|
| `.docx` | ✅ Full | python-docx (bundled) |
| `.pdf`  | ✅ Full | PyMuPDF (bundled) |
| `.md`   | ✅ Full | None |
| `.doc`  | ⚠️ Needs LibreOffice | See below |

### Legacy `.doc` support (optional)

The binary `.doc` format (OLE compound document) has no reliable pure-
Python parser. The host converts `.doc` → `.docx` via LibreOffice
headless, then reuses the `.docx` extractor. **LibreOffice is optional**
— if it is not installed, `.doc` attachments return a notice instead of
failing; all other formats work normally.

**Install LibreOffice (pick one):**

```bash
# Windows (winget)
winget install TheDocumentFoundation.LibreOffice

# macOS (Homebrew)
brew install --cask libreoffice

# Linux (Debian/Ubuntu)
sudo apt install libreoffice
```

Or download the installer from https://www.libreoffice.org/download/

The host auto-detects `soffice` on `PATH` and in the standard install
directories (`C:\Program Files\LibreOffice\program\` on Windows,
`/Applications/LibreOffice.app/Contents/MacOS/` on macOS). No
configuration needed after install.

> **Tip:** If you use a portable build or a non-standard location, add
> its `soffice`/`libreoffice` binary to your `PATH` so the host can find
> it.

---

## Uninstall

1. Remove the manifest from the NativeMessagingHosts directory (and the
   Windows registry entry if applicable).
2. Delete the host executable / folder.
3. Uninstall the extension from `chrome://extensions/`.
4. Optionally: `rm -rf ~/.agentao-chrome/` (logs + workspace).
