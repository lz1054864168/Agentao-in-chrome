"""Build the Agentao Chrome native host into a standalone executable.

Uses PyInstaller to freeze ``native_host.py`` + the agentao runtime +
all dependencies into a single on-disk directory (``dist/agentao-chrome-host/``).
The resulting executable needs no Python installation on the target
machine — users download it and run::

    agentao-chrome-host --install --extension-id <ID>

Usage::

    python scripts/build_native_host.py [--clean] [--onefile]

Options:
    --clean    Remove dist/ and build/ before building.
    --onefile  Build a single-file executable instead of onedir.
               (Slower startup; simpler distribution. Default: onedir.)

The build output lands in ``dist/agentao-chrome-host/`` (onedir) or
``dist/agentao-chrome-host<exe>`` (onefile).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
HOST_DIR = PROJECT_ROOT / "native-host"
HOST_PY = HOST_DIR / "native_host.py"
DIST_DIR = PROJECT_ROOT / "dist"
BUILD_DIR = PROJECT_ROOT / "build"
APP_NAME = "agentao-chrome-host"


def ensure_pyinstaller() -> None:
    """Ensure PyInstaller is installed; install if missing."""
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("PyInstaller not found; installing...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pyinstaller"],
            stdout=subprocess.DEVNULL,
        )


def build(clean: bool, onefile: bool) -> Path:
    """Run PyInstaller and return the output directory/file path."""
    if clean:
        for d in (DIST_DIR, BUILD_DIR):
            if d.exists():
                print(f"cleaning {d}")
                shutil.rmtree(d)

    # PyInstaller needs to run from the host dir so it can find the
    # local modules (agentao_transport, host_protocol, installer).
    args = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(HOST_PY),
        "--name",
        APP_NAME,
        "--noconfirm",
        "--clean",
        # Hide the console window on Windows (the host is a background
        # process; a flashing console window would be confusing). On
        # macOS/Linux this flag is ignored.
        "--windowed",
        # Collect agentao's data files (skills, prompts) into the bundle.
        # agentao ships skills/skill-creator as package data; PyInstaller
        # needs --collect-data to include them.
        "--collect-data",
        "agentao",
        # Collect all submodules so dynamic imports (agentao.tools.*,
        # agentao.skills.*) are bundled.
        "--collect-submodules",
        "agentao",
        # Hidden imports: agentao uses dynamic imports for tools and
        # skills that PyInstaller's static analysis may miss.
        "--hidden-import",
        "agentao.tools",
        "--hidden-import",
        "agentao.skills",
        "--hidden-import",
        "agentao.mcp",
        "--hidden-import",
        "agentao.plugins",
        # The host's sibling modules must be on the path.
        "--paths",
        str(HOST_DIR),
    ]

    if onefile:
        args.append("--onefile")
    else:
        args.append("--onedir")

    print(f"running PyInstaller: {' '.join(args)}")
    subprocess.check_call(args, cwd=str(PROJECT_ROOT))

    if onefile:
        exe_name = (
            f"{APP_NAME}.exe" if sys.platform.startswith("win") else APP_NAME
        )
        return DIST_DIR / exe_name
    return DIST_DIR / APP_NAME


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the Agentao Chrome native host executable."
    )
    parser.add_argument(
        "--clean", action="store_true", help="Remove dist/ and build/ first."
    )
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="Build a single-file executable (slower startup).",
    )
    args = parser.parse_args()

    ensure_pyinstaller()
    output = build(clean=args.clean, onefile=args.onefile)
    print(f"\n✓ Built: {output}")
    print(f"  size: {output.stat().st_size / 1024 / 1024:.1f} MB")
    print("\nTo install on this machine:")
    if sys.platform.startswith("win"):
        print(f'  "{output}" --install --extension-id <ID>')
    else:
        print(f'  "{output}" --install --extension-id <ID>')
    print("\nTo distribute: zip the dist/agentao-chrome-host/ folder")
    print("(onedir) or ship the single executable (onefile).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
