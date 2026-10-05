import base64
import json
import logging
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from . import models, providers, calendar_providers, tripsummary
from .accommodation_prices import AccommodationPriceError, fetch_accommodation_price
from .fuel_prices import FuelPriceError, estimate_fuel_cost, is_own_car
from .conditions import evaluate_conditions
from .discord_mcp_client import read_discord_messages, send_discord_message
from .maps import build_maps_url

logger = logging.getLogger("overflowengine.workflow")

_VAR_PATTERN = re.compile(r"\{(\w+)\}")

# App Action's targetApp values that are real calendar accounts (as opposed to a
# plain "send a message" app like Email/Slack/Teams) - maps the human-readable app
# name shown in the block to the provider key calendar_providers.py expects.
CALENDAR_APP_PROVIDERS = {"Google Calendar": "google", "Microsoft Calendar": "microsoft"}

# Discord "await a reply" action - hard ceilings so usage stays small and bounded no
# matter what a workflow asks for: a short poll loop, and a short capped AI reply
# (as opposed to the 1024-token default used elsewhere) rather than a full response.
DISCORD_AWAIT_REPLY_MAX_SECONDS = 120
DISCORD_AWAIT_REPLY_POLL_INTERVAL = 4
DISCORD_AWAIT_REPLY_MAX_TOKENS = 150

# Runs paused on a Choice block, keyed by run_id. Holds only plain data (no
# SQLAlchemy objects) so it survives across the separate HTTP requests /
# DB sessions of the run -> continue -> continue ... sequence.
PENDING_RUNS: dict[str, dict] = {}


def _render_message(template: str, variables: dict) -> str:
    def replace(match: re.Match) -> str:
        name = match.group(1)
        return str(variables[name]) if name in variables else match.group(0)

    return _VAR_PATTERN.sub(replace, template or "")


def _parse_route_destination(reply: str) -> tuple[list[str], list[str]]:
    """Parses a Suggest Activities reply expected to contain a "ROUTE: a|b|c" line and a
    "DESTINATION: x|y|z" line. If the model ignored that format entirely, treats the whole
    reply as route stops (the old single-list behavior) rather than losing everything."""

    def _split_line(match: re.Match | None) -> list[str]:
        if not match:
            return []
        line = match.group(1).split("\n", 1)[0]
        return [s.strip(" .\t-") for s in line.split("|") if s.strip(" .\t-")]

    route = _split_line(re.search(r"ROUTE:\s*(.+)", reply, re.IGNORECASE))
    destination = _split_line(re.search(r"DESTINATION:\s*(.+)", reply, re.IGNORECASE))
    if not route and not destination:
        route = [s.strip(" .\t-") for s in reply.split("|") if s.strip(" .\t-")]
    return route, destination


_COST_CATEGORIES = ("route_activity", "destination_activity", "accommodation", "transport")


def _classify_json_failure(text: str) -> str:
    """Best-effort human-readable reason a Cost Estimate reply didn't parse - shown in the
    step message so a repeat failure gives an actual clue instead of a generic shrug."""
    stripped = text.strip()
    if "[" not in stripped:
        return "the model replied with prose instead of JSON"
    opens, closes = stripped.count("["), stripped.count("]")
    if opens > closes:
        return "the reply looks cut off mid-array (likely ran out of response length)"
    if stripped.count("{") > stripped.count("}"):
        return "the reply looks cut off mid-object (likely ran out of response length)"
    return "the JSON was malformed (e.g. an unescaped quote or stray comma)"


def _try_parse_cost_json(reply: str, target_currency: str) -> list[dict] | None:
    """Attempts to parse a Cost Estimate model reply as a JSON array of {name, category,
    estimated_cost, currency, note}. Returns None (never raises) if nothing usable was found,
    so the caller can decide whether to retry before giving up."""
    text = reply.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if "\n" in text:
            first_line, rest = text.split("\n", 1)
            text = rest if first_line.strip().lower() in ("json", "") else text

    # Web-search-enabled replies often narrate ("Let me look that up... Based on my
    # search: [...]") despite the "ONLY JSON" instruction - parsing the raw text fails
    # on that surrounding prose, so fall back to the substring between the first "["
    # and the last "]" before giving up entirely.
    candidates = [text]
    start, end = text.find("["), text.rfind("]")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])

    parsed = None
    for candidate in candidates:
        try:
            candidate_parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(candidate_parsed, list) and candidate_parsed:
            parsed = candidate_parsed
            break
    if parsed is None:
        return None

    items = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        try:
            cost = float(entry.get("estimated_cost", 0) or 0)
        except (TypeError, ValueError):
            cost = 0.0
        category = str(entry.get("category") or "route_activity").strip().lower()
        item_currency = str(entry.get("currency") or target_currency).strip().upper() or target_currency
        note = str(entry.get("note") or "").strip()
        if item_currency != target_currency:
            # The prompt asks the model to convert everything itself - if it still echoes
            # back a different currency, don't silently trust the raw number as if it were
            # already in target_currency (that's how a 170 SEK price ends up displayed as
            # "170 EUR", ~11x too high). Flag it instead.
            note = (note + " " if note else "") + (
                f"[currency mismatch: reported in {item_currency}, not converted to "
                f"{target_currency} - verify manually]"
            )
        items.append(
            {
                "name": str(entry.get("name") or "Unnamed item").strip(),
                "category": category if category in _COST_CATEGORIES else "route_activity",
                "estimated_cost": cost,
                "currency": item_currency,
                "note": note,
            }
        )
    return items or None


