# Brag Plan: OverFlowEngine — Bring Your Own Model

**What:** Every AI block in OverFlowEngine runs on a model you choose. You paste your own API key, unlock an AI Model block with it, and wire that block into any AI step. The Trip Cost block then uses it to search the web for real prices.
**Angle:** Bring your own model, bind it anywhere: key → unlock → pick model → wire to two blocks at once → watch it search.
**Tone:** default; clean product demo. 20s, 1920x1080, music: happy-beats vol-12.
**Source:** `providers.py` (provider detected from the key's format; `PROVIDER_MODELS` list incl. claude-sonnet-5 / claude-opus-5 / claude-haiku-4-5; `web_search=True` for Trip Cost), `AiModelNode.tsx` ("Locked", "Pick a verified API key", "Lock / change key"), `AiAgentNode.tsx` ("Connect an AI Model block below ↓"), `types.ts` Trip Cost description, `templates.ts` (one model block feeding several blocks).
**Illustrative content:** key labels, the masked key, search queries, and the euro amounts.

## Storyboard
1. **Hook (0–2.7s):** "Bring your own model." AI Agent + Trip Cost blocks with empty Model fields; a locked AI Model block.
2. **Key (2.7–5.6s):** "Paste a key. It spots the provider." Key typed → "Detected: anthropic" → "✓ Verified".
3. **Unlock (5.6–8.6s):** "Unlock it. Pick the model." Pick a verified API key → pick claude-sonnet-5.
4. **Bind (8.6–11.9s):** "Bind it to any block." Wires draw to both blocks; their Model fields fill; "One connected key can feed several blocks."
5. **Search (11.9–17.2s):** "Then it searches the web for real prices." Trip Cost runs three web searches, fills Accommodation / At the destination / Transport, total within budget.
6. **Outro (17.2–20s):** OverFlowEngine: "Your key. Your model. Any block."
