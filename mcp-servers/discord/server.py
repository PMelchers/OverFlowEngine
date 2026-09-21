"""Discord MCP server.

Exposes `send_message` and `read_messages`, both plain REST calls (no gateway
connection - a bot only needs the gateway to *receive* events in real time;
`read_messages` is a point-in-time fetch, called by polling rather than by
holding a connection open). Runs as a standalone Streamable HTTP MCP server
so any MCP client (OverFlowEngine's backend today, an AI Agent block later)
can call it over the network instead of spawning it as a subprocess.
"""

import os

import httpx
from dotenv import load_dotenv
from mcp.server.mcpserver import MCPServer

load_dotenv()

DEFAULT_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
DISCORD_API_BASE = "https://discord.com/api/v10"
_TIMEOUT = 10.0

MCP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.getenv("MCP_PORT", "8765"))

mcp = MCPServer("discord-mcp")


@mcp.tool()
def send_message(channel_id: str, content: str, bot_token: str = "") -> dict:
    """Send a message to a Discord text channel using a bot account.

    Args:
        channel_id: The numeric Discord channel ID to post into.
        content: The message text to send (up to Discord's 2000 char limit).
        bot_token: Bot token to send as (e.g. a per-user token from OverFlowEngine's
            credential store). Falls back to this server's own DISCORD_BOT_TOKEN env
            var when omitted, for local/single-tenant use.
    """
    token = bot_token.strip() or DEFAULT_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "no bot token given and DISCORD_BOT_TOKEN is not set on the MCP server"}
    channel_id = str(channel_id).strip()
    if not channel_id:
        return {"ok": False, "error": "channel_id is required"}
    if not content.strip():
        return {"ok": False, "error": "content is required"}

    try:
        resp = httpx.post(
            f"{DISCORD_API_BASE}/channels/{channel_id}/messages",
            headers={
                "Authorization": f"Bot {token}",
                "Content-Type": "application/json",
            },
            json={"content": content[:2000]},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"request to Discord failed: {exc}"}

    if resp.status_code in (200, 201):
        body = resp.json()
        return {"ok": True, "message_id": body.get("id")}

    return {"ok": False, "error": f"Discord API returned {resp.status_code}: {resp.text[:300]}"}


@mcp.tool()
def read_messages(channel_id: str, after_message_id: str = "", limit: int = 10, bot_token: str = "") -> dict:
    """Read recent messages from a Discord text channel (one-off fetch, not a live listener).

    Requires the bot to have the "Read Message History" permission in that channel,
    in addition to the "Send Messages"/"View Channel" permissions send_message needs.

    Args:
        channel_id: The numeric Discord channel ID to read from.
        after_message_id: Only return messages posted after this message id (Discord's
            own pagination cursor) - pass the id send_message returned to fetch only
            what arrived since then. Empty fetches the most recent messages instead.
        limit: Max messages to return, 1-100.
        bot_token: Bot token to read as. Falls back to this server's own
            DISCORD_BOT_TOKEN env var when omitted.
    """
    token = bot_token.strip() or DEFAULT_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "no bot token given and DISCORD_BOT_TOKEN is not set on the MCP server"}
    channel_id = str(channel_id).strip()
    if not channel_id:
        return {"ok": False, "error": "channel_id is required"}

    params: dict = {"limit": max(1, min(int(limit), 100))}
    if after_message_id.strip():
        params["after"] = after_message_id.strip()

    try:
        resp = httpx.get(
            f"{DISCORD_API_BASE}/channels/{channel_id}/messages",
            headers={"Authorization": f"Bot {token}"},
            params=params,
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"request to Discord failed: {exc}"}

    if resp.status_code != 200:
        return {"ok": False, "error": f"Discord API returned {resp.status_code}: {resp.text[:300]}"}

    # Discord returns newest-first; flip to chronological order so "the first reply"
    # is simply the first item a caller sees.
    raw_messages = list(reversed(resp.json()))
    return {
        "ok": True,
        "messages": [
            {
                "id": m["id"],
                "author_id": m["author"]["id"],
                "author_name": m["author"].get("username", "unknown"),
                "is_bot": bool(m["author"].get("bot", False)),
                "content": m.get("content", ""),
            }
            for m in raw_messages
        ],
    }


@mcp.tool()
def verify_bot_token(bot_token: str) -> dict:
    """Check that a bot token is valid by asking Discord who it belongs to.

    Args:
        bot_token: The bot token to check.
    """
    token = bot_token.strip()
    if not token:
        return {"ok": False, "error": "bot_token is required"}

    try:
        resp = httpx.get(
            f"{DISCORD_API_BASE}/users/@me",
            headers={"Authorization": f"Bot {token}"},
            timeout=_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        return {"ok": False, "error": f"request to Discord failed: {exc}"}

    if resp.status_code == 200:
        body = resp.json()
        username = body.get("username", "unknown")
        return {"ok": True, "username": username}
    if resp.status_code == 401:
        return {"ok": False, "error": "Discord rejected this token"}
    return {"ok": False, "error": f"Discord API returned {resp.status_code}: {resp.text[:300]}"}


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host=MCP_HOST, port=MCP_PORT)
