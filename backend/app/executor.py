import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

from . import models, providers, calendar_providers
from .conditions import evaluate_conditions
from .maps import build_maps_url

logger = logging.getLogger("overflowengine.workflow")

_VAR_PATTERN = re.compile(r"\{(\w+)\}")

# App Action's targetApp values that are real calendar accounts (as opposed to a
# plain "send a message" app like Email/Slack/Teams) - maps the human-readable app
# name shown in the block to the provider key calendar_providers.py expects.
CALENDAR_APP_PROVIDERS = {"Google Calendar": "google", "Microsoft Calendar": "microsoft"}

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


def _parse_cost_items(
    reply: str,
    route_stops: list[str],
    destination_stops: list[str],
    has_accommodation: bool,
    has_transport: bool,
) -> list[dict]:
    """Parses a Cost Estimate model reply, expected to be a bare JSON array of
    {name, category, estimated_cost, currency, note}. Falls back to one zeroed-out
    entry per requested line (never silently drops one) if the model didn't return
    valid JSON."""
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

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if not isinstance(parsed, list) or not parsed:
            continue
        break
    else:
        parsed = None

    try:
        if parsed is None:
            raise ValueError("no valid JSON array found")
        items = []
        for entry in parsed:
            if not isinstance(entry, dict):
                continue
            try:
                cost = float(entry.get("estimated_cost", 0) or 0)
            except (TypeError, ValueError):
                cost = 0.0
            category = str(entry.get("category") or "route_activity").strip().lower()
            items.append(
                {
                    "name": str(entry.get("name") or "Unnamed item").strip(),
                    "category": category if category in _COST_CATEGORIES else "route_activity",
                    "estimated_cost": cost,
                    "currency": str(entry.get("currency") or "EUR").strip() or "EUR",
                    "note": str(entry.get("note") or "").strip(),
                }
            )
        if not items:
            raise ValueError("no usable entries")
        return items
    except (ValueError, TypeError, json.JSONDecodeError):
        fallback = [
            {
                "name": s,
                "category": "route_activity",
                "estimated_cost": 0.0,
                "currency": "EUR",
                "note": "could not parse the AI's price estimate",
            }
            for s in route_stops
        ] + [
            {
                "name": s,
                "category": "destination_activity",
                "estimated_cost": 0.0,
                "currency": "EUR",
                "note": "could not parse the AI's price estimate",
            }
            for s in destination_stops
        ]
        if has_accommodation:
            fallback.append(
                {
                    "name": "Accommodation",
                    "category": "accommodation",
                    "estimated_cost": 0.0,
                    "currency": "EUR",
                    "note": "could not parse the AI's price estimate",
                }
            )
        if has_transport:
            fallback.append(
                {
                    "name": "Transport",
                    "category": "transport",
                    "estimated_cost": 0.0,
                    "currency": "EUR",
                    "note": "could not parse the AI's price estimate",
                }
            )
        return fallback


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
            model_edges = [e for e in incoming.get(node_id, []) if (e.get("targetHandle") or "") == "model"]
            model_node = node_by_id.get(model_edges[0]["source"]) if model_edges else None
            model_data = (model_node.get("data") or {}) if model_node else {}
            model = model_data.get("model")
            credential_id = model_data.get("credentialId")
            input_text = ai_io.get("input")
            instructions = (data.get("prompt") or "").strip()
            # No AI Input block connected -> the Instructions field doubles as the
            # message itself, so a standalone AI Agent block works on its own.
            # Instructions become a system prompt only once a real input arrives too.
            system_prompt = instructions if input_text else None
            user_message = input_text or instructions

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
                # Plain "send a message" apps (Email/Slack/Teams/Webhook) - still simulated,
                # no real send wired up yet.
                to = _render_message(data.get("to", ""), eval_vars)
                subject = _render_message(data.get("subject", ""), eval_vars)
                body = _render_message(data.get("body", ""), eval_vars)
                subject_part = f' "{subject}"' if subject else ""
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
            output_var = (data.get("outputVariable") or "").strip()
            stops = [s.strip() for s in stops_raw.split("|") if s.strip()]
            dest_stops = [s.strip() for s in dest_stops_raw.split("|") if s.strip()]

            def resolved(s: str) -> str:
                # A template field whose variable was never defined renders back with the
                # literal "{name}" still in it - treat that the same as blank/not set.
                return "" if not s or _VAR_PATTERN.search(s) else s.strip()

            def to_int(s: str, default: int) -> int:
                match = re.search(r"\d+", s or "")
                return int(match.group(0)) if match else default

            adults = to_int(resolved(adults_raw), 1)
            children = to_int(resolved(children_raw), 0)
            travelers = max(adults + children, 1)

            nights = None
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

            if not stops and not dest_stops and not stay_type and not transport_mode:
                error = "nothing to price - no stops, accommodation, or transport configured"
            elif not credential_id or not model:
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
                    if stay_type and nights:
                        lines.append(
                            f'one "accommodation" line: {nights} night(s) of {stay_type} accommodation '
                            f"in {destination or 'the destination'} for the whole group"
                        )
                    elif stay_type:
                        skipped_notes.append("accommodation not estimated - check-in/check-out dates not set")
                    if transport_mode and (origin or destination):
                        lines.append(
                            f'one "transport" line: round trip by {transport_mode} from '
                            f"{origin or 'the starting point'} to {destination or 'the destination'} "
                            "and back, for the whole group"
                        )
                    elif transport_mode:
                        skipped_notes.append("transport not estimated - origin/destination not set")

                    system_prompt = (
                        "You are a travel budgeting assistant. Use web search to find realistic, "
                        f"current prices. There are {travelers} traveler(s) ({adults} adult(s), "
                        f"{children} child(ren)) - every price must be the TOTAL for the whole group, "
                        "not a per-person price. Reply with ONLY a JSON array, no markdown fences and "
                        "no other text, one object per requested line, in the order requested: "
                        '[{"name": "...", "category": "route_activity"|"destination_activity"|'
                        '"accommodation"|"transport", "estimated_cost": <number>, "currency": "EUR", '
                        '"note": "..."}]. Use exactly the category given for each requested line below. '
                        "Never omit a requested line - use your best real-world estimate if search "
                        'doesn\'t turn up an exact price, and say so in "note".'
                    )
                    user_message = "Destination: " + (destination or "unspecified") + ". Price " + "; ".join(lines) + "."
                    try:
                        reply = providers.call_model(
                            cred.provider, cred.api_key, model, system_prompt, user_message, web_search=True
                        )
                        searched = True
                        items = _parse_cost_items(
                            reply, stops, dest_stops, bool(stay_type and nights), bool(transport_mode)
                        )
                    except providers.ModelCallError as exc:
                        error = str(exc)

            total = sum(item["estimated_cost"] for item in items)
            currency = items[0]["currency"] if items else "EUR"
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
                skip_note = f" [{'; '.join(skipped_notes)}]" if skipped_notes else ""
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
