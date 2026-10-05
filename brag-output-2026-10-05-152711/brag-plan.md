# Brag Plan: OverFlowEngine × Discord

**What:** An App Action block can post to a real Discord channel through your own bot (via the Discord MCP server), wait for the first reply, and answer it with one short AI-generated message.
**Angle:** Link a bot once, wire it into a flow, hit Run, and watch the conversation happen in the channel.
**Tone:** default; clean product demo. 20s, 1920x1080, music: happy-beats vol-10.
**Source:** `ConnectedAppsPage.tsx` ("Discord bots", its description, "No Discord bots linked yet…", "Label, e.g. Team server bot", "Bot token", "Add Discord bot" → "Verifying with Discord..."), `AppActionNode.tsx` (Action "Send, then auto-reply to one response", "Discord bot", "Channel ID" placeholder, "{agentReply}", reply-instructions placeholder "its actually amazing weather!"), `discord_mcp_client.py`.
**Privacy:** the real connected bot, its token and the channel are NOT shown. The bot name, masked token, channel, usernames and messages are stand-ins.

## Storyboard
1. **Hook (0–2.8s):** "Your flow can talk in Discord." An App Action block set to Discord, plus an empty #general channel.
2. **Link (2.8–6.8s):** "Link your bot once." Discord bots settings; type the label and token; Add Discord bot → Verifying → "Team server bot ✓".
3. **Wire (6.8–11.3s):** "Pick the bot, the channel, the message." Weather Agent → App Action fields fill one by one; reply model claude-sonnet-5 underneath; "via Discord MCP".
4. **Run (11.3–17.2s):** "It posts for real…" → "…and answers the first reply." The bot posts, alex replies, the bot answers once.
5. **Outro (17.2–20s):** OverFlowEngine: "Wire it to Discord. Run it."
