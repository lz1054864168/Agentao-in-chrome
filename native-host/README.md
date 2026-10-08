# Agentao Chrome Native Host

The Python process that the Chrome extension talks to via Native Messaging.
It embeds the [agentao](https://github.com/jin-bo/agentao) runtime and
bridges its events / interactions to the extension.

## Files

| File | Purpose |
|------|---------|
| `native_host.py` | Entry point — Native Messaging read/write loop, agent construction, chat dispatch |
| `agentao_transport.py` | `Transport` implementation that forwards agentao events to the extension and round-trips `confirm_tool` / `ask_user` |
| `host_protocol.py` | Message-type / field-name constants mirroring `agentao-contract.js` |
| `agentao_chrome_host.json.template` | Native Messaging manifest template (filled in by the install script) |
| `pyproject.toml` | Python project metadata (depends on `agentao>=0.4.18`) |

## How it works

```
Chrome extension
  │ chrome.runtime.connectNative("com.agentao.chrome_extension")
  │ stdin/stdout (4-byte length-prefixed JSON)
  ▼
native_host.py (main thread: read loop)
  │
  ├── config message → rebuild Agentao(working_directory, llm_client, transport)
  ├── chat message   → spawn worker thread → agent.arun(prompt)
  ├── permission_response → transport.resolve_permission(requestId)
  └── ask_user_response   → transport.resolve_ask_user(requestId)
        │
        ▼
  AgentaoChromeTransport.emit(event) → _send_message → stdout → extension
  AgentaoChromeTransport.confirm_tool() → post permission_request → block on Event
  AgentaoChromeTransport.ask_user()    → post ask_user_request   → block on Event
```

## Threading

- **Main thread**: stdin read loop. Must stay responsive (Chrome kills
  the host if it doesn't read within a few seconds).
- **Worker thread**: runs `agent.arun()`. One turn at a time
  (`_chat_lock` serializes).
- **stdout lock**: `_STDOUT_LOCK` serializes all stdout writes so event
  emissions from the worker thread don't interleave with read-loop
  acknowledgements.

## Cancellation

A `chat_cancel` message trips the active `CancellationToken`, which
agentao checks at every tool boundary and LLM chunk. The worker thread
winds down and posts a `turn_end` with `status="cancelled"`.

## Logs

Host logs go to `~/.agentao-chrome/logs/host.log` — never to stdout
(that's the Native Messaging channel). Check this file if the sidebar
shows "Disconnected" or errors.

## Standalone debugging

You can run the host without Chrome by piping JSON messages to stdin:

```bash
echo '{"type":"config","provider":{"apiKey":"sk-...","baseUrl":"https://api.openai.com/v1","model":"gpt-4o"},"permissionMode":"workspace-write","workingDirectory":"/tmp/agentao"}' | python native_host.py
```

Each message must be 4-byte little-endian length-prefixed. For quick
testing, use the `scripts/test_native_host.py` helper (coming soon).

## Dependencies

- Python ≥ 3.10
- `agentao >= 0.4.18` (install via `pip install agentao` or `uv sync`)
