"""Agentao Transport that bridges runtime events to the Chrome extension.

This implements agentao's ``Transport`` protocol (see
``agentao/transport/base.py``). The runtime calls ``emit(event)`` for
fire-and-forget events and ``confirm_tool`` / ``ask_user`` for blocking
request-response interactions.

Threading model
---------------
The Native Messaging read loop runs on the **main thread** (it must —
Chrome communicates with the host over stdin/stdout, and the host process
stays alive as long as stdin is open). Agentao's ``agent.chat()`` runs on
a **worker thread** (started by ``NativeHost._run_chat``).

When the runtime calls ``confirm_tool`` (on the worker thread), this
transport:

1. Generates a ``requestId``.
2. Posts a ``permission_request`` message to the extension (via the
   shared ``_post_message`` callback, which writes to stdout on the main
   thread — stdout writes from multiple threads are serialized by the
   GIL but we still route through a single writer queue to be safe).
3. Registers a ``threading.Event`` in ``_pending_permission`` and blocks
   on it.
4. The main-thread read loop receives ``permission_response``, looks up
   the ``requestId``, sets the result, and signals the event.
5. ``confirm_tool`` returns the boolean result.

``ask_user`` works the same way. Both have a timeout so a missing
response does not wedge the worker thread forever.
"""

from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Callable, Dict, Generic, List, Optional, TypeVar

from agentao.transport import NullTransport
from agentao.transport.events import AgentEvent

from host_protocol import HOST_TO_EXT


class AgentaoChromeTransport(NullTransport):
    """Transport that forwards agentao events to the Chrome extension.

    Subclasses ``NullTransport`` so the ``subscribe`` / ``emit`` plumbing
    (EventBroadcaster) is inherited; we override ``emit`` to also post
    the event to the extension, and override ``confirm_tool`` /
    ``ask_user`` to round-trip through the extension UI.
    """

    def __init__(
        self,
        post_message: Callable[[Dict[str, Any]], None],
        request_timeout_s: float = 60.0,
    ) -> None:
        super().__init__()
        self._post_message = post_message
        self._request_timeout_s = request_timeout_s
        self._pending_permission: Dict[str, _PendingRequest[bool]] = {}
        self._pending_ask_user: Dict[str, _PendingRequest[str]] = {}
        self._pending_browser: Dict[str, _PendingRequest[dict]] = {}
        self._lock = threading.Lock()

    # ── emit: forward every event to the extension ───────────────────

    def emit(self, event: AgentEvent) -> None:
        # Let NullTransport's broadcaster notify subscribers (replay etc.)
        super().emit(event)
        try:
            self._post_message(
                {
                    "type": HOST_TO_EXT["chat_event"],
                    "event": _event_to_dict(event),
                }
            )
        except Exception:
            # emit must not raise — swallow transport errors
            pass

    # ── confirm_tool: round-trip to the extension ────────────────────

    def confirm_tool(self, tool_name: str, description: str, args: dict) -> bool:
        request_id = _new_request_id()
        pending = _PendingRequest[bool]()
        with self._lock:
            self._pending_permission[request_id] = pending

        self._post_message(
            {
                "type": HOST_TO_EXT["permission_request"],
                "requestId": request_id,
                "toolName": tool_name,
                "description": description,
                "args": _safe_args(args),
            }
        )

        result = pending.wait(self._request_timeout_s)
        with self._lock:
            self._pending_permission.pop(request_id, None)

        if result is None:
            # Timeout — deny by default (fail-closed).
            return False
        return result

    # ── ask_user: round-trip to the extension ────────────────────────

    def ask_user(
        self,
        question: str,
        *,
        header: Optional[str] = None,
        options: Optional[List[str]] = None,
        multiple: bool = False,
        allow_custom: bool = True,
    ) -> str:
        request_id = _new_request_id()
        pending = _PendingRequest[str]()
        with self._lock:
            self._pending_ask_user[request_id] = pending

        self._post_message(
            {
                "type": HOST_TO_EXT["ask_user_request"],
                "requestId": request_id,
                "question": question,
                "header": header,
                "options": options,
                "multiple": multiple,
                "allowCustom": allow_custom,
            }
        )

        result = pending.wait(self._request_timeout_s)
        with self._lock:
            self._pending_ask_user.pop(request_id, None)

        if result is None:
            return "[timeout]"
        return result

    # ── on_max_iterations: stop the turn ──────────────────────────────

    def on_max_iterations(self, count: int, messages: list) -> dict:
        return {"action": "stop"}

    # ── Entry points for the main-thread read loop ───────────────────

    def resolve_permission(self, request_id: str, allowed: bool) -> None:
        with self._lock:
            pending = self._pending_permission.get(request_id)
        if pending is not None:
            pending.set_result(allowed)

    def resolve_ask_user(self, request_id: str, answer: str) -> None:
        with self._lock:
            pending = self._pending_ask_user.get(request_id)
        if pending is not None:
            pending.set_result(answer)

    # -- browser_request: round-trip a CDP command to the extension ---

    def browser_request(self, action, params):
        """Send a browser action to the extension and block for the result.

        action is one of: navigate | screenshot | eval | click.
        params is the action-specific payload. Returns the extension's
        response dict ({ok: bool, data: ..., error: ...}). On timeout
        returns {ok: False, error: 'timeout'}.
        """
        request_id = _new_request_id()
        pending = _PendingRequest[dict]()
        with self._lock:
            self._pending_browser[request_id] = pending

        self._post_message(
            {
                "type": HOST_TO_EXT["browser_request"],
                "requestId": request_id,
                "action": action,
                "params": _safe_args(params),
            }
        )

        result = pending.wait(self._request_timeout_s)
        with self._lock:
            self._pending_browser.pop(request_id, None)

        if result is None:
            return {"ok": False, "error": "timeout"}
        return result

    def resolve_browser(self, request_id, response):
        with self._lock:
            pending = self._pending_browser.get(request_id)
        if pending is not None:
            pending.set_result(response)


T = TypeVar("T")


class _PendingRequest(Generic[T]):
    """A one-shot result box with a timeout-aware wait."""

    __slots__ = ("_event", "_result", "_has_result")

    def __init__(self) -> None:
        self._event = threading.Event()
        self._result: Any = None
        self._has_result = False

    def set_result(self, value: Any) -> None:
        self._result = value
        self._has_result = True
        self._event.set()

    def wait(self, timeout_s: float) -> Any:
        if self._event.wait(timeout_s):
            return self._result
        return None


def _new_request_id() -> str:
    return uuid.uuid4().hex


def _event_to_dict(event: AgentEvent) -> Dict[str, Any]:
    """Serialize an AgentEvent to a JSON-safe dict for the extension."""
    try:
        return event.to_dict()
    except Exception:
        return {"type": str(getattr(event, "type", "unknown")), "data": {}}


def _safe_args(args: Any) -> Any:
    """Best-effort conversion of tool args to a JSON-serializable shape."""
    if args is None:
        return {}
    if isinstance(args, dict):
        return args
    try:
        # Pydantic models / dataclasses
        if hasattr(args, "model_dump"):
            return args.model_dump()
        if hasattr(args, "__dict__"):
            return {k: v for k, v in vars(args).items() if not k.startswith("_")}
    except Exception:
        pass
    return {"value": str(args)}


__all__ = ["AgentaoChromeTransport"]
