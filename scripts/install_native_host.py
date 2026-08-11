"""Install the Agentao Chrome Native Messaging host (source-tree mode).

This is the development installer — it runs the host from Python source
via a launcher script. For the packaged (frozen) installer, run the
built executable directly with ``--install``.

Usage::

    python scripts/install_native_host.py --extension-id <ID> [--python <path>]

The extension ID is the 32-char string from chrome://extensions/
(Developer mode). The script:

1. Creates a launcher script (``agentao-chrome-host.bat`` on Windows,
   ``agentao-chrome-host.sh`` on macOS/Linux) that runs the Python host.
2. Writes the Native Messaging manifest to the OS-specific directory.
3. On Windows, registers the manifest in the registry.
4. Creates a ``.env`` template if one does not exist.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add native-host/ to the path so we can import the shared installer.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
HOST_DIR = PROJECT_ROOT / "native-host"
sys.path.insert(0, str(HOST_DIR))

from installer import HOST_NAME, install_host  # noqa: E402

HOST_PY = HOST_DIR / "native_host.py"


def ensure_env_file() -> None:
    """Create a .env template if one does not exist."""
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        return
    template = (
        "# Agentao in Chrome — model provider configuration\n"
        "# The extension options page writes to chrome.storage.local and\n"
        "# sends config to the host at runtime; this .env is a fallback\n"
        "# for running the host standalone for debugging.\n\n"
        "OPENAI_API_KEY=\n"
        "OPENAI_BASE_URL=https://api.openai.com/v1\n"
        "OPENAI_MODEL=gpt-4o\n"
    )
    env_path.write_text(template, encoding="utf-8")
    print(f"Created {env_path} — edit it to set your API key.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install the Agentao Chrome Native Messaging host (source mode)."
    )
    parser.add_argument(
        "--extension-id",
        required=True,
        help="The Chrome extension ID (from chrome://extensions/).",
    )
    parser.add_argument(
        "--python",
        default=sys.executable,
        help=f"Python interpreter to use (default: {sys.executable}).",
    )
    args = parser.parse_args()

    if not HOST_PY.exists():
        print(f"ERROR: host script not found: {HOST_PY}", file=sys.stderr)
        return 1

    print(f"Installing with python: {args.python}")
    result = install_host(
        HOST_PY,
        args.extension_id,
        create_launcher=True,
        python_executable=args.python,
    )

    print(f"\n✓ Native Messaging host installed ({result.platform})")
    print(f"  manifest: {result.manifest_path}")
    print(f"  host:     {result.host_path}")
    if result.launcher_path:
        print(f"  launcher: {result.launcher_path}")
    if result.registered_in_registry:
        print(
            f"  registry: HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\{HOST_NAME}"
        )

    ensure_env_file()

    print("\nNext steps:")
    print("  1. Install agentao:  pip install agentao   (or: uv sync)")
    print("  2. Configure your API key in the extension options page")
    print("  3. Reload the extension in chrome://extensions/")
    print("  4. Open the sidebar and start chatting")
    return 0


if __name__ == "__main__":
    sys.exit(main())
