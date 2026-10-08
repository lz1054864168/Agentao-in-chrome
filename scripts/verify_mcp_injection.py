"""End-to-end verification of the UI-managed MCP injection path.

Simulates exactly what native_host._rebuild_agent does after the options
page saves MCP servers:

    UI entries -> _normalize_mcp_servers() -> merge with file config
    -> InMemoryMCPRegistry -> Agentao(mcp_registry=...) -> tools registered

Run with the local Guanlan server up (default http://127.0.0.1:8766/mcp):

    python scripts/verify_mcp_injection.py
"""

from __future__ import annotations

import logging
import shutil
import sys
import tempfile
from pathlib import Path

HOST_DIR = Path(__file__).resolve().parent.parent / "native-host"
sys.path.insert(0, str(HOST_DIR))

import native_host  # noqa: E402


def check(label: str, ok: bool, detail: str = "") -> bool:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    return ok


def main() -> int:
    normalize = native_host.NativeHost._normalize_mcp_servers

    # ── 1. Sanitizer semantics ──────────────────────────────────────
    raw = [
        {  # valid http entry (the Guanlan case)
            "name": "guanlan",
            "type": "http",
            "url": "http://127.0.0.1:8766/mcp",
            "timeout": 30,
            "trust": True,
            "enabled": True,
        },
        {  # disabled → dropped
            "name": "disabled-one",
            "type": "http",
            "url": "http://127.0.0.1:1/mcp",
            "enabled": False,
        },
        {  # invalid name → dropped
            "name": "bad name!",
            "type": "http",
            "url": "http://127.0.0.1:2/mcp",
        },
        {  # bad url → dropped
            "name": "badurl",
            "type": "http",
            "url": "ftp://nope",
        },
        {  # valid stdio entry (kept, but not connected here)
            "name": "local-tool",
            "type": "stdio",
            "command": "python",
            "args": ["-c", "pass"],
        },
        {  # streamable-http alias → folded to http
            "name": "alias-server",
            "type": "streamable-http",
            "url": "https://example.com/mcp",
            "headers": {"Authorization": "Bearer t"},
        },
    ]
    servers = normalize(raw)
    ok = True
    ok &= check(
        "normalize keeps valid entries",
        set(servers) == {"guanlan", "local-tool", "alias-server"},
        str(sorted(servers)),
    )
    ok &= check("alias folded to http", servers.get("alias-server", {}).get("type") == "http")
    ok &= check("trust propagated", servers.get("guanlan", {}).get("trust") is True)
    ok &= check("headers kept", servers.get("alias-server", {}).get("headers") == {"Authorization": "Bearer t"})
    ok &= check(
        "stdio keeps command+args",
        servers.get("local-tool", {}).get("args") == ["-c", "pass"],
    )

    # ── 2. UI overrides file config on name collision ───────────────
    file_servers = {"guanlan": {"type": "http", "url": "http://old.example/mcp"}}
    merged = dict(file_servers)
    merged.update(servers)
    ok &= check(
        "UI wins name collision",
        merged["guanlan"]["url"] == "http://127.0.0.1:8766/mcp",
    )

    # ── 3. Live injection through a real Agentao instance ───────────
    from agentao.mcp.registry import InMemoryMCPRegistry
    from agentao import Agentao

    registry = InMemoryMCPRegistry(merged)

    class _StubLLM:
        model = "gpt-4o"
        logger = logging.getLogger("stub")

    tmp = Path(tempfile.mkdtemp(prefix="agentao-mcp-verify-"))
    try:
        agent = Agentao(
            working_directory=Path(tmp),
            llm_client=_StubLLM(),
            mcp_registry=registry,
        )
        tool_names = sorted(n for n in agent.tools.tools if n.startswith("mcp_"))
        ok &= check(
            "Agentao(mcp_registry=...) registers guanlan tools",
            len([n for n in tool_names if n.startswith("mcp_guanlan_")]) >= 5,
            f"{len(tool_names)} MCP tools: {tool_names[:8]}{'...' if len(tool_names) > 8 else ''}",
        )
        manager = agent.mcp_manager
        guanlan_client = manager.get_client("guanlan") if manager else None
        status = str(getattr(guanlan_client, "status", "")).replace("ServerStatus.", "").lower()
        ok &= check("guanlan actually connected", status == "connected", status)

        # ── 4. mcp_status payload shape (what the options page renders) ──
        native_host_host = native_host.NativeHost.__new__(native_host.NativeHost)
        native_host_host._agent = agent
        captured = []
        original_send = native_host._send_message
        native_host._send_message = lambda m: captured.append(m)
        try:
            native_host_host._send_mcp_status()
        finally:
            native_host._send_message = original_send
        payload = captured[0] if captured else {}
        entries = {s["name"]: s for s in payload.get("servers", [])}
        ok &= check(
            "mcp_status reports guanlan connected with tools",
            entries.get("guanlan", {}).get("status") == "connected"
            and len(entries.get("guanlan", {}).get("tools", [])) >= 5,
            str({k: {"status": v.get("status"), "tools": len(v.get("tools", []))} for k, v in entries.items()}),
        )

        agent.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    print("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
