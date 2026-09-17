# Decisions

Architectural decisions that aren't obvious from reading the code, kept here so the reasoning survives past the PR that made them.

## Discord notifications via an MCP server (2026-09-07)

**Decision**: Add real Discord sending as a target app on the existing `appAction` block, backed by a small standalone Discord MCP server (`mcp-servers/discord/`) that the backend calls as an MCP client - not a direct API call embedded in the backend, and not a new node type.

### Context

OverFlowEngine's App Action block (`appAction` node type) already lets a user pick a "target app" (Teams, Slack, Email, Webhook) and compose a message, but every target is simulated - `executor.py` just logs what *would* be sent. The ask was: let a workflow's input actually reach Discord, and do it via MCP.

### Why MCP instead of a direct API call

A fixed, user-configured "send this message" action doesn't strictly need MCP - nothing is *deciding* whether to call the tool, so a direct `httpx.post` to Discord from the backend would work today with less code.

MCP earns its place because of where the project is already heading (see [PROJECT.md](PROJECT.md)'s "Tool-calling blocks" direction, and the existing `AiAgentNode`/`AiInputNode`/`AiOutputNode`). The moment an AI Agent block should be able to *decide* to notify Discord, or read recent messages as context, that's a genuine tool-calling use case - the agent picks the tool at runtime instead of a human wiring a fixed action block. Building the Discord integration as an MCP server now means:

- The same server can be called two ways: directly from `executor.py` today (fixed action), and later exposed to the AI Agent block as a callable tool (agent-decided action) - no rewrite, just a new caller.
- It runs as its own process reachable over HTTP, so it isn't coupled to the backend's process lifecycle or dependency set, and could be reused outside OverFlowEngine.

**Trade-off accepted**: this is one extra network hop and one extra process to run/deploy compared to a direct API call. Given the project's stated agentic direction, that cost is paid once and buys the tool-calling shape for free later.

### Why a bot token (REST-only) instead of a webhook

An incoming webhook (a per-channel URL, POST `{"content": ...}`) needs zero bot infrastructure and would satisfy "send a short message" on its own. A bot account was chosen instead because:

- It's barely more setup (create an application + bot in the Discord Developer Portal, no gateway connection required for send-only use).
- It's the same credential a future "incoming Discord message" trigger would need (symmetric with the existing `AppTriggerNode` concept for app-sourced triggers). A webhook can't receive anything; building on a bot identity now avoids throwing away the webhook later.

The server only calls Discord's REST API (`POST /channels/{id}/messages`) - it does **not** open a gateway (websocket) connection, since nothing yet needs to receive real-time events.

### Why extend `appAction` instead of adding a `discordAction` node type

`AppActionNode`/`appAction` already has the exact shape needed - target app picker, a "to" field, a message body with variable interpolation - and `targetApp` is already a plain string selected from a list (`APP_TRIGGER_SOURCES`). Adding "Discord" to that list and branching on it in `executor.py` reuses the existing UI, the existing `{variable}` interpolation (`_render_message`), and the existing grouping/subgraph handling in `Canvas.tsx` that already treats `appAction` as a first-class node type. A separate node type would have meant duplicating all of that for no behavioral gain - the block doesn't do anything structurally different for Discord than for any other target app; only what happens server-side when it fires differs.

### Transport: Streamable HTTP, not stdio

The Discord MCP server uses MCP's Streamable HTTP transport rather than stdio, because the backend is a long-running FastAPI service (not an editor/CLI that would spawn the server as a subprocess). Streamable HTTP lets the MCP server run as its own independently-started process that the backend (or, later, other callers) connects to over a URL (`DISCORD_MCP_URL`), the same way it already reaches Postgres/Redis over a URL rather than in-process.

### Known limitations of this first pass

- Only the `appAction` → Discord path is real; Teams/Slack/Email/Webhook targets on the same block remain simulated until each gets its own MCP server (or other integration) the same way.
- The executor is synchronous, so the MCP client call is wrapped in `asyncio.run()` per send rather than reusing a persistent MCP session - fine at current volume, worth revisiting if Discord sends become a hot path.
- No retry/backoff on a failed Discord send; a failure is surfaced as a normal failed-step message in the run log, same as any other node error.
