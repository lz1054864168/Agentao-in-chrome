"""Probe the local Guanlan MCP server with agentao's own MCP client.

Exercises the exact code path the Chrome native host uses:
McpClientManager(configs) -> connect_all() -> get_all_tools() -> call_tool().

Usage:
    python scripts/probe_guanlan_mcp.py [query]

Only read-only calls are made (list_pages / search), so this is safe to run
against a production knowledge base.
"""

from __future__ import annotations

import sys

from agentao.mcp import McpClientManager

URL = "http://127.0.0.1:8766/mcp"

# Mirrors what would live in ~/.agentao/mcp.json
SERVERS = {
    "guanlan": {
        "type": "http",
        "url": URL,
        "timeout": 30,
    }
}


def main() -> int:
    manager = McpClientManager(SERVERS)
    print(f"[1] connecting: {URL}")
    manager.connect_all()
    client = manager.get_client("guanlan")
    if client is None or str(client.status) != "CONNECTED" and "CONNECTED" not in str(client.status):
        status = getattr(client, "status", "no-client")
        print(f"FAIL: server did not connect (status={status})")
        return 1
    print(f"[2] connected OK (status={client.status}, trusted={client.is_trusted})")

    tools = manager.get_all_tools()
    print(f"[3] discovered {len(tools)} tool(s):")
    for server_name, tool_def in tools:
        desc = (tool_def.description or "").strip().splitlines()
        first = desc[0] if desc else ""
        print(f"    - {server_name}.{tool_def.name}: {first}")

    # Pick a read-only discovery tool and call it end-to-end.
    tool_names = {t.name for _, t in tools}
    query = sys.argv[1] if len(sys.argv) > 1 else "测试"
    for candidate, args in (
        ("list_pages", {}),
        ("search", {"query": query}),
    ):
        if candidate in tool_names:
            print(f"[4] calling read-only tool {candidate}({args}) ...")
            result = manager.call_tool("guanlan", candidate, args)
            text = str(result)
            head = text[:600].replace("\n", " ⏎ ")
            tail = f" ... ({len(text)} chars total)" if len(text) > 600 else ""
            print(f"    result: {head}{tail}")
            break
    else:
        print("[4] no read-only discovery tool found; skipping call test")

    manager.disconnect_all()
    print("[5] disconnected cleanly — ALL GOOD")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
