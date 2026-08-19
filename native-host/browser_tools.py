"""Browser tools that drive the active Chrome tab via the extension's CDP bridge.

Each tool is a sync :class:`agentao.tools.base.Tool` subclass. When the
agent invokes one, it calls ``transport.browser_request(action, params)``
which posts a ``browser_request`` message to the extension and blocks
until the extension executes the CDP command and replies with a
``browser_response``. The extension side (service-worker-runtime.js)
attaches ``chrome.debugger`` to the active tab and runs the command.

Threading: these tools run on the agentao worker thread (same as
confirm_tool / ask_user). The transport's _PendingRequest event handles
the blocking wait, so no async plumbing is needed.
"""

from __future__ import annotations

import base64
from typing import Any, Dict, Optional

from agentao.tools.base import Tool


def _set_transport(tool: "_BrowserToolBase", transport: Any) -> None:
    """Bind the transport onto a browser tool instance.

    Called by native_host.py after constructing the agent — the tools
    need a reference to the AgentaoChromeTransport to make the round-trip
    call. We can't pass it through the constructor because agentao's
    Tool base class has a no-arg __init__.
    """
    tool._transport = transport  # type: ignore[attr-defined]


class _BrowserToolBase(Tool):
    """Shared base: holds the transport reference and runs the round-trip."""

    def __init__(self) -> None:
        super().__init__()
        self._transport: Optional[Any] = None

    @property
    def is_read_only(self) -> bool:
        # Subclasses override; default to False (browser actions mutate state).
        return False

    def _call(self, action: str, params: dict) -> str:
        if self._transport is None:
            return "ERROR: browser tool not bound to a transport"
        resp = self._transport.browser_request(action, params)
        if not isinstance(resp, dict):
            return f"ERROR: invalid response from extension: {resp!r}"
        if not resp.get("ok"):
            return f"ERROR: {resp.get('error', 'unknown error')}"
        data = resp.get("data")
        if isinstance(data, str):
            return data
        return _to_compact_json(data)


def _to_compact_json(value: Any, max_len: int = 8000) -> str:
    import json

    try:
        s = json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        s = str(value)
    if len(s) > max_len:
        s = s[:max_len] + f"\n... ({len(s) - max_len} more chars)"
    return s


class BrowserNavigateTool(_BrowserToolBase):
    """Navigate the active tab to a URL."""

    @property
    def name(self) -> str:
        return "browser_navigate"

    @property
    def description(self) -> str:
        return (
            "Navigate the active browser tab to a URL. "
            "Use this to open a web page for the agent to read or interact with."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to navigate to (e.g. https://example.com).",
                },
            },
            "required": ["url"],
        }

    @property
    def is_read_only(self) -> bool:
        return False

    def execute(self, **kwargs) -> str:
        url = kwargs.get("url", "").strip()
        if not url:
            return "ERROR: url is required"
        return self._call("navigate", {"url": url})


class BrowserScreenshotTool(_BrowserToolBase):
    """Capture a screenshot of the active tab."""

    @property
    def name(self) -> str:
        return "browser_screenshot"

    @property
    def description(self) -> str:
        return (
            "Capture a screenshot of the active browser tab. "
            "Returns the image as a base64 PNG data URI."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "enum": ["png", "jpeg"],
                    "description": "Image format. Defaults to png.",
                    "default": "png",
                },
            },
            "required": [],
        }

    @property
    def is_read_only(self) -> bool:
        return True

    def execute(self, **kwargs) -> str:
        fmt = kwargs.get("format", "png")
        return self._call("screenshot", {"format": fmt})


class BrowserEvalTool(_BrowserToolBase):
    """Execute JavaScript in the active tab and return the result."""

    @property
    def name(self) -> str:
        return "browser_eval"

    @property
    def description(self) -> str:
        return (
            "Execute JavaScript in the active browser tab and return the result. "
            "Use this to read the DOM, extract text, query element attributes, "
            "or run any page-side computation. The expression must evaluate "
            "to a JSON-serializable value."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": (
                        "JavaScript expression to evaluate in the page. "
                        "Must evaluate to a value — use a bare expression "
                        "(e.g. document.title) or wrap multi-statement logic "
                        "in an IIFE (e.g. (() => { ... return x; })()). "
                        "Do NOT use a top-level return statement — it causes "
                        "'Illegal return statement'."
                    ),
                },
            },
            "required": ["expression"],
        }

    @property
    def is_read_only(self) -> bool:
        # eval can mutate the page; treat as non-readonly so it goes through
        # confirmation in permission modes that gate writes.
        return False

    def execute(self, **kwargs) -> str:
        expr = kwargs.get("expression", "")
        if not expr:
            return "ERROR: expression is required"
        return self._call("eval", {"expression": expr})


class BrowserClickTool(_BrowserToolBase):
    """Click an element in the active tab by CSS selector."""

    @property
    def name(self) -> str:
        return "browser_click"

    @property
    def description(self) -> str:
        return (
            "Click an element in the active browser tab by CSS selector. "
            "The element is scrolled into view before clicking."
        )

    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": "CSS selector for the element to click.",
                },
            },
            "required": ["selector"],
        }

    @property
    def is_read_only(self) -> bool:
        return False

    def execute(self, **kwargs) -> str:
        selector = kwargs.get("selector", "").strip()
        if not selector:
            return "ERROR: selector is required"
        return self._call("click", {"selector": selector})


def all_browser_tools() -> list:
    """Return fresh instances of all browser tools."""
    return [
        BrowserNavigateTool(),
        BrowserScreenshotTool(),
        BrowserEvalTool(),
        BrowserClickTool(),
    ]


__all__ = [
    "BrowserNavigateTool",
    "BrowserScreenshotTool",
    "BrowserEvalTool",
    "BrowserClickTool",
    "all_browser_tools",
    "_set_transport",
]
