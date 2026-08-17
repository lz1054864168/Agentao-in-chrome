"""Shared native-host installation logic.

Used by two entry points:

1. ``native_host.py --install`` 鈥?when the host is a frozen PyInstaller
   executable, this writes the manifest and registers it. The user runs
   the downloaded executable once with ``--install`` and is done.
2. ``scripts/install_native_host.py`` 鈥?the source-tree installer for
   development, when the host runs from Python source.

Both call :func:`install_host`, which:

- Builds the manifest as a dict and serializes it with ``json.dumps``
  (so Windows backslash paths are correctly escaped).
- Writes the manifest to the OS-specific NativeMessagingHosts directory.
- On Windows, registers the manifest path in the registry.
- Returns a result dict with the paths written.
"""

from __future__ import annotations

import json
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# 鈹€鈹€ Constants 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

HOST_NAME = "com.agentao.chrome_extension"

# The extension ID derived from the RSA public key in manifest.json's `key`
# field. Because the key is fixed, this ID is the same on every machine —
# users do not need to copy it from chrome://extensions/. The installer
# uses this as the default when --extension-id is not provided.
DEFAULT_EXTENSION_ID = "oceidmjneaojejdaonljejgpgjlafbpo"


# 鈹€鈹€ Platform detection 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€


def is_windows() -> bool:
    return sys.platform.startswith("win")


def is_macos() -> bool:
    return sys.platform == "darwin"


def native_messaging_dir() -> Path:
    """The Chrome NativeMessagingHosts directory for the current OS."""
    home = Path.home()
    if is_macos():
        return (
            home
            / "Library"
            / "Application Support"
            / "Google"
            / "Chrome"
            / "NativeMessagingHosts"
        )
    if is_windows():
        return (
            home
            / "AppData"
            / "Local"
            / "Google"
            / "Chrome"
            / "User Data"
            / "NativeMessagingHosts"
        )
    # Linux / other Unix
    return home / ".config" / "google-chrome" / "NativeMessagingHosts"


# 鈹€鈹€ Result 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€


@dataclass
class InstallResult:
    manifest_path: Path
    host_path: Path
    launcher_path: Optional[Path]
    platform: str
    registered_in_registry: bool


# 鈹€鈹€ Install 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€


def install_host(
    host_path: Path,
    extension_id: str,
    *,
    create_launcher: bool = False,
    python_executable: Optional[str] = None,
    skip_registry: bool = False,
) -> InstallResult:
    """Install the native messaging host manifest.

    Args:
        host_path: Path to the executable that Chrome should launch. When
            the host is frozen, this is the PyInstaller exe. When running
            from source, this is a launcher script that invokes Python.
        extension_id: The Chrome extension ID (32-char string).
        create_launcher: If True, create a launcher script that runs the
            Python source host (used by the source-tree installer). If
            False, ``host_path`` is used directly (frozen exe path).
        python_executable: Python interpreter for the launcher script
            (only used when ``create_launcher=True``).
        skip_registry: If True, do not write to the Windows registry.
            Tests use this to avoid clobbering the real registry entry
            with a temp-directory manifest path.

    Returns:
        InstallResult with the paths written.
    """
    if not extension_id:
        raise ValueError("extension_id is required")

    launcher_path: Optional[Path] = None
    final_host_path = host_path

    if create_launcher:
        if not python_executable:
            python_executable = sys.executable
        launcher_path = _create_launcher(host_path, python_executable)
        final_host_path = launcher_path

    manifest_path = _write_manifest(final_host_path, extension_id)
    registered = False
    if is_windows() and not skip_registry:
        _register_windows_registry(manifest_path)
        registered = True

    return InstallResult(
        manifest_path=manifest_path,
        host_path=final_host_path,
        launcher_path=launcher_path,
        platform=_platform_name(),
        registered_in_registry=registered,
    )


def _write_manifest(host_path: Path, extension_id: str) -> Path:
    """Build the manifest as a dict and write it to the NM directory.

    Using ``json.dumps`` (not string template replacement) ensures
    Windows backslash paths are correctly escaped in the JSON output.
    """
    manifest = {
        "name": HOST_NAME,
        "description": "Agentao in Chrome native messaging host",
        "path": str(host_path),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }
    manifest_text = json.dumps(manifest, indent=2) + "\n"

    nm_dir = native_messaging_dir()
    nm_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = nm_dir / f"{HOST_NAME}.json"
    manifest_path.write_text(manifest_text, encoding="utf-8")
    return manifest_path


def _create_launcher(host_script: Path, python_executable: str) -> Path:
    """Create a launcher script that runs the Python host from source."""
    launcher_dir = host_script.parent
    if is_windows():
        launcher = launcher_dir / "agentao-chrome-host.bat"
        content = f'@echo off\r\nset PYTHONHOME=\r\nset PYTHONPATH=\r\n"{python_executable}" "{host_script}"\r\n'
        launcher.write_text(content, encoding="ascii")
        return launcher

    launcher = launcher_dir / "agentao-chrome-host.sh"
    content = f"""#!/bin/sh
exec "{python_executable}" "{host_script}"
"""
    launcher.write_text(content, encoding="utf-8")
    mode = launcher.stat().st_mode
    launcher.chmod(mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
    return launcher


def _register_windows_registry(manifest_path: Path) -> None:
    """On Windows, register the manifest path in the registry."""
    try:
        import winreg
    except ImportError:
        return

    key_path = rf"SOFTWARE\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))
    except OSError:
        pass


def _platform_name() -> str:
    if is_windows():
        return "windows"
    if is_macos():
        return "macos"
    return "linux"


def is_frozen() -> bool:
    """True when running inside a PyInstaller bundle."""
    return getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS")


def frozen_executable_path() -> Path:
    """The path to the frozen executable (or the script when not frozen)."""
    if is_frozen():
        return Path(sys.executable).resolve()
    return Path(sys.argv[0]).resolve()


__all__ = [
    "HOST_NAME",
    "InstallResult",
    "install_host",
    "native_messaging_dir",
    "is_windows",
    "is_macos",
    "is_frozen",
    "frozen_executable_path",
]
