"""One-off inspection of the Guanlan KB structure (read-only).

Answers, from the live MCP server:
  1. How many pages, and what page types exist?
  2. Do any pages look like project records (立项/项目)?
  3. What does the frontmatter convention look like on a sample page?
"""

from __future__ import annotations

import json
from collections import Counter

from agentao.mcp import McpClientManager

SERVERS = {"guanlan": {"type": "http", "url": "http://127.0.0.1:8766/mcp", "timeout": 30}}


def main() -> None:
    manager = McpClientManager(SERVERS)
    manager.connect_all()

    pages = json.loads(manager.call_tool("guanlan", "list_pages", {}))["pages"]
    print(f"total pages: {len(pages)}")
    types = Counter(p.get("type", "?") for p in pages)
    print("type distribution:", dict(types))

    # Any project-like pages?
    hits = [p for p in pages if any(k in p.get("path", "") for k in ("project", "项目", "立项"))]
    print(f"project-like pages: {len(hits)}")
    for p in hits[:10]:
        print("  -", p["path"], "|", p.get("title"))

    # Show a sample entity page's frontmatter to learn the KB convention.
    sample = next((p for p in pages if p.get("type") == "entity"), None) or pages[0]
    print(f"\nsample page: {sample['path']}")
    body = manager.call_tool("guanlan", "read_page", {"path": sample["path"]})
    text = str(body)
    # frontmatter is the leading --- block; show at most 25 lines.
    lines = text.splitlines()
    if lines and lines[0].strip() == "---":
        end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), 25)
        print("\n".join(lines[: min(end + 1, 25)]))
    else:
        print("\n".join(lines[:15]))

    manager.disconnect_all()


if __name__ == "__main__":
    main()
