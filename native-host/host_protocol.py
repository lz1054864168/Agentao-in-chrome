"""Mirror of agentao-contract.js on the host side.



Every message type, field name, and storage key that crosses the

Native Messaging boundary is defined here and in ``agentao-contract.js``.

The two must stay in sync — when you change one, change the other.



The extension sends and receives JSON messages over Chrome Native

Messaging (stdin/stdout, 4-byte little-endian length prefix). Each

message is an object with a ``type`` field drawn from ``HOST_MESSAGES``.

"""



from __future__ import annotations



# ── Native Messaging host name ────────────────────────────────────────

# Must match contract.nativeMessaging.HOST_NAME in agentao-contract.js

# and the "name" field in agentao_chrome_host.json.

HOST_NAME = "com.agentao.chrome_extension"



# ── Message types: extension -> host ──────────────────────────────────
EXT_TO_HOST = {
    "binding_hello": "binding_hello",
    "chat": "chat",
    "chat_cancel": "chat_cancel",
    "config": "config",
    "permission_response": "permission_response",
    "ask_user_response": "ask_user_response",
    "browser_response": "browser_response",
    "shutdown": "shutdown",
}

# ── Message types: host -> extension ──────────────────────────────────
HOST_TO_EXT = {
    "ready": "ready",
    "chat_event": "chat_event",
    "turn_end": "turn_end",
    "error": "error",
    "permission_request": "permission_request",
    "ask_user_request": "ask_user_request",
    "browser_request": "browser_request",
    "log": "log",
    "llm_status": "llm_status",
}



# ── Provider config field names (mirror contract.provider.FIELDS) ─────

PROVIDER_FIELDS = {

    "ID": "id",

    "NAME": "name",

    "FORMAT": "format",

    "BASE_URL": "baseUrl",

    "API_KEY": "apiKey",

    "MODEL": "model",

    "TEMPERATURE": "temperature",

    "MAX_TOKENS": "maxTokens",

    # Whether the model supports vision (multimodal image input).
    # When False the host omits screenshot/recording tools.
    "VISION": "vision",

}



# ── Permission modes (mirror contract.permission.MODES) ───────────────

PERMISSION_MODES = {

    "READ_ONLY": "read-only",

    "WORKSPACE_WRITE": "workspace-write",

    "FULL_ACCESS": "full-access",

    "PLAN": "plan",

}



# ── Log levels ────────────────────────────────────────────────────────

LOG_LEVELS = ("debug", "info", "warn", "error")





__all__ = [

    "HOST_NAME",

    "EXT_TO_HOST",

    "HOST_TO_EXT",

    "PROVIDER_FIELDS",

    "PERMISSION_MODES",

    "LOG_LEVELS",

]

