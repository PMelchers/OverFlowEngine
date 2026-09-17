"""Thin MCP client for the Discord MCP server (see mcp-servers/discord/).

The executor is synchronous (plain `def`, run in FastAPI's threadpool - see
main.py), so this wraps the async MCP client in `asyncio.run` rather than
making the whole execution path async.
"""

import asyncio
import json
import os

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

DISCORD_MCP_URL = os.getenv("DISCORD_MCP_URL", "http://127.0.0.1:8765/mcp")


async def _call_tool(name: str, arguments: dict) -> dict:
    async with streamable_http_client(DISCORD_MCP_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
            if result.is_error:
                return {"ok": False, "error": str(result.content)}
            # The tool returns a dict, which the SDK ships back as a JSON text block
            # rather than structured content in this version - parse it ourselves.
            text = result.content[0].text if result.content else "{}"
            return json.loads(text)


def send_discord_message(channel_id: str, content: str, bot_token: str | None = None) -> tuple[bool, str]:
    """Sends a message via the Discord MCP server.

    bot_token, when given, is the token to send as (e.g. a user's own saved
    Discord credential); omitted, the MCP server falls back to its own
    DISCORD_BOT_TOKEN env var.

    Returns (ok, detail) - detail is the Discord message id on success, or an
    error string on failure (including the MCP server being unreachable).
    """
    try:
        result = asyncio.run(
            _call_tool(
                "send_message",
                {"channel_id": channel_id, "content": content, "bot_token": bot_token or ""},
            )
        )
    except Exception as exc:  # MCP server unreachable, connection refused, etc.
        return False, f"could not reach Discord MCP server at {DISCORD_MCP_URL}: {exc}"

    if result.get("ok"):
        return True, str(result.get("message_id", "sent"))
    return False, str(result.get("error", "unknown error"))


def verify_discord_bot_token(bot_token: str) -> tuple[bool | None, str]:
    """Checks a bot token against Discord via the MCP server.

    Returns (ok, detail): ok is True if Discord confirmed the token, False if
    Discord explicitly rejected it, None if it couldn't be checked at all
    (MCP server unreachable). detail is the bot's username on success, or an
    error string otherwise.
    """
    try:
        result = asyncio.run(_call_tool("verify_bot_token", {"bot_token": bot_token}))
    except Exception as exc:
        return None, f"could not reach Discord MCP server at {DISCORD_MCP_URL}: {exc}"

    if result.get("ok"):
        return True, str(result.get("username", "unknown"))
    return False, str(result.get("error", "unknown error"))
