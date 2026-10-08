"""Shared native-host installation logic.

Used by two entry points:

1. ``native_host.py --install`` — when the host is a frozen PyInstaller
   executable, this writes the manifest and registers it. The user runs
   the downloaded executable once with ``--install`` and is done.

2. ``scripts/install_native_host.py`` — the source-tree installer for
   development, when the host runs from Python source.

Both call :func:`install_host`, which:

- Builds the manifest as a dict and serializes it with ``json.dumps``
  (so Windows backslash paths are correctly escaped).

- Writes the manifest to the canonical (Chrome) NativeMessagingHosts
  directory, plus a copy per supported Chromium browser on macOS/Linux
  (each browser reads only its own directory there).

- On Windows, registers the manifest path under every supported
  Chromium browser's HKCU registry key (Chrome, Edge, Brave, Chromium,
  Vivaldi), so any of them can launch the host.

- Returns an :class:`InstallResult` with the paths written and the
  browsers that were registered.

Firefox is intentionally not covered: it requires a different manifest
format (``browser_specific_settings`` + a gecko id, ``moz-extension://``
origins) and lacks the ``chrome.sidePanel`` / ``chrome.debugger`` APIs
this project is built on.
"""

from __future__ import annotations

import json
import shutil
import stat
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────

HOST_NAME = "com.agentao.chrome_extension"

# The extension ID derived from the RSA public key in manifest.json's `key`
# field. Because the key is fixed, this ID is the same on every machine —
# users do not need to copy it from chrome://extensions/. The installer
# uses this as the default when --extension-id is not provided.
DEFAULT_EXTENSION_ID = "oceidmjneaojejdaonljejgpgjlafbpo"

# ── Platform detection ────────────────────────────────────────────────

def is_windows() -> bool:
    return sys.platform.startswith("win")

def is_macos() -> bool:
    return sys.platform == "darwin"

# ── Supported browsers ────────────────────────────────────────────────

@dataclass(frozen=True)
class BrowserTarget:
    """One Chromium-family browser the host can be registered with."""

    name: str
    # Windows: HKCU registry subkey whose default value points at the
    # manifest file. None on other platforms (they use directories only).
    windows_subkey: Optional[str]
    # macOS: path segments under ~/Library/Application Support.
    macos_dir: str
    # Linux: path segments under ~/.config.
    linux_dir: str

BROWSERS = [
    BrowserTarget(
        "Chrome",
        r"SOFTWARE\Google\Chrome\NativeMessagingHosts",
        "Google/Chrome",
        "google-chrome",
    ),
    BrowserTarget(
        "Edge",
        r"SOFTWARE\Microsoft\Edge\NativeMessagingHosts",
        "Microsoft Edge",
        "microsoft-edge",
    ),
    BrowserTarget(
        "Brave",
        r"SOFTWARE\BraveSoftware\Brave-Browser\NativeMessagingHosts",
        "BraveSoftware/Brave-Browser",
        "BraveSoftware/Brave-Browser",
    ),
    BrowserTarget(
        "Chromium",
        r"SOFTWARE\Chromium\NativeMessagingHosts",
        "Chromium",
        "chromium",
    ),
    BrowserTarget(
        "Vivaldi",
        r"SOFTWARE\Vivaldi\NativeMessagingHosts",
        "Vivaldi",
        "vivaldi",
    ),
]

def _browser_data_dir(target: BrowserTarget) -> Path:
    """The browser's profile-data root for the current OS."""
    home = Path.home()
    if is_macos():
        return home / "Library" / "Application Support" / Path(target.macos_dir)
    if is_windows():
        return home / "AppData" / "Local" / Path(target.macos_dir) / "User Data"
    # Linux / other Unix
    return home / ".config" / Path(target.linux_dir)

def browser_messaging_dirs() -> list[tuple[BrowserTarget, Path]]:
    """Per-browser NativeMessagingHosts directories for the current OS.

    The first entry is always Chrome — the canonical location that also
    receives the manifest file on Windows (other Windows browsers find it
    through their registry key, which points at this same file).
    """
    return [
        (target, _browser_data_dir(target) / "NativeMessagingHosts")
        for target in BROWSERS
    ]

def native_messaging_dir() -> Path:
    """The canonical (Chrome) NativeMessagingHosts directory for the current OS."""
    return browser_messaging_dirs()[0][1]

# ── Result ────────────────────────────────────────────────────────────

@dataclass
class InstallResult:
    manifest_path: Path
    host_path: Path
    launcher_path: Optional[Path]
    platform: str
    registered_in_registry: bool
    # Every manifest file written (canonical first, per-browser copies after).
    manifest_paths: list[Path] = field(default_factory=list)
    # Browser names that received the registration (Windows: registry write
    # succeeded; macOS/Linux: manifest copy present in their directory).
    browsers_registered: list[str] = field(default_factory=list)

# ── Install ───────────────────────────────────────────────────────────

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
        host_path: Path to the executable that the browser should launch.
            When the host is frozen, this is the PyInstaller exe. When
            running from source, this is a launcher script that invokes
            Python.
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
        InstallResult with the paths written and the browsers registered.
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
    manifest_paths = [manifest_path]
    browsers_registered: list[str] = []
    registered = False

    if is_windows():
        if not skip_registry:
            registry_results = _register_windows_registry(manifest_path)
            browsers_registered = [
                name for name, ok in registry_results.items() if ok
            ]
            registered = bool(browsers_registered)
    else:
        # macOS/Linux: there is no registry — each browser reads its own
        # NativeMessagingHosts directory, so copy the manifest into every
        # supported browser's directory (Chrome already has the original).
        for target, nm_dir in browser_messaging_dirs()[1:]:
            try:
                nm_dir.mkdir(parents=True, exist_ok=True)
                dst = nm_dir / f"{HOST_NAME}.json"
                shutil.copyfile(manifest_path, dst)
                manifest_paths.append(dst)
            except OSError:
                continue
        browsers_registered = [
            target.name
            for target, nm_dir in browser_messaging_dirs()
            if (nm_dir / f"{HOST_NAME}.json").exists()
        ]

    return InstallResult(
        manifest_path=manifest_path,
        host_path=final_host_path,
        launcher_path=launcher_path,
        platform=_platform_name(),
        registered_in_registry=registered,
        manifest_paths=manifest_paths,
        browsers_registered=browsers_registered,
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

def _register_windows_registry(manifest_path: Path) -> dict[str, bool]:
    """Register the manifest path under every supported browser's HKCU key.

    Returns a mapping of browser name -> success. A missing ``winreg``
    (non-Windows) returns an empty mapping. Failures are isolated per
    browser: one denied/broken key does not affect the others.
    """
    try:
        import winreg
    except ImportError:
        return {}

    results: dict[str, bool] = {}
    for target in BROWSERS:
        try:
            with winreg.CreateKey(
                winreg.HKEY_CURRENT_USER, target.windows_subkey
            ) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))
            results[target.name] = True
        except OSError:
            results[target.name] = False
    return results

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
    "DEFAULT_EXTENSION_ID",
    "BrowserTarget",
    "BROWSERS",
    "InstallResult",
    "install_host",
    "native_messaging_dir",
    "browser_messaging_dirs",
    "is_windows",
    "is_macos",
    "is_frozen",
    "frozen_executable_path",
]
