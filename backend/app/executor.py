import logging
import re
import uuid

from sqlalchemy.orm import Session

from . import models
from .conditions import evaluate_conditions
from .maps import build_maps_url

logger = logging.getLogger("overflowengine.workflow")

_VAR_PATTERN = re.compile(r"\{(\w+)\}")

# Runs paused on a Choice block, keyed by run_id. Holds only plain data (no
# SQLAlchemy objects) so it survives across the separate HTTP requests /
# DB sessions of the run -> continue -> continue ... sequence.
PENDING_RUNS: dict[str, dict] = {}


def _render_message(template: str, variables: dict) -> str:
    def replace(match: re.Match) -> str:
        name = match.group(1)
        return str(variables[name]) if name in variables else match.group(0)

    return _VAR_PATTERN.sub(replace, template or "")


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
            model = model_data.get("model") or "no model connected"
            input_text = ai_io.get("input")
            if input_text:
                simulated_output = f'[preview reply from {model}] responding to: "{input_text}"'
                message = f'AI Agent "{label}" received "{input_text}" -> simulated a reply from {model} (real model calls not wired up yet)'
            else:
                simulated_output = f"[preview reply from {model}] (no AI Input block provided any input)"
                message = f'AI Agent "{label}" ran with no input -> simulated a reply from {model} (real model calls not wired up yet)'
            ai_io["output"] = simulated_output
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
            to = _render_message(data.get("to", ""), eval_vars)
            subject = _render_message(data.get("subject", ""), eval_vars)
            body = _render_message(data.get("body", ""), eval_vars)
            subject_part = f' "{subject}"' if subject else ""
            message = (
                f'"{label}" would send{subject_part} to "{to}" via {target_app}: "{body}" '
                "(simulated - real send not wired up yet)"
            )
            steps.append({"node_id": node_id, "type": ntype, "label": label, "message": message})

        elif ntype == "mapsAction":
            provider = (data.get("mapsProvider") or "google").strip().lower()
            origin = _render_message(data.get("origin", ""), eval_vars)
            destination = _render_message(data.get("destination", ""), eval_vars)
            mode = data.get("travelMode", "driving")
            url = build_maps_url(provider, origin, destination, mode)
            output_var = (data.get("outputVariable") or "").strip()
            if output_var:
                _upsert_variable(db, output_var, "string", url)
                eval_vars[output_var] = url
            provider_label = "Apple Maps" if provider == "apple" else "Google Maps"
            origin_part = f' from "{origin}"' if origin else ""
            message = f'"{label}" built a {provider_label} route{origin_part} to "{destination}": {url}'
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


def run_workflow(db: Session, nodes: list[dict], edges: list[dict]) -> dict:
    node_by_id = {n["id"]: n for n in nodes}
    adjacency: dict[str, list[dict]] = {}
    incoming: dict[str, list[dict]] = {}
    for e in edges:
        adjacency.setdefault(e["source"], []).append(e)
        incoming.setdefault(e["target"], []).append(e)

    eval_vars = {name: _coerce(v["type"], v["value"]) for name, v in _variables_snapshot(db).items()}
    trigger_ids = [n["id"] for n in nodes if n.get("type") in ("trigger", "appTrigger")]

    state = {
        "node_by_id": node_by_id,
        "adjacency": adjacency,
        "incoming": incoming,
        "eval_vars": eval_vars,
        "queue": list(trigger_ids),
        "visited": set(),
        "steps": [{"node_id": None, "type": "system", "label": "Workflow", "message": "Workflow triggered"}],
        "ai_io": {"input": None},
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
    label = (node.get("data") or {}).get("label", node_id)

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
