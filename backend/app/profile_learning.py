"""Learning from what a user types into blocks, and from the replies they rate.

What is learned: the values a user fills in (for example "Italy" in a form's Destination country
field), not which block types they use. Ratings of AI replies are learned as before.

Balance, in short:
- Nothing is learned unless the user has switched learning on (users.learning_enabled).
- Workflows saved in privacy mode, runs in privacy mode and ratings given in privacy mode teach nothing.
- Only short, plain values are kept. Anything that looks private is skipped: fields named like
  address, email, phone, name, key, token, password, account or card, and values that are long,
  contain an email, or are template placeholders such as {tripBudget}.
- Values are saved right away, from the first saved or run workflow. Ratings only count once there are
  a couple of them that agree.
- At most MAX_HINTS hints go to the AI, and only through a connected Profile block.
- The user can see, delete or reset everything that was learned.
"""

import re

from sqlalchemy.orm import Session

from . import models

MAX_HINTS = 5
MIN_VALUE_COUNT = 1  # values are saved and used right away; the MAX_HINTS cap keeps the AI's list short
MIN_RATINGS = 2  # a reply type needs this many ratings before its rating counts as a preference
MAX_VALUE_LENGTH = 60

# Field names that may hold private information. Anything matching is never learned.
# Trip and calendar dates change every time, so they are not preferences either.
PRIVATE_FIELD = re.compile(
    r"address|email|mail|phone|\btel\b|name|token|secret|key|password|pass|account|card|iban|\bid$|date",
    re.I,
)


def learning_enabled(user: models.User) -> bool:
    return bool(getattr(user, "learning_enabled", False))


def _clean(name: str, value) -> tuple[str, str] | None:
    """Return (name, value) if this is a short, plain value worth learning, else None."""
    name = (name or "").strip()
    value = str(value if value is not None else "").strip()
    if not name or not value or len(value) > MAX_VALUE_LENGTH:
        return None
    if PRIVATE_FIELD.search(name) or "@" in value or "{" in value or "}" in value:
        return None
    return name, value


def _field_values(nodes: list[dict]) -> set[tuple[str, str]]:
    """The values typed into blocks: form fields, and Variable blocks. Each (name, value) pair is
    counted once per workflow, so repeating one field many times does not inflate it."""
    found: set[tuple[str, str]] = set()
    for node in nodes:
        kind = node.get("type") or ""
        data = node.get("data") or {}
        if kind == "formTrigger":
            for field in data.get("fields") or []:
                cleaned = _clean(field.get("name"), field.get("value"))
                if cleaned:
                    found.add(cleaned)
        elif kind == "variable":
            cleaned = _clean(data.get("label"), data.get("value"))
            if cleaned:
                found.add(cleaned)
    return found


def _bump(db: Session, user_id: int, kind: str, key: str) -> models.UserSignal:
    row = db.query(models.UserSignal).filter_by(user_id=user_id, kind=kind, key=key).one_or_none()
    if row is None:
        row = models.UserSignal(user_id=user_id, kind=kind, key=key, count=0, total=0)
        db.add(row)
    row.count += 1
    return row


def _field_key(name: str, value: str) -> str:
    return f"{name}={value}"


def record_saved_flow(db: Session, user: models.User, nodes: list[dict], privacy_mode: bool):
    """Called when a workflow is kept (saved)."""
    if privacy_mode or not learning_enabled(user):
        return
    for name, value in _field_values(nodes):
        _bump(db, user.id, "field", _field_key(name, value))
    db.commit()


def record_run(db: Session, user_id: int, nodes: list[dict], privacy_mode: bool) -> list[str]:
    """Called when a workflow finishes running. Returns one line per value learned from this run,
    so the canvas can show the user what the app picked up. Nothing is returned in privacy mode
    or when learning is off."""
    user = db.get(models.User, user_id)
    if user is None or privacy_mode or not learning_enabled(user):
        return []
    notes: list[str] = []
    for name, value in sorted(_field_values(nodes)):
        row = _bump(db, user_id, "field", _field_key(name, value))
        notes.append(f"Noticed {name} is '{value}' ({row.count} times so far)")
    db.commit()
    return notes


def record_rating(db: Session, user: models.User, result_type: str, rating: int, privacy_mode: bool = False):
    """Called when a user rates an AI reply. Ratings are stored as a running total so the
    average can be worked out later without keeping every single rating twice."""
    if privacy_mode or not learning_enabled(user):
        return
    row = db.query(models.UserSignal).filter_by(user_id=user.id, kind="rating", key=result_type).one_or_none()
    if row is None:
        row = models.UserSignal(user_id=user.id, kind="rating", key=result_type, count=0, total=0)
        db.add(row)
    row.count += 1
    row.total += rating
    db.commit()


def hints(db: Session, user_id: int) -> list[str]:
    """The few learned values and reply preferences worth telling the AI about. Strongest first."""
    user = db.get(models.User, user_id)
    if user is None or not learning_enabled(user):
        return []

    scored: list[tuple[int, str]] = []
    for row in db.query(models.UserSignal).filter_by(user_id=user_id).all():
        if row.kind == "field" and row.count >= MIN_VALUE_COUNT:
            name, _, value = row.key.partition("=")
            times = "once" if row.count == 1 else f"{row.count} times"
            scored.append((row.count, f"Usually sets {name} to '{value}' (used {times})"))
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
    # Only "field" and "rating" are learned now. Older block/app counts from before this change are
    # left out here; "Forget everything learned" clears them.
    rows = (
        db.query(models.UserSignal)
        .filter(models.UserSignal.user_id == user_id, models.UserSignal.kind.in_(("field", "rating")))
        .order_by(models.UserSignal.kind, models.UserSignal.key)
        .all()
    )
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "key": row.key,
            "count": row.count,
            "average": round(row.total / row.count, 2) if row.kind == "rating" and row.count else None,
        }
        for row in rows
    ]
