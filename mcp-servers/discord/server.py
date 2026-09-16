"""Discord MCP server.

Exposes one tool, `send_message`, that posts a message to a Discord channel
via the bot REST API (no gateway connection - a bot only needs the gateway
to *receive* events in real time, not to send). Runs as a standalone
Streamable HTTP MCP server so any MCP client (OverFlowEngine's backend today,
an AI Agent block later) can call it over the network instead of spawning it
as a subprocess.
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
