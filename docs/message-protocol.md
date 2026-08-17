# Message Protocol Index

This document indexes every message that crosses a boundary in the
project. The canonical source for constants is
[`agentao-contract.js`](../extension/agentao-contract.js) (extension) and
[`native-host/host_protocol.py`](../native-host/host_protocol.py) (host).

## Boundaries

1. **sidepanel ↔ service worker** — `chrome.runtime.sendMessage` /
   `chrome.runtime.onMessage`. Message types in
   `contract.messages.*`.
2. **service worker ↔ native host** — Chrome Native Messaging
   (stdin/stdout, 4-byte LE length-prefixed JSON). Message types in
   `contract.host.*`.
3. **native host ↔ agentao runtime** — `Transport` protocol method
   calls and `AgentEvent` emissions. Event types in
   `contract.agentEvents.*`.

---

## 1. sidepanel ↔ service worker (`contract.messages.*`)

### Panel lifecycle

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `PANEL_OPENED` | panel → SW | `{ tabId? }` | SW ensures host connected, pushes config |
| `PANEL_CLOSED` | panel → SW | `{}` | Best-effort; not guaranteed (page may unload) |
| `PING_SIDEPANEL` | SW → panel | — | SW probes if panel is alive |
| `OPEN_SIDE_PANEL` | SW → panel | `{ tabId }` | Request panel open for a tab |
| `POPULATE_INPUT_TEXT` | SW → panel | `{ text }` | Draft injection |

### Chat

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `CHAT_SEND` | panel → SW | `{ sessionId, prompt, images? }` | Start a turn |
| `CHAT_CANCEL` | panel → SW | `{ sessionId }` | Cancel the active turn |
| `CHAT_EVENT` | SW → panel | `{ event, sessionId }` | Forwarded agentao `AgentEvent` |
| `CHAT_TURN_END` | SW → panel | `{ sessionId, finalText, status, toolCount, incompleteReason, error }` | Turn finished |
| `CHAT_ERROR` | SW → panel | `{ message, detail?, sessionId? }` | Error from host |
| `STOP_AGENT` | panel → SW | `{ sessionId }` | Alias for `CHAT_CANCEL` |

### Host status

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `HOST_STATUS_CHANGED` | SW → panel | `{ status, detail? }` | `connecting` / `connected` / `disconnected` |
| `HOST_CONNECTING` | SW → panel | — | Convenience subtype |
| `HOST_CONNECTED` | SW → panel | — | Convenience subtype |
| `HOST_DISCONNECTED` | SW → panel | `{ detail? }` | Convenience subtype |
| `HOST_ERROR` | SW → panel | `{ message }` | Host-side error |

### Permission / ask_user round-trip

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `PERMISSION_REQUEST` | SW → panel | `{ requestId, toolName, description, args }` | Show permission prompt |
| `PERMISSION_RESPONSE` | panel → SW | `{ requestId, allowed }` | User's decision |
| `ASK_USER_REQUEST` | SW → panel | `{ requestId, question, header?, options?, multiple?, allowCustom? }` | Show ask_user prompt |
| `ASK_USER_RESPONSE` | panel → SW | `{ requestId, answer }` | User's answer |

### Config

| Type | Direction | Payload | Notes |
|------|-----------|---------|-------|
| `CONFIG_UPDATED` | panel → SW | `{}` | Notify SW that storage changed; SW re-pushes config to host |

---

## 2. service worker ↔ native host (`contract.host.*`)

All messages are JSON objects with a `type` field. Transport: Chrome
Native Messaging (stdin/stdout, 4-byte little-endian length prefix).

### Extension → host

| `type` | Payload | Notes |
|--------|---------|-------|
| `binding_hello` | `{ protocolVersion, browser, extensionId, extensionVersion, hostName, instanceId }` | Sent automatically on `connectNative` by `native-host-binding.js` |
| `config` | `{ provider, permissionMode, workingDirectory }` | Rebuilds the agent |
| `chat` | `{ sessionId, prompt, images? }` | Starts a turn on a worker thread |
| `chat_cancel` | `{ sessionId }` | Trips the `CancellationToken` |
| `permission_response` | `{ requestId, allowed }` | Resolves a pending `confirm_tool` |
| `ask_user_response` | `{ requestId, answer }` | Resolves a pending `ask_user` |
| `shutdown` | `{}` | Clean exit |

