# Brag Plan: OverFlowEngine — the full tour

**What:** OverFlowEngine is a drag-and-drop workflow builder: wire blocks on a canvas, hit Run, and the server executes the flow. AI agents run on your own models, flows talk to real apps, and you can share flows on the Marketplace.
**Angle:** One continuous tour from the dashboard to a finished, shared flow. Each scene shows one capability in use, with the app's own copy.
**Tone:** default; clean product tour. **Length:** 46s (longer than the usual 15–25s brag at the user's request). 1920x1080.
**Music:** happy-beats vol-11, trimmed from 1.10s so its 114.8 BPM grid lands on 0.5 + k·0.5225s; most reveals snap to that grid.

**Source:** `Dashboard.tsx` ("Welcome to OverFlowEngine", "Start a new workflow", "Open a blank canvas and drag blocks onto it", the Tasks copy), `Palette.tsx`, `templates.ts` (Email Auto-Reply, Vacation Planner), `AiModelNode.tsx` / `AiAgentNode.tsx` / `providers.py` (key detection for OpenAI / Anthropic / Google, the model list), `types.ts` (Trip Cost web search, Task block), `AppActionNode.tsx` + `ConnectedAppsPage.tsx` (Discord, Google/Microsoft Calendar actions), `Marketplace.tsx`.
**Illustrative content:** key labels, usernames, chat messages, search queries, euro amounts and task names. No real credentials, bot or channel are shown.

## Storyboard
| # | Time | Scene | On screen |
|---|---|---|---|
| 1 | 0–4.2 | Hook / Dashboard | "Automation, but you draw it." Welcome card, the template pills, click Start a new workflow |
| 2 | 4.2–10.3 | Build | "Drag. Snap. Wire." Palette, four Email Auto-Reply blocks drop on the beat, wires, alignment guide |
| 3 | 10.3–15.5 | Run | "Run it. Server-side." Run click, the green pulse node to node, Console lines |
| 4 | 15.5–22 | Your own model | "Bring your own model." Unlock the AI Model block with a key, pick claude-sonnet-5, wire it to the agent; "Paste an OpenAI, Anthropic or Google key: it recognizes which one." |
| 5 | 22–29 | Vacation Planner | "One form in. A whole trip out." → "It even searches the web for prices." Form → Florence, Italy → Trip Cost searches + total → Trip PDF |
| 6 | 29–35 | Apps | "Talks to your apps." Discord App Action via MCP; the bot posts, alex replies, the bot answers; Google / Microsoft Calendar chips |
| 7 | 35–40 | Marketplace | "Share flows. Copy anyone's." Copy to My Flows → Copied; "AI Model blocks are never shared" |
| 8 | 40–43 | Tasks | "Runs can fill your task list too." Tasks panel, rows added by Task blocks |
| 9 | 43.2–46 | Outro | OverFlowEngine: "Draw the workflow. Run the workflow." Feature chips |

**Sound:** a warm bed at 0.38 with soft motion-matched SFX (drops for blocks landing, ticks for pulses, clicks for the cursor, a bell on the logo), all kept under the music.
