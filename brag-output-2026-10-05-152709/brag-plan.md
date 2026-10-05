# Brag Plan: OverFlowEngine Marketplace

**What:** OverFlowEngine's Marketplace lets you publish a saved flow and lets any other user copy it into their own account in one click.
**Angle:** Follow one flow ("Vacation Planner") from private, to published, to copied by another user. The payoff is the product's own rule: "AI Model blocks are never shared - copiers link their own API key."
**Tone:** default; clean product demo. 20s, 1920x1080, music: happy-beats vol-9 (trimmed so its beat grid starts at 0.5s).
**Source:** `frontend/src/Marketplace.tsx` (tabs "Browse" / "Publish a Flow", PublishModal copy, "Copy to My Flows" → "Copied to My Flows", "Published to the marketplace"), `templates.ts` descriptions.
**Illustrative content:** usernames (devon, maya, sam, lena), dates, the typed Vacation Planner description, and the Discord Auto-Reply / Weekly Calendar Digest listings.

## Storyboard
1. **Hook (0–3.1s):** "Built a flow? Share it." Publish a Flow tab, three private flows; cursor clicks Publish on Vacation Planner.
2. **Publish (3.1–7.8s):** "One click to publish." Modal; the description types in; "AI Model blocks are never shared…" gets a highlight; Publish to Marketplace; the row flips to "Published to the marketplace".
3. **Browse (7.8–12s):** "Now anyone can find it…" Browse tab; four listing cards land one by one; header switches to "signed in as devon".
4. **Copy (12–17.2s):** "…and copy it in one click." → "Your API keys never travel with it." Copy to My Flows → Copied; My Flows card shows the copied flow with the AI Model block Locked.
5. **Outro (17.2–20s):** OverFlowEngine: "Publish once. Anyone can copy it."