def _cost_fallback_items(
    route_stops: list[str],
    destination_stops: list[str],
    has_accommodation: bool,
    has_transport: bool,
    target_currency: str,
    reason: str,
) -> list[dict]:
    """One zeroed-out entry per requested line (never silently drops one), each carrying
    `reason` so the UI shows why - used only once both the first attempt and the repair
    attempt have failed to produce usable JSON."""
    note = f"could not parse the AI's price estimate - {reason}"
    fallback = [
        {"name": s, "category": "route_activity", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        for s in route_stops
    ] + [
        {
            "name": s,
            "category": "destination_activity",
            "estimated_cost": 0.0,
            "currency": target_currency,
            "note": note,
        }
        for s in destination_stops
    ]
    if has_accommodation:
        fallback.append(
            {"name": "Accommodation", "category": "accommodation", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        )
    if has_transport:
        fallback.append(
            {"name": "Transport", "category": "transport", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        )
    return fallback


def _reconcile_cost_items(
    items: list[dict],
    route_stops: list[str],
    destination_stops: list[str],
    has_accommodation: bool,
    has_transport: bool,
    target_currency: str,
) -> list[dict]:
    """The model sometimes returns syntactically valid JSON that just skips some of the
    requested lines (fewer searches to do) despite "never omit a requested line" - that
    produces a confidently-wrong total (e.g. 2 of 8 requested prices, shown as if complete).
    Appends one flagged, zeroed placeholder per missing line per category so a short total
    is visibly incomplete instead of silently passing as final."""
    note = "the AI didn't return a price for this - it likely skipped it despite instructions"
    counts = {"route_activity": 0, "destination_activity": 0, "accommodation": 0, "transport": 0}
    for item in items:
        counts[item["category"]] = counts.get(item["category"], 0) + 1

    result = list(items)
    missing_route = max(len(route_stops) - counts["route_activity"], 0)
    missing_dest = max(len(destination_stops) - counts["destination_activity"], 0)
    for _ in range(missing_route):
        result.append(
            {"name": "Unpriced route stop", "category": "route_activity", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        )
    for _ in range(missing_dest):
        result.append(
            {
                "name": "Unpriced destination activity",
                "category": "destination_activity",
                "estimated_cost": 0.0,
                "currency": target_currency,
                "note": note,
            }
        )
    if has_accommodation and counts["accommodation"] == 0:
        result.append(
            {"name": "Accommodation", "category": "accommodation", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        )
    if has_transport and counts["transport"] == 0:
        result.append(
            {"name": "Transport", "category": "transport", "estimated_cost": 0.0, "currency": target_currency, "note": note}
        )
    return result


def _parse_number(raw: str) -> float | None:
    match = re.search(r"\d[\d,]*(?:\.\d+)?", raw or "")
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _coerce(var_type: str, raw: str | None):
    if raw is None:
        return None
    if var_type == "int":
        try:
            return int(raw)
        except ValueError:
            return 0
    if var_type == "boolean":
        return str(raw).strip().lower() == "true"
    return raw


def _variables_snapshot(db: Session) -> dict:
    return {v.name: {"type": v.var_type, "value": v.value} for v in db.query(models.Variable).all()}


def _upsert_variable(db: Session, name: str, var_type: str, value: str):
    existing = db.query(models.Variable).filter_by(name=name).one_or_none()
    if existing:
        existing.var_type = var_type
        existing.value = value
    else:
        db.add(models.Variable(name=name, var_type=var_type, value=value))
    db.commit()


def _get_calendar_connection(db: Session, user_id: int | None, provider: str):
    """Returns (connection, error_message) - exactly one is non-None."""
    if user_id is None:
        return None, "you're not signed in, so there's no calendar to use"
    connection = (
        db.query(models.CalendarConnection)
        .filter(models.CalendarConnection.user_id == user_id, models.CalendarConnection.provider == provider)
        .first()
    )
    if connection is None or not connection.client_id:
        return None, f"no {provider} calendar app set up yet - add one in Settings"
    if not connection.access_token or not connection.refresh_token:
        return None, f"{provider} calendar app saved, but not connected yet - click Connect in Settings"
    return connection, None


def _discord_await_reply(
    db: Session,
    state: dict,
    eval_vars: dict,
    node_id: str,
    label: str,
    channel_id: str,
    outgoing_content: str,
    bot_token: str | None,
    incoming: dict,
    node_by_id: dict,
    data: dict,
) -> str:
    """Sends one message, waits (briefly, bounded) for the first human reply in that
    channel, then answers it with one short AI-generated reply and stops - a single
    question/answer exchange, not an ongoing conversation. Both the wait time and the
    reply length are hard-capped (DISCORD_AWAIT_REPLY_MAX_SECONDS/_MAX_TOKENS) so this
    can't turn into an open-ended, unbounded-cost listener no matter what's configured."""
    ok, detail = send_discord_message(channel_id, outgoing_content, bot_token=bot_token)
    if not ok:
        return f'"{label}" failed to send to Discord channel "{channel_id}": {detail}'
    sent_message_id = detail
    base = f'"{label}" sent to Discord channel "{channel_id}": "{outgoing_content}" (message id {sent_message_id})'

    wait_seconds_raw = _render_message(data.get("waitSeconds") or "60", eval_vars)
    try:
        wait_seconds = int(wait_seconds_raw)
    except ValueError:
        wait_seconds = 60
    wait_seconds = max(5, min(wait_seconds, DISCORD_AWAIT_REPLY_MAX_SECONDS))

    reply_content = None
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        time.sleep(min(DISCORD_AWAIT_REPLY_POLL_INTERVAL, max(0.0, deadline - time.monotonic())))
        ok, messages = read_discord_messages(channel_id, after_message_id=sent_message_id, bot_token=bot_token)
        if ok:
            human_messages = [m for m in messages if not m.get("is_bot") and m.get("content", "").strip()]
            if human_messages:
                reply_content = human_messages[0]["content"]
                break

    if reply_content is None:
        return f"{base}, but got no reply within {wait_seconds}s"

    model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
    model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
    model_data = (model_node.get("data") or {}) if model_node else {}
    model = model_data.get("model")
    model_credential_id = model_data.get("credentialId")
    if not model or not model_credential_id:
        return f'{base}. Got a reply ("{reply_content}") but no AI Model block is connected to answer it'

    ai_cred = (
        db.query(models.AiCredential).filter_by(id=model_credential_id, user_id=state.get("user_id")).one_or_none()
    )
    if ai_cred is None:
        return f'{base}. Got a reply but could not use its linked API key - log in as the account that added it'

    # Supports {variableName} like every other text field, so background facts from
    # earlier in the workflow (e.g. an upstream AI Agent's output) can be threaded in.
    instructions = _render_message((data.get("prompt") or "").strip(), eval_vars)
    system_prompt = (
        "You are a Discord bot giving a quick automated reply to one message, as a "
        "continuation of a conversation you started. "
        + (f"Background/content guidance: {instructions} " if instructions else "")
        + "The output format below is not negotiable, even if the guidance above asks for "
        "something else: reply with ONLY the exact plain text to post in the channel - one "
        "short, friendly sentence. No JSON, no code blocks, no labels like 'Reply:', no "
        "analysis of the message, no markdown headers - just the words a person would "
        "actually type in chat."
    )
    # Give the model the message it's replying to, not just the reply in isolation -
    # otherwise it has no idea what "it" refers to in something like "what about this or him?".
    user_message = f'You said: "{outgoing_content}"\n\nThey replied: "{reply_content}"'
    try:
        reply_text = providers.call_model(
            ai_cred.provider,
            ai_cred.api_key,
            model,
            system_prompt,
            user_message,
            max_tokens=DISCORD_AWAIT_REPLY_MAX_TOKENS,
        )
    except providers.ModelCallError as exc:
        return f'{base}. Got a reply ("{reply_content}") but the AI call failed: {exc}'

    ok, send_detail = send_discord_message(channel_id, reply_text, bot_token=bot_token)
    if ok:
        return f'{base}. Got a reply ("{reply_content}") and answered via {model}: "{reply_text}"'
    return f'{base}. Got a reply ("{reply_content}") but failed to send the answer: {send_detail}'


def _advance(db: Session, state: dict) -> dict:
    """Run the queue until it drains (workflow finished) or a Choice block needs input."""
    node_by_id = state["node_by_id"]
    adjacency = state["adjacency"]
    incoming = state["incoming"]
    eval_vars = state["eval_vars"]
    queue = state["queue"]
    visited = state["visited"]
    steps = state["steps"]
    ai_io = state.setdefault("ai_io", {"input": None})

    def flush_new_steps() -> list[dict]:
        sent = state.get("sent_count", 0)
        state["sent_count"] = len(steps)
        return steps[sent:]

    while queue:
        node_id = queue.pop(0)
        if node_id in visited:
            continue
        visited.add(node_id)

        node = node_by_id.get(node_id)
        if not node:
            continue

        ntype = node.get("type", "block")
        data = node.get("data", {}) or {}
        label = data.get("label", node_id)
        next_edges = adjacency.get(node_id, [])

        if ntype == "variable":
            var_type = data.get("varType", "string")
            value = data.get("value", "")
            _upsert_variable(db, label, var_type, value)
            eval_vars[label] = _coerce(var_type, value)
            steps.append(
                {"node_id": node_id, "type": ntype, "label": label, "message": f'"{label}" = {value} ({var_type})'}
            )

        elif ntype == "formTrigger":
            # One variable per field, same as a chain of Variable blocks - just filled in
            # via the submit-modal on the frontend instead of typed onto separate nodes.
            fields = data.get("fields") or []
            parts = []
            for field in fields:
                name = (field.get("name") or "").strip()
                if not name:
                    continue
                var_type = field.get("varType", "string")
                value = field.get("value", "")
                _upsert_variable(db, name, var_type, value)
                eval_vars[name] = _coerce(var_type, value)
                parts.append(f"{name}={value}")
            summary = ", ".join(parts) if parts else "no fields"
            steps.append(
                {"node_id": node_id, "type": ntype, "label": label, "message": f'"{label}" submitted: {summary}'}
            )

        elif ntype in ("if", "ifOne"):
            conditions = data.get("conditions") or []
            result, trace = evaluate_conditions(conditions, eval_vars)
            branch = "true" if result else "false"
            message = f'If [{trace}] => {"true" if result else "false"}'
            steps.append(
                {"node_id": node_id, "type": ntype, "label": label, "message": message, "branch": branch}
            )
            next_edges = [e for e in next_edges if (e.get("sourceHandle") or "true") == branch]

        elif ntype == "choice":
            options = [o for o in (data.get("options") or []) if str(o).strip()]
            if not options:
                steps.append(
                    {
                        "node_id": node_id,
                        "type": ntype,
                        "label": label,
                        "message": f'Choice "{label}" has no options configured, skipping',
                    }
                )
                next_edges = []
            else:
                steps.append(
                    {
                        "node_id": node_id,
                        "type": ntype,
                        "label": label,
                        "message": f'Waiting for a choice at "{label}"',
                        "options": options,
                    }
                )
                state["awaiting_node"] = node_id
                return {
                    "status": "awaiting_choice",
                    "node_id": node_id,
                    "label": label,
                    "options": options,
                    "steps": flush_new_steps(),
                    "variables": _variables_snapshot(db),
                }

        elif ntype == "log":
            rendered = _render_message(data.get("message", ""), eval_vars)
            logger.info(rendered)
            print(f"[OverFlowEngine] {rendered}")
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": f"[LOG] {rendered}"})

        elif ntype == "task":
            title = _render_message(data.get("title", ""), eval_vars).strip()
            user_id = state.get("user_id")
            if not title:
                message = f'"{label}" has no task title configured, skipping'
            elif user_id is None:
                message = (
                    f'"{label}" would add the task "{title}", but this run is anonymous - '
                    "sign in before running the workflow so it lands on your dashboard"
                )
            else:
                db.add(models.Task(user_id=user_id, title=title))
                db.commit()
                message = f'"{label}" added a task to your dashboard: "{title}"'
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "aiInput":
            rendered = _render_message(data.get("value", ""), eval_vars)
            ai_io["input"] = rendered
            steps.append(
                {"node_id": node_id, "type": ntype, "label": label, "message": f'AI Input "{label}" set: "{rendered}"'}
            )

        elif ntype == "aiAgent":
            # ai_io is one shared slot for the whole run (not scoped per agent instance) -
            # clear it before every attempt so a failed/skipped call never leaves a *different*
            # earlier agent's leftover reply for a downstream AI Output block to pick up.
            ai_io["output"] = None
            model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
            model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
            model_data = (model_node.get("data") or {}) if model_node else {}
            model = model_data.get("model")
            credential_id = model_data.get("credentialId")
            input_text = ai_io.get("input")
            instructions = (data.get("prompt") or "").strip()
            if input_text:
                # AI Input connected - Instructions becomes a real system prompt,
                # fully in the user's own control.
                system_prompt = instructions
                user_message = input_text
            else:
                # No AI Input connected - Instructions doubles as the message itself,
                # so a standalone AI Agent block works on its own. Without this, the
                # model has no system prompt at all and just replies conversationally
                # to the instruction (acknowledgments, "I'll remember that", "Done!")
                # - fine in a chat, but this output commonly flows straight into
                # another block (e.g. a Discord message) as-is, so constrain it to
                # just the requested content.
                system_prompt = (
                    "Follow the instructions below and output only the exact result they "
                    "ask for - no greetings, acknowledgments, meta-commentary about what "
                    "you're doing or remembering, asides, or closing confirmations like "
                    "'Done!'. Just the requested content itself, nothing surrounding it."
                )
                user_message = instructions

            if not user_message:
                message = f'AI Agent "{label}" has no input or instructions to send, skipping'
            elif not credential_id or not model:
                message = f'AI Agent "{label}" has no AI Model block connected/unlocked, skipping'
            else:
                cred = (
                    db.query(models.AiCredential)
                    .filter_by(id=credential_id, user_id=state.get("user_id"))
                    .one_or_none()
                )
                if cred is None:
                    message = f'AI Agent "{label}" could not use its linked API key - log in as the account that added it'
                else:
                    try:
                        reply = providers.call_model(cred.provider, cred.api_key, model, system_prompt, user_message)
                        ai_io["output"] = reply
                        message = f'AI Agent "{label}" replied via {model}: "{reply}"'
                    except providers.ModelCallError as exc:
                        message = f'AI Agent "{label}" call to {model} failed: {exc}'
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "aiOutput":
            output_text = ai_io.get("output")
            if output_text is None:
                steps.append(
                    {
                        "node_id": node_id,
                        "type": ntype,
                        "label": label,
                        "message": f'AI Output "{label}" found no agent reply yet, nothing saved',
                    }
                )
            else:
                _upsert_variable(db, label, "string", output_text)
                eval_vars[label] = output_text
                steps.append(
                    {
                        "node_id": node_id,
                        "type": ntype,
                        "label": label,
                        "message": f'AI Output saved to "{label}" = "{output_text}"',
                    }
                )

        elif ntype == "appTrigger":
            source_app = data.get("sourceApp", "an app")
            payload = data.get("value", "")
            from_address = (data.get("fromAddress") or "").strip()
            output_var = (data.get("outputVariable") or "").strip()
            if output_var:
                _upsert_variable(db, output_var, "string", payload)
                eval_vars[output_var] = payload
                message = (
                    f'"{label}" received a message from {source_app}, saved as "{output_var}" = "{payload}"'
                )
                if from_address:
                    from_var = f"{output_var}From"
                    _upsert_variable(db, from_var, "string", from_address)
                    eval_vars[from_var] = from_address
                    message += f', sender saved as "{from_var}" = "{from_address}"'
            else:
                message = f'"{label}" received a message from {source_app}: "{payload}"'
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "appAction":
            target_app = data.get("targetApp", "an app")
            calendar_provider = CALENDAR_APP_PROVIDERS.get(target_app)

            if target_app == "AI":
                # No external account - calls the model connected on this node's "model"
                # handle, same idea as an AI Agent block. Real model calls aren't wired
                # up anywhere yet, so this stays a simulated reply for consistency.
                model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
                model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
                model_data = (model_node.get("data") or {}) if model_node else {}
                model = model_data.get("model") or "no model connected"
                prompt = _render_message(data.get("prompt", ""), eval_vars)
                output_var = (data.get("outputVariable") or "").strip()
                if not prompt.strip():
                    message = f'"{label}" has no prompt configured for its AI call'
                else:
                    simulated_output = f'[preview reply from {model}] responding to: "{prompt}"'
                    if output_var:
                        _upsert_variable(db, output_var, "string", simulated_output)
                        eval_vars[output_var] = simulated_output
                        message = (
                            f'"{label}" ran an AI call with {model}, saved as "{output_var}" '
                            "(simulated - real model calls not wired up yet)"
                        )
                    else:
                        message = f'"{label}" ran an AI call with {model} (simulated - real model calls not wired up yet)'
            elif calendar_provider is None:
                # Plain "send a message" apps (Email/Slack/Teams/Webhook/Discord) - Discord is
                # wired up for real via the Discord MCP server; the rest stay simulated.
                to = _render_message(data.get("to", ""), eval_vars)
                subject = _render_message(data.get("subject", ""), eval_vars)
                body = _render_message(data.get("body", ""), eval_vars)
                subject_part = f' "{subject}"' if subject else ""

                if target_app == "Discord":
                    credential_id = data.get("credentialId")
                    bot_token = None
                    credential_error = None
                    if credential_id:
                        cred = (
                            db.query(models.AppCredential)
                            .filter(
                                models.AppCredential.id == credential_id,
                                models.AppCredential.user_id == state.get("user_id"),
                            )
                            .one_or_none()
                        )
                        if cred is None:
                            credential_error = "the selected Discord bot credential no longer exists"
                        else:
                            bot_token = cred.token

                    if credential_error:
                        message = f'"{label}" failed to send to Discord channel "{to}": {credential_error}'
                    elif (data.get("targetAction") or "sendMessage") == "awaitReply":
                        message = _discord_await_reply(
                            db, state, eval_vars, node_id, label, to, body, bot_token, incoming, node_by_id, data
                        )
                    else:
                        ok, detail = send_discord_message(to, body, bot_token=bot_token)
                        if ok:
                            message = f'"{label}" sent to Discord channel "{to}": "{body}" (message id {detail})'
                        else:
                            message = f'"{label}" failed to send to Discord channel "{to}": {detail}'
                else:
                    message = (
                        f'"{label}" would send{subject_part} to "{to}" via {target_app}: "{body}" '
                        "(simulated - real send not wired up yet)"
                    )
            else:
                # Real calendar accounts - which action runs depends on targetAction,
                # not on the node type, so adding a new app/action never needs a new
                # block type or a new executor branch, just a new case here.
                action = data.get("targetAction") or "fetchEvents"
                output_var = (data.get("outputVariable") or "").strip()
                connection, error = _get_calendar_connection(db, state.get("user_id"), calendar_provider)
                if error:
                    message = f'"{label}" - {error}'
                elif action == "fetchEvents":
                    try:
                        days_ahead_raw = _render_message(data.get("daysAhead") or "7", eval_vars)
                        days_ahead = int(days_ahead_raw) if days_ahead_raw.strip() else 7
                        now = datetime.now(timezone.utc)
                        access_token = calendar_providers.get_valid_access_token(db, connection)
                        events = calendar_providers.list_events(
                            calendar_provider,
                            access_token,
                            now.isoformat(),
                            (now + timedelta(days=days_ahead)).isoformat(),
                        )
                        summary = "; ".join(f'{e["title"]} ({e["start"]})' for e in events) or "No events found"
                        if output_var:
                            _upsert_variable(db, output_var, "string", summary)
                            eval_vars[output_var] = summary
                        message = f'"{label}" fetched {len(events)} event(s) from {target_app}'
                    except (httpx.HTTPError, ValueError, KeyError) as exc:
                        message = f'"{label}" could not reach {target_app}: {exc}'
                elif action == "createEvent":
                    title = _render_message(data.get("eventTitle", ""), eval_vars)
                    start = _render_message(data.get("startTime", ""), eval_vars)
                    end = _render_message(data.get("endTime", ""), eval_vars)
                    description = _render_message(data.get("eventDescription", ""), eval_vars)
                    if not title.strip() or not start.strip() or not end.strip():
                        message = f'"{label}" needs a title, start time, and end time to create an event'
                    else:
                        try:
                            access_token = calendar_providers.get_valid_access_token(db, connection)
                            event_id = calendar_providers.create_event(
                                calendar_provider, access_token, title, start, end, description
                            )
                            if output_var:
                                _upsert_variable(db, output_var, "string", event_id)
                                eval_vars[output_var] = event_id
                            message = f'"{label}" created "{title}" on {target_app} ({start} - {end})'
                        except httpx.HTTPError as exc:
                            message = f'"{label}" could not create the event on {target_app}: {exc}'
                elif action == "deleteEvent":
                    event_id = _render_message(data.get("eventId", ""), eval_vars).strip()
                    if not event_id:
                        message = (
                            f'"{label}" has no event ID to delete - connect it to an output from '
                            "a Create/Fetch block"
                        )
                    else:
                        try:
                            access_token = calendar_providers.get_valid_access_token(db, connection)
                            calendar_providers.delete_event(calendar_provider, access_token, event_id)
                            message = f'"{label}" deleted event "{event_id}" from {target_app}'
                        except httpx.HTTPError as exc:
                            message = f'"{label}" could not delete that event on {target_app}: {exc}'
                else:
                    message = f'"{label}" has an unrecognized action "{action}"'
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "activitySuggestion":
            origin = _render_message(data.get("origin", ""), eval_vars)
            context = _render_message(data.get("activityContext", ""), eval_vars)
            interests = _render_message(data.get("interests", ""), eval_vars)
            output_var = (data.get("outputVariable") or "").strip()
            destination_output_var = (data.get("destinationOutputVariable") or "").strip()

            # Same "model" handle/lookup pattern as the AI Agent block - connecting an AI
            # Model block below makes this a real, live suggestion instead of a simulated one.
            model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
            model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
            model_data = (model_node.get("data") or {}) if model_node else {}
            model = model_data.get("model")
            credential_id = model_data.get("credentialId")

            route_stops: list[str] = []
            destination_stops: list[str] = []
            ai_backed = False
            call_error: str | None = None

            if credential_id and model:
                cred = (
                    db.query(models.AiCredential)
                    .filter_by(id=credential_id, user_id=state.get("user_id"))
                    .one_or_none()
                )
                if cred is None:
                    call_error = "could not use its linked API key - log in as the account that added it"
                else:
                    system_prompt = (
                        "You suggest interesting points of interest for a road trip. Reply with "
                        "EXACTLY two lines and nothing else (no numbering, no explanation):\n"
                        "ROUTE: 3-5 concrete stop names separated by '|' - real places worth a "
                        "detour ALONG THE ACTUAL ROAD ROUTE between the starting point and the "
                        "destination. Spread them across the WHOLE route (e.g. one soon after "
                        "departure, some in the middle, one near the end) - do NOT cluster them all "
                        "near the destination, and do NOT suggest anything at the destination itself.\n"
                        "DESTINATION: 3-4 concrete activity/place names separated by '|' - things to "
                        "actually DO once already AT the destination"
                    )
                    user_message = f"Road trip from {origin or 'an unspecified starting point'} to {context or 'the destination'}."
                    if interests:
                        user_message += f" Traveler interests: {interests}."
                    try:
                        reply = providers.call_model(cred.provider, cred.api_key, model, system_prompt, user_message)
                        route_stops, destination_stops = _parse_route_destination(reply)
                        ai_backed = True
                    except providers.ModelCallError as exc:
                        call_error = str(exc)

            if not route_stops and not destination_stops:
                # No AI Model block connected (or the call failed) - fall back to a
                # plausible-looking suggestion built from the route context, in the same
                # style the AI Agent block uses before a real model call is wired up.
                route_stops = ["a scenic viewpoint", "a well-reviewed local spot"]
                destination_stops = [f"exploring {interests}"] if interests else ["a notable landmark"]

            route_part = f"On the way: {', '.join(route_stops)}" if route_stops else "No route stops suggested"
            dest_part = f"At the destination: {', '.join(destination_stops)}" if destination_stops else "No destination activities suggested"
            suggestion_message = f"For {context or 'your trip'} - {route_part}. {dest_part}."
            logger.info(f"[SUGGESTION] {suggestion_message}")
            print(f"[OverFlowEngine][SUGGESTION] {suggestion_message}")

            source_note = "AI-suggested" if ai_backed else "simulated - connect an AI Model block below for real suggestions"
            message = f'"{label}" suggests ({source_note}): {suggestion_message}'
            if call_error:
                message += f" [model call failed: {call_error}, fell back to a simulated suggestion]"

            steps.append(
                {
                    "node_id": node_id,
                    "type": ntype,
                    "label": label,
                    "message": message,
                    "options": ["Accept", "Reject"],
                }
            )
            state["awaiting_node"] = node_id
            state["awaiting_suggestion"] = {
                "stops": route_stops,
                "output_var": output_var,
                "destination_stops": destination_stops,
                "destination_output_var": destination_output_var,
            }
            return {
                "status": "awaiting_choice",
                "node_id": node_id,
                "label": label,
                "options": ["Accept", "Reject"],
                "steps": flush_new_steps(),
                "variables": _variables_snapshot(db),
            }

        elif ntype == "costEstimate":
            stops_raw = _render_message(data.get("waypoints", ""), eval_vars)
            dest_stops_raw = _render_message(data.get("destinationStops", ""), eval_vars)
            destination = _render_message(data.get("activityContext", ""), eval_vars)
            budget_raw = _render_message(data.get("budget", ""), eval_vars)
            origin = _render_message(data.get("origin", ""), eval_vars)
            stay_type = _render_message(data.get("stayType", ""), eval_vars)
            transport_mode = _render_message(data.get("transportMode", ""), eval_vars)
            check_in_raw = _render_message(data.get("checkInDate", ""), eval_vars)
            check_out_raw = _render_message(data.get("checkOutDate", ""), eval_vars)
            adults_raw = _render_message(data.get("adults", ""), eval_vars)
            children_raw = _render_message(data.get("children", ""), eval_vars)
            currency_raw = _render_message(data.get("currency", ""), eval_vars)
            fuel_type_raw = _render_message(data.get("fuelType", ""), eval_vars)
            consumption_raw = _render_message(data.get("fuelConsumption", ""), eval_vars)
            output_var = (data.get("outputVariable") or "").strip()
            stops = [s.strip() for s in stops_raw.split("|") if s.strip()]
            dest_stops = [s.strip() for s in dest_stops_raw.split("|") if s.strip()]

            def resolved(s: str) -> str:
                # A template field whose variable was never defined renders back with the
                # literal "{name}" still in it - treat that the same as blank/not set. Uses
                # fullmatch (the WHOLE trimmed field, not just a substring anywhere in it) so
                # a value that resolved fine but happens to contain a "{word}"-shaped chunk
                # isn't wrongly treated as still-unresolved.
                stripped = (s or "").strip()
                return "" if not stripped or _VAR_PATTERN.fullmatch(stripped) else stripped

            def to_int(s: str, default: int) -> int:
                match = re.search(r"\d+", s or "")
                return int(match.group(0)) if match else default

            adults = to_int(resolved(adults_raw), 1)
            children = to_int(resolved(children_raw), 0)
            travelers = max(adults + children, 1)

            nights = None
            d1 = d2 = None
            check_in, check_out = resolved(check_in_raw), resolved(check_out_raw)
            if check_in and check_out:
                try:
                    d1 = datetime.strptime(check_in, "%Y-%m-%d")
                    d2 = datetime.strptime(check_out, "%Y-%m-%d")
                    nights = (d2 - d1).days
                    if nights <= 0:
                        nights = None
                except ValueError:
                    nights = None

            stay_type = resolved(stay_type)
            transport_mode = resolved(transport_mode)
            origin = resolved(origin)
            destination = resolved(destination) or destination  # keep even if literally unresolved, for the message
            target_currency = (resolved(currency_raw) or "EUR").upper()

            # Same "model" handle/lookup pattern as the AI Agent and Suggest Activities blocks.
            model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
            model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
            model_data = (model_node.get("data") or {}) if model_node else {}
            model = model_data.get("model")
            credential_id = model_data.get("credentialId")

            items: list[dict] = []
            searched = False
            error: str | None = None
            skipped_notes: list[str] = []

            # Accommodation is priced from live booking-site rates first - the AI's
            # web-search estimate is only the fallback for when that lookup fails.
            live_items: list[dict] = []
            if stay_type and nights and resolved(destination):
                try:
                    live_items.append(
                        fetch_accommodation_price(
                            resolved(destination), stay_type, d1.date(), d2.date(), adults, children, target_currency
                        )
                    )
                    searched = True
                except AccommodationPriceError as exc:
                    logger.warning("Live accommodation price lookup failed for %r: %s", destination, exc)
                    skipped_notes.append(f"no live accommodation prices ({exc}) - used the AI estimate instead")
            live_accommodation = bool(live_items)

            # Same for the transport line when it's the travelers' own car: fuel along the
            # real route at current per-country prices. Tolls aren't in that data, so the
            # AI (when connected) is still asked for those alone.
            live_fuel = False
            if transport_mode and is_own_car(transport_mode) and origin and resolved(destination):
                consumption_match = re.search(r"\d+(?:[.,]\d+)?", resolved(consumption_raw))
                consumption = float(consumption_match.group(0).replace(",", ".")) if consumption_match else None
                try:
                    live_items.append(
                        estimate_fuel_cost(
                            origin, stops, resolved(destination), resolved(fuel_type_raw), consumption, target_currency
                        )
                    )
                    live_fuel = searched = True
                except FuelPriceError as exc:
                    logger.warning("Live fuel price lookup failed for %r -> %r: %s", origin, destination, exc)
                    skipped_notes.append(f"no live fuel prices ({exc}) - used the AI estimate instead")

            ai_accommodation = bool(stay_type and nights) and not live_accommodation
            has_model = bool(credential_id and model)
            needs_ai = bool(
                stops
                or dest_stops
                or (transport_mode and not live_fuel)
                or (stay_type and not live_accommodation)
                or (live_fuel and has_model)
            )

            if not stops and not dest_stops and not stay_type and not transport_mode:
                error = "nothing to price - no stops, accommodation, or transport configured"
            elif not needs_ai:
                if live_fuel:
                    # Only reachable without a model - otherwise tolls would still need the AI.
                    skipped_notes.append("tolls not estimated - connect an AI Model block to include them")
            elif not has_model:
                if live_items:
                    # Live lines alone still make a useful (if partial) breakdown.
                    skipped_notes.append("only live prices included - connect an AI Model block to price the rest (and tolls)")
                else:
                    error = "no AI Model block connected/unlocked"
            else:
                cred = (
                    db.query(models.AiCredential)
                    .filter_by(id=credential_id, user_id=state.get("user_id"))
                    .one_or_none()
                )
                if cred is None:
                    error = "could not use its linked API key - log in as the account that added it"
                else:
                    lines: list[str] = []
                    for stop in stops:
                        lines.append(f'one "route_activity" line for a stop ALONG THE WAY: {stop}')
                    for stop in dest_stops:
                        lines.append(f'one "destination_activity" line for something done AT the destination: {stop}')
                    if ai_accommodation:
                        lines.append(
                            f'one "accommodation" line: {nights} night(s) of {stay_type} accommodation '
                            f"in {destination or 'the destination'} for the whole group"
                        )
                    elif stay_type and not nights:
                        skipped_notes.append("accommodation not estimated - check-in/check-out dates not set")
                    if live_fuel:
                        lines.append(
                            f'one "transport" line: ONLY the road tolls and vignettes for a round trip by '
                            f"car from {origin} to {destination} and back - fuel is already priced "
                            'separately, so do NOT include fuel. Use 0 if there are no tolls, and name '
                            'the tolls/vignettes in "note"'
                        )
                    elif transport_mode and (origin or destination):
                        lines.append(
                            f'one "transport" line: round trip by {transport_mode} from '
                            f"{origin or 'the starting point'} to {destination or 'the destination'} "
                            "and back, for the whole group. If this mode is a car/own vehicle (not "
                            "explicitly a rental), assume the travelers are using their OWN car - price "
                            "ONLY the fuel/toll cost for that distance, do NOT include a rental car fee. "
                            "For plane/train/bus/other public transport, price the actual round-trip "
                            "tickets for the whole group instead"
                        )
                    elif transport_mode:
                        skipped_notes.append("transport not estimated - origin/destination not set")

                    system_prompt = (
                        "You are a travel budgeting assistant. Use web search to find realistic, "
                        f"current prices. There are {travelers} traveler(s) ({adults} adult(s), "
                        f"{children} child(ren)) - every price must be the TOTAL for the whole group, "
                        "not a per-person price. "
                        f'ALL prices must be in {target_currency}. If a price you find is quoted in a '
                        f"different currency, convert it to {target_currency} yourself using a current "
                        f"exchange rate (search for it if you're not certain) before reporting it - never "
                        f'report a number in its original currency under the "{target_currency}" label. '
                        'Reply with ONLY a JSON array, no markdown fences and no other text, one object '
                        "per requested line, in the order requested: "
                        '[{"name": "...", "category": "route_activity"|"destination_activity"|'
                        f'"accommodation"|"transport", "estimated_cost": <number in {target_currency}>, '
                        f'"currency": "{target_currency}", "note": "..."}}]. Use exactly the category given '
                        'for each requested line below. Never omit a requested line - use your best '
                        'real-world estimate if search doesn\'t turn up an exact price, and say so in "note".'
                    )
                    user_message = "Destination: " + (destination or "unspecified") + ". Price " + "; ".join(lines) + "."
                    try:
                        reply = providers.call_model(
                            cred.provider, cred.api_key, model, system_prompt, user_message, web_search=True
                        )
                        searched = True
                        items = _try_parse_cost_json(reply, target_currency)
                        used_fallback = False
                        if items is None:
                            # First attempt wasn't valid JSON - before giving up, ask the
                            # model (plain call, no web search needed this time - the prices
                            # are already in `reply`, this is a formatting fix) to reformat
                            # its own answer. Cheap and recovers a real answer far more often
                            # than immediately falling back to zeroed-out placeholders.
                            logger.warning(
                                "Cost Estimate reply wasn't valid JSON (%s); retrying with a repair "
                                "call. Original reply was %d chars, starts with: %r",
                                _classify_json_failure(reply),
                                len(reply),
                                reply[:200],
                            )
                            repair_system = (
                                "You reformat malformed text into strict JSON. Extract every price "
                                "estimate you can find in the given text and output ONLY a JSON array "
                                'matching this schema, nothing else: [{"name": "...", "category": '
                                '"route_activity"|"destination_activity"|"accommodation"|"transport", '
                                '"estimated_cost": <number>, "currency": "...", "note": "..."}]. Keep '
                                "every price and category from the original text - don't invent new "
                                "line items, just fix the formatting."
                            )
                            try:
                                repair_reply = providers.call_model(
                                    cred.provider, cred.api_key, model, repair_system, reply[:6000]
                                )
                                items = _try_parse_cost_json(repair_reply, target_currency)
                            except providers.ModelCallError:
                                items = None
                            if items is None:
                                reason = _classify_json_failure(reply)
                                logger.warning("Cost Estimate repair call also failed to produce valid JSON (%s)", reason)
                                items = _cost_fallback_items(
                                    stops, dest_stops, ai_accommodation, bool(transport_mode), target_currency, reason
                                )
                                used_fallback = True
                        if not used_fallback:
                            # A syntactically valid reply can still just skip requested lines
                            # (fewer searches to run) despite "never omit a line" - flag any
                            # gap instead of letting a short total pass silently as complete.
                            items = _reconcile_cost_items(
                                items, stops, dest_stops, ai_accommodation, bool(transport_mode), target_currency
                            )
                    except providers.ModelCallError as exc:
                        error = str(exc)

            items = live_items + items
            total = sum(item["estimated_cost"] for item in items)
            # Display in target_currency regardless of what individual items ended up
            # labeled - a mismatched item already carries a note flagging it as unreliable
            # rather than silently trusting its number as if it were converted.
            currency = target_currency
            currency_warning = any(item["currency"] != target_currency for item in items)
            budget_value = _parse_number(budget_raw)
            over_budget = budget_value is not None and total > budget_value

            breakdown = {
                "items": items,
                "total": round(total, 2),
                "currency": currency,
                "budget": budget_value,
                "overBudget": over_budget,
                "searched": searched,
                "destination": destination,
                "currencyWarning": currency_warning,
            }

            if output_var:
                serialized = json.dumps(breakdown)
                _upsert_variable(db, output_var, "string", serialized)
                eval_vars[output_var] = serialized

            if error:
                message = f'"{label}" could not estimate costs: {error}'
            else:
                budget_note = ""
                if budget_value is not None:
                    budget_note = f" ({'over' if over_budget else 'under'} budget of {budget_value:g} {currency})"
                notes = list(skipped_notes)
                if currency_warning:
                    notes.append("one or more prices may not have been converted to " + target_currency + " - check the notes on each item")
                skip_note = f" [{'; '.join(notes)}]" if notes else ""
                message = f'"{label}" estimated total cost: {total:g} {currency}{budget_note}{skip_note}'

            steps.append(
                {
                    "node_id": node_id,
                    "type": ntype,
                    "label": label,
                    "message": message,
                    "costBreakdown": None if error else breakdown,
                }
            )

        elif ntype == "tripSummary":
            destination = _render_message(data.get("activityContext", ""), eval_vars)
            check_in = _render_message(data.get("checkInDate", ""), eval_vars)
            check_out = _render_message(data.get("checkOutDate", ""), eval_vars)
            itinerary = _render_message(data.get("itinerary", ""), eval_vars)
            google_link = _render_message(data.get("googleMapsLink", ""), eval_vars)
            apple_link = _render_message(data.get("appleMapsLink", ""), eval_vars)
            cost_raw = _render_message(data.get("costBreakdownData", ""), eval_vars)

            def _clean(s: str) -> str:
                # Same fix as costEstimate's resolved() - fullmatch on the whole trimmed
                # field, not a "contains anywhere" search, so a long already-rendered value
                # (itinerary text, cost JSON) isn't wrongly blanked just because it happens
                # to contain some "{word}"-shaped substring.
                stripped = (s or "").strip()
                return "" if not stripped or _VAR_PATTERN.fullmatch(stripped) else stripped

            destination = _clean(destination)
            date_range = " - ".join(p for p in (_clean(check_in), _clean(check_out)) if p)
            itinerary = _clean(itinerary)
            route_links = [
                (link_label, url)
                for link_label, url in (("Google Maps", _clean(google_link)), ("Apple Maps", _clean(apple_link)))
                if url
            ]
            cost_breakdown = None
            cost_raw = _clean(cost_raw)
            if cost_raw:
                try:
                    cost_breakdown = json.loads(cost_raw)
                except json.JSONDecodeError:
                    cost_breakdown = None

            if not destination and not itinerary and not route_links and not cost_breakdown:
                message = f'"{label}" has nothing to put in a PDF yet - connect an itinerary, route, or cost block first'
                pdf_payload = None
            else:
                pdf_bytes = tripsummary.build_trip_pdf(
                    destination=destination,
                    date_range=date_range,
                    itinerary=itinerary,
                    route_links=route_links,
                    cost_breakdown=cost_breakdown,
                )
                pdf_payload = {
                    "filename": f"trip-{re.sub(r'[^a-zA-Z0-9]+', '-', destination).strip('-').lower() or 'summary'}.pdf",
                    "base64": base64.b64encode(pdf_bytes).decode("ascii"),
                }
                message = f'"{label}" built a {len(pdf_bytes) // 1024 or 1} KB trip summary PDF'

            steps.append(
                {"node_id": node_id, "type": ntype, "label": label, "message": message, "pdf": pdf_payload}
            )

        elif ntype == "mapsAction":
            provider = (data.get("mapsProvider") or "google").strip().lower()
            origin = _render_message(data.get("origin", ""), eval_vars)
            destination = _render_message(data.get("destination", ""), eval_vars)
            mode = data.get("travelMode", "driving")
            waypoints_raw = _render_message(data.get("waypoints", ""), eval_vars)
            waypoints = [w.strip() for w in waypoints_raw.split("|") if w.strip()]
            url = build_maps_url(provider, origin, destination, mode, waypoints)
            output_var = (data.get("outputVariable") or "").strip()
            if output_var:
                _upsert_variable(db, output_var, "string", url)
                eval_vars[output_var] = url
            provider_label = "Apple Maps" if provider == "apple" else "Google Maps"
            origin_part = f' from "{origin}"' if origin else ""
            stops_part = f" via {len(waypoints)} stop(s)" if waypoints else ""
            message = f'"{label}" built a {provider_label} route{origin_part} to "{destination}"{stops_part}: {url}'
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "trigger":
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": f'"{label}" activated'})

        else:
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": f'"{label}" activated'})

        for e in next_edges:
            queue.append(e["target"])

    steps.append({"node_id": None, "type": "system", "label": "Workflow", "message": "Workflow finished"})

    variables_snapshot = _variables_snapshot(db)
    run = models.WorkflowRun(status="completed", steps=steps, variables_snapshot=variables_snapshot)
    db.add(run)
    db.commit()
    db.refresh(run)

    return {"status": "completed", "run_id": run.id, "steps": flush_new_steps(), "variables": variables_snapshot}


def run_workflow(db: Session, nodes: list[dict], edges: list[dict], user_id: int | None = None) -> dict:
    node_by_id = {n["id"]: n for n in nodes}
    adjacency: dict[str, list[dict]] = {}
    incoming: dict[str, list[dict]] = {}
    for e in edges:
        adjacency.setdefault(e["source"], []).append(e)
        incoming.setdefault(e["target"], []).append(e)

    eval_vars = {name: _coerce(v["type"], v["value"]) for name, v in _variables_snapshot(db).items()}
    trigger_ids = [n["id"] for n in nodes if n.get("type") in ("trigger", "appTrigger", "formTrigger")]

    state = {
        "node_by_id": node_by_id,
        "adjacency": adjacency,
        "incoming": incoming,
        "eval_vars": eval_vars,
        "queue": list(trigger_ids),
        "visited": set(),
        "steps": [{"node_id": None, "type": "system", "label": "Workflow", "message": "Workflow triggered"}],
        "ai_io": {"input": None},
        # Only set when the run was made while signed in - lets a Task block save
        # tasks to that user's dashboard. Anonymous runs still work, tasks just aren't saved.
        "user_id": user_id,
    }

    result = _advance(db, state)
    if result["status"] == "awaiting_choice":
        run_id = str(uuid.uuid4())
        PENDING_RUNS[run_id] = state
        result["run_id"] = run_id
    return result


def continue_workflow(db: Session, run_id: str, choice: str) -> dict:
    state = PENDING_RUNS.get(run_id)
    if state is None:
        return {"status": "error", "message": f"unknown or expired run '{run_id}'", "steps": [], "variables": {}}

    node_id = state.get("awaiting_node")
    if not node_id:
        return {"status": "error", "message": "this run is not waiting on a choice", "steps": [], "variables": {}}

    node = state["node_by_id"].get(node_id, {})
    ntype = node.get("type", "choice")
    label = (node.get("data") or {}).get("label", node_id)

    if ntype == "activitySuggestion":
        pending = state.pop("awaiting_suggestion", None)
        accepted = choice.strip().lower() == "accept"
        if accepted and pending and (pending.get("output_var") or pending.get("destination_output_var")):
            # "|"-joined (not ",") so a stop name that itself contains a comma survives -
            # matches the separator a Maps Route/Trip Cost block splits its inputs on.
            saved: list[str] = []
            if pending.get("output_var"):
                stops_value = " | ".join(pending.get("stops") or [])
                _upsert_variable(db, pending["output_var"], "string", stops_value)
                state["eval_vars"][pending["output_var"]] = stops_value
                saved.append(f'route stops to "{pending["output_var"]}"')
            if pending.get("destination_output_var"):
                dest_value = " | ".join(pending.get("destination_stops") or [])
                _upsert_variable(db, pending["destination_output_var"], "string", dest_value)
                state["eval_vars"][pending["destination_output_var"]] = dest_value
                saved.append(f'destination activities to "{pending["destination_output_var"]}"')
            message = f'Accepted the suggestion at "{label}" - saved {" and ".join(saved)}'
        elif accepted:
            message = f'Accepted the suggestion at "{label}", but it has no output variable configured to save into'
        else:
            message = f'Declined the suggestion at "{label}" - route left unchanged'
        state["steps"].append({"node_id": node_id, "type": ntype, "label": label, "message": message})
        # Suggestions don't branch the flow - accept/reject only decides whether the
        # variable gets populated, so every outgoing edge continues either way.
        for e in state["adjacency"].get(node_id, []):
            state["queue"].append(e["target"])
    else:
        state.pop("awaiting_suggestion", None)
        matching = [e for e in state["adjacency"].get(node_id, []) if (e.get("sourceHandle") or "") == choice]
        state["steps"].append(
            {"node_id": node_id, "type": "choice", "label": label, "message": f'Choice made at "{label}": "{choice}"'}
        )
        for e in matching:
            state["queue"].append(e["target"])
    state.pop("awaiting_node", None)

    result = _advance(db, state)
    if result["status"] == "awaiting_choice":
        result["run_id"] = run_id
    else:
        PENDING_RUNS.pop(run_id, None)
    return result