### Host → extension

| `type` | Payload | Notes |
|--------|---------|-------|
| `ready` | `{}` | Host startup complete |
| `chat_event` | `{ event }` | Forwarded `AgentEvent` (see §3) |
| `turn_end` | `{ sessionId, finalText, status, toolCount, incompleteReason, error }` | Turn finished |
| `error` | `{ message, detail?, sessionId? }` | Error |
| `permission_request` | `{ requestId, toolName, description, args }` | Needs user confirmation |
| `ask_user_request` | `{ requestId, question, header?, options?, multiple?, allowCustom? }` | Needs user input |
| `log` | `{ level, message }` | Host-side log (for debugging) |

---

## 3. native host ↔ agentao runtime (`contract.agentEvents.*`)

These are the `AgentEvent.type` values that agentao emits (see
`agentao/transport/events.py`). The host forwards them verbatim inside
`chat_event` messages; the sidepanel renders them.

| Event | `data` fields | Rendered as |
|-------|---------------|-------------|
| `turn_start` | `{}` | Begin turn (show Stop button) |
| `turn_begin` | `{ user_message }` | Begin turn (replay semantics) |
| `turn_end` | `{ final_text, status, error, tool_count, incomplete_reason }` | Finalize turn |
| `thinking` | `{ text }` | Italic "thinking" block |
| `llm_text` | `{ chunk }` | Append to assistant message (streaming) |
| `tool_start` | `{ tool, args, call_id }` | New tool block |
| `tool_output` | `{ tool, chunk, call_id }` | Append to tool block output |
| `tool_complete` | `{ tool, call_id, status, duration_ms, error }` | Tool status badge |
| `tool_result` | `{ tool, call_id, content, status, duration_ms }` | Replace tool output with full result |
| `agent_start` | `{ agent, task, max_turns }` | "→ sub-agent" line |
| `agent_end` | `{ agent, state, turns, tool_calls, duration_ms }` | "← sub-agent done" line |
| `error` | `{ message, detail }` | Error block |
| `tool_confirmation` | `{ tool, args }` | (Handled via `confirm_tool`, not rendered directly) |
| `skill_activated` | `{ skill }` | (Ignored by sidepanel; logged) |
| `skill_deactivated` | `{ skill }` | (Ignored by sidepanel; logged) |
| `memory_write` | `{ ... }` | (Ignored by sidepanel; logged) |
| `model_changed` | `{ model }` | (Ignored by sidepanel; logged) |
| `permission_mode_changed` | `{ mode }` | (Ignored by sidepanel; logged) |

---

## Storage keys (`contract.*.STORAGE_KEY`)

| Key | Scope | Contents |
|-----|-------|----------|
| `agentaoProviderConfig` | provider | Active provider profile snapshot |
| `agentaoProviderProfiles` | provider | Array of all profiles |
| `agentaoProviderActiveProfileId` | provider | Active profile ID |
| `agentaoPermissionMode` | permission | `read-only` / `workspace-write` / `full-access` / `plan` |
| `agentaoAutoApproveTools` | permission | Boolean |
| `agentaoActiveSessionId` | session | Current session ID |
| `agentaoWorkingDirectory` | session | Host workspace path |
| `agentao.session.history.<sessionId>` | session | Per-session message history |
| `agentaoPreferredLocale` | ui | `en` / `zh-CN` |
| `agentaoTheme` | ui | `light` / `dark` / `auto` |
| `agentaoDebugMode` | ui | Boolean |
| `agentao.nativeHostBinding.instanceId.v1` | nativeMessaging | Stable browser instance ID |

---

## Pending-request accounting

Permission and `ask_user` requests use a `requestId` (UUID hex) for
matching. The accounting rules (mirroring `claw-in-chrome`'s MCP bridge
semantics):

- `requestId` is the **only** key for matching request ↔ response.
- `toolUseId` / `tabId` are context, not matching keys.
- Timeout (60s on the host, 60s on the SW) resolves to deny / `[timeout]`.
- Host disconnect resolves all pending requests to deny / `[timeout]`.
- Manual popup close does **not** immediately resolve; the SW timeout
  (60s) is the fallback.
