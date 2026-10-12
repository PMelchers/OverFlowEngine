"""Learning from what a user keeps and rates, and turning it into a few light hints.

Balance, in short:
- Nothing is learned unless the user has switched learning on (users.learning_enabled).
- Workflows saved in privacy mode and ratings given in privacy mode teach nothing.
- A signal only becomes a hint once it is repeated (a block or app used in several
  saved workflows, or several ratings that agree). One-off choices are ignored.
- At most MAX_HINTS hints go to the AI, and only when a Profile block is connected.
- The user can see, delete or reset everything that was learned.
"""

from sqlalchemy.orm import Session

from . import models

MAX_HINTS = 5
MIN_BLOCK_COUNT = 3  # a block or app must appear in this many saved workflows to count as a habit
MIN_RATINGS = 2  # a reply type needs this many ratings before its rating counts as a preference

BLOCK_NAMES = {
    "aiAgent": "AI Agent",
    "aiInput": "AI Input",
    "aiOutput": "AI Output",
    "aiModel": "AI Model",
    "appAction": "App Action",
    "appTrigger": "App Trigger",
    "formTrigger": "Form Trigger",
    "mapsAction": "Maps Route",
    "costEstimate": "Trip Cost",
    "tripSummary": "Trip PDF",
    "activitySuggestion": "Suggest Activities",
    "variable": "Variable",
    "if": "If",
    "ifOne": "If (single)",
    "choice": "Choice",
    "log": "Log",
    "task": "Task",
    "trigger": "Start Button",
    "profile": "My Profile",
}


def learning_enabled(user: models.User) -> bool:
    return bool(getattr(user, "learning_enabled", False))


def _bump(db: Session, user_id: int, kind: str, key: str) -> models.UserSignal:
    row = (
        db.query(models.UserSignal)
        .filter_by(user_id=user_id, kind=kind, key=key)
        .one_or_none()
    )
    if row is None:
        row = models.UserSignal(user_id=user_id, kind=kind, key=key, count=0, total=0)
        db.add(row)
    row.count += 1
    return row


def _blocks_and_apps(nodes: list[dict]) -> tuple[set[str], set[str]]:
    """Block types and apps used in a workflow. Each one is counted once per workflow, so one
    big workflow full of AI Agents does not outweigh several small ones."""
    blocks: set[str] = set()
    apps: set[str] = set()
    for node in nodes:
        kind = node.get("type") or ""
        if kind in ("group", ""):
            continue
        blocks.add(kind)
        data = node.get("data") or {}
        app = data.get("targetApp")
        if app and kind in ("appAction", "appTrigger"):
            apps.add(str(app))
    return blocks, apps


def record_saved_flow(db: Session, user: models.User, nodes: list[dict], privacy_mode: bool):
    """Called when a workflow is kept (saved)."""
    if privacy_mode or not learning_enabled(user):
        return
    blocks, apps = _blocks_and_apps(nodes)
    for kind in blocks:
        _bump(db, user.id, "block", kind)
    for app in apps:
        _bump(db, user.id, "app", app)
    db.commit()


def record_run(db: Session, user_id: int, nodes: list[dict], privacy_mode: bool) -> list[str]:
    """Called when a workflow finishes running. Returns one line per thing learned from this run,
    so the canvas can show the user what the app picked up. Nothing is returned in privacy mode
    or when learning is off."""
    user = db.get(models.User, user_id)
    if user is None or privacy_mode or not learning_enabled(user):
        return []
    blocks, apps = _blocks_and_apps(nodes)
    notes: list[str] = []
    for kind in sorted(blocks):
        row = _bump(db, user_id, "block", kind)
        notes.append(f"Noticed you use {_block_name(kind)} blocks ({row.count} times so far)")
    for app in sorted(apps):
        row = _bump(db, user_id, "app", app)
        notes.append(f"Noticed you use {app} ({row.count} times so far)")
    db.commit()
    return notes


def record_rating(db: Session, user: models.User, result_type: str, rating: int, privacy_mode: bool = False):
    """Called when a user rates an AI reply. Ratings are stored as a running total so the
    average can be worked out later without keeping every single rating twice."""
    if privacy_mode or not learning_enabled(user):
        return
    row = (
        db.query(models.UserSignal)
        .filter_by(user_id=user.id, kind="rating", key=result_type)
        .one_or_none()
    )
    if row is None:
        row = models.UserSignal(user_id=user.id, kind="rating", key=result_type, count=0, total=0)
        db.add(row)
    row.count += 1
    row.total += rating
    db.commit()


def _block_name(key: str) -> str:
    return BLOCK_NAMES.get(key, key)


def hints(db: Session, user_id: int) -> list[str]:
    """The few learned habits and reply preferences worth telling the AI about. Strongest first."""
    user = db.get(models.User, user_id)
    if user is None or not learning_enabled(user):
        return []

    scored: list[tuple[float, str]] = []
    for row in db.query(models.UserSignal).filter_by(user_id=user_id).all():
        if row.kind == "block" and row.count >= MIN_BLOCK_COUNT:
            scored.append((row.count, f"Often uses {_block_name(row.key)} blocks (in {row.count} saved workflows)"))
        elif row.kind == "app" and row.count >= MIN_BLOCK_COUNT:
            scored.append((row.count, f"Often connects {row.key} (in {row.count} saved workflows)"))
        elif row.kind == "rating" and row.count >= MIN_RATINGS:
            average = row.total / row.count
            if average >= 4:
                scored.append((row.count, f"Tends to like the replies from '{row.key}' (average {average:.1f}/5)"))
            elif average <= 2:
                scored.append((row.count, f"Tends to dislike the replies from '{row.key}' (average {average:.1f}/5)"))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [text for _, text in scored[:MAX_HINTS]]


def signals_out(db: Session, user_id: int) -> list[dict]:
    """Everything learned so far, for the profile page to show and let the user delete."""
    rows = db.query(models.UserSignal).filter_by(user_id=user_id).order_by(models.UserSignal.kind, models.UserSignal.key).all()
    out = []
    for row in rows:
        out.append(
            {
                "id": row.id,
                "kind": row.kind,
                "key": row.key,
                "count": row.count,
                "average": round(row.total / row.count, 2) if row.kind == "rating" and row.count else None,
            }
        )
    return out
