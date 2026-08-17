# Architecture

## Overview

**Agentao in Chrome** puts the [Agentao](https://github.com/jin-bo/agentao)
governed agent runtime into the Chrome sidebar. It is a Chrome MV3
extension that talks to a local Python process via Native Messaging;
that Python process embeds Agentao in-process and bridges its events to
the extension.

The project references two upstreams:

- **`claw-in-chrome`** — the Chrome extension shell pattern (centralized
  frozen contract, service-worker loader, native-host binding, custom
  provider config). We reuse the *architecture*, not the obfuscated
  bundles.
- **`agentao`** — the agent runtime. We embed it via pure injection
  (`Agentao(working_directory=..., llm_client=..., transport=...)`),
  following the [embedding guide](https://github.com/jin-bo/agentao/blob/main/docs/guides/embed-for-agents.md).

## Component diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension (MV3)                                         │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────────────┐  │
│  │  Side Panel │    │   Options   │    │  Service Worker    │  │
│  │  (chat UI)  │    │  (settings) │    │  (background)      │  │
│  │             │    │             │    │                    │  │
│  │ sidepanel   │◄──►│ options.js  │    │ service-worker-    │  │
│  │ .html/.js   │    │             │    │ runtime.js         │  │
│  │ /.css       │    └─────────────┘    │                    │  │
│  └──────┬──────┘                       │ NativeHostConnection│  │
│         │ chrome.runtime               │ (connectNative)     │  │
│         │ .sendMessage                 │                    │  │
│         │                              │ pending permission  │  │
│         │                              │ / ask_user mgmt     │  │
│         └──────────────────────────────┤                    │  │
│                                        └─────────┬──────────┘  │
│                                                  │             │
└──────────────────────────────────────────────────┼─────────────┘
                                                   │
                                          connectNative
                                                   │ stdin/stdout
                                                   │ (4-byte LE
                                                   │  length-prefixed
                                                   │  JSON)
┌──────────────────────────────────────────────────┼─────────────┐
│  Python Native Host             ▼                │             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  native_host.py                                          │  │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │  │
│  │  │ read loop    │   │ chat worker  │   │ config /     │ │  │
│  │  │ (main thread)│   │ (per turn)   │   │ cancel       │ │  │
│  │  └──────┬───────┘   └──────┬───────┘   └──────────────┘ │  │
│  │         │                  │                             │  │
│  │         ▼                  ▼                             │  │
│  │  AgentaoChromeTransport (implements agentao.Transport)   │  │
│  │         │  emit(event) → _send_message → stdout          │  │
│  │         │  confirm_tool() → post + block on Event        │  │
│  │         │  ask_user()    → post + block on Event        │  │
│  │         ▼                                                │  │
│  │  Agentao(working_directory, llm_client, transport,       │  │
│  │          permission_engine)                              │  │
│  │         │  agent.arun(prompt, cancellation_token)        │  │
│  │         ▼                                                │  │
│  │  LLM + Tools + Skills + MCP + Memory + Sub-agents        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## Design principles

### 1. Centralized contract

All message types, storage keys, field names, and DOM IDs live in one
frozen object: `agentao-contract.js` (extension) and `host_protocol.py`
(host). The two mirror each other. Adding a new message type is a
two-file change; the contract freeze test (`tests/unit/contract.freeze.test.js`)
guards against accidental removal.

This pattern comes from `claw-in-chrome`'s `claw-contract.js`, which
proved its worth as the obfuscated bundles evolved — the contract stayed
stable even as the implementation churned.

### 2. Pure-injection embedding

The host constructs Agentao with explicit kwargs — no env / dotenv / cwd
side effects:

```python
agent = Agentao(
    working_directory=wd,
    llm_client=LLMClient(api_key=..., base_url=..., model=...),
    transport=AgentaoChromeTransport(post_message=_send_message),
    permission_engine=PermissionEngine(project_root=wd),
)
```

This follows agentao's embedding guide §1: "Construction uses
`build_from_environment` **or** pure `Agentao(...)`; no no-arg
`Agentao()`." We use pure construction because the host already has
explicit config from the extension.

### 3. Transport as the bridge

Agentao's `Transport` protocol (`agentao/transport/base.py`) is the
single interface between the runtime and any UI. We implement it with
`AgentaoChromeTransport`:

- `emit(event)` — serialize the `AgentEvent` to JSON and write to stdout.
- `confirm_tool(tool, desc, args)` — post a `permission_request` to the
  extension, block on a `threading.Event` until the extension replies
  (or timeout → deny).
- `ask_user(question, ...)` — same round-trip pattern.
- `on_max_iterations(count, messages)` — return `{"action": "stop"}`.

This keeps the agent runtime decoupled from Chrome specifics. The
transport could be swapped for a WebSocket transport, an ACP stdio
transport, or a test transport without touching the agent.

### 4. Fail-closed permissions

When a permission request times out (extension closed, user away), the
transport denies the tool. This matches agentao's security posture:
untrusted input → explicit denial, not silent approval.

### 5. Readable source throughout

Unlike `claw-in-chrome` (which ships obfuscated bundles with a
"maintainable layer" on top), this project is 100% readable source.
Every file is hand-written and commented. The trade-off: we don't get
the upstream's React/Vite build pipeline, but we get full auditability.

## Data flow: a single chat turn

1. **User types** in the sidepanel input and presses Enter.
2. `sidepanel.js` sends `CHAT_SEND` via `chrome.runtime.sendMessage`.
3. `service-worker-runtime.js` receives it, posts `{type: "chat",
   sessionId, prompt}` to the native host via the `connectNative` port.
4. `native_host.py` read loop receives the message, spawns a worker
   thread.
5. Worker thread calls `agent.arun(prompt)`.
6. Agentao runtime emits events (`TURN_START`, `THINKING`, `LLM_TEXT`,
   `TOOL_START`, ...). Each calls `transport.emit(event)`, which writes
   a `chat_event` message to stdout.
7. Service worker receives each `chat_event`, forwards it to the
   sidepanel as `CHAT_EVENT`.
8. `sidepanel.js` renders the event (streaming text, tool blocks, etc.).
9. If the agent calls a tool that requires confirmation,
   `transport.confirm_tool()` posts `permission_request` and blocks.
   The service worker forwards it to the sidepanel, which shows the
   permission prompt. The user clicks Allow/Deny; the response flows
   back: `PERMISSION_RESPONSE` → service worker → `permission_response`
   → host → `transport.resolve_permission()` → unblocks the worker.
10. When the turn ends, the host posts `turn_end`; the service worker
    forwards it as `CHAT_TURN_END`; the sidepanel finalizes the UI.

## Cancellation

- The sidepanel Stop button sends `CHAT_CANCEL`.
- The service worker forwards it as `chat_cancel` to the host.
- The host trips the active `CancellationToken`.
- Agentao checks the token at every tool boundary and LLM chunk, winds
  down, and the worker thread posts `turn_end` with
  `status="cancelled"`.

## What this project is NOT

- **Not a fork of claw-in-chrome.** We reuse the architectural pattern
  (contract + loader + native binding) but write every file from
  scratch. No obfuscated bundles, no deobfuscation layer.
- **Not a modification of agentao.** We depend on `agentao>=0.4.18` as
  a library. The host code only imports from the public embedding
  surface (`agentao`, `agentao.embedding`, `agentao.host`,
  `agentao.transport`).
- **Not a cloud service.** All LLM calls and tool execution happen in
  the local Python host. The extension is a UI shell; the host is the
  runtime.
