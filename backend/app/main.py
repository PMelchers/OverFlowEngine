import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import auth, calendar_providers, discord_mcp_client, executor, models, providers
from .db import Base, SessionLocal, engine, get_db

app = FastAPI(title="OverFlowEngine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # create_all only creates missing tables, not missing columns on existing
    # ones - this project has no migration tool, so patch older ai_credentials
    # tables in place instead of requiring a manual DB reset.
    with engine.connect() as conn:
        conn.execute(
            text("ALTER TABLE ai_credentials ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false")
        )
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR"))
        conn.execute(
            text("ALTER TABLE saved_flows ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false")
        )
        conn.execute(text("ALTER TABLE saved_flows ADD COLUMN IF NOT EXISTS description VARCHAR"))
        # calendar_connections started out with a shared server-wide OAuth app in mind
        # (access/refresh_token required); now every user brings their own app, so the
        # tokens aren't known until they finish connecting, and each row also needs its
        # own client id/secret.
        conn.execute(text("ALTER TABLE calendar_connections ADD COLUMN IF NOT EXISTS client_id VARCHAR"))
        conn.execute(text("ALTER TABLE calendar_connections ADD COLUMN IF NOT EXISTS client_secret VARCHAR"))
        conn.execute(text("ALTER TABLE calendar_connections ALTER COLUMN access_token DROP NOT NULL"))
        conn.execute(text("ALTER TABLE calendar_connections ALTER COLUMN refresh_token DROP NOT NULL"))
        conn.commit()
    _seed_demo_marketplace_flow()


def _seed_demo_marketplace_flow() -> None:
    """Seed one example published flow - an AI agent that pitches a million-dollar
    business idea - so the Marketplace isn't empty on a fresh install. Owned by a
    dedicated demo account (never logged into) and idempotent: skipped once it exists."""
    DEMO_EMAIL = "demo@overflowengine.local"
    FLOW_NAME = "Million-Dollar Business Idea Generator"

    db = SessionLocal()
    try:
        demo_user = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
        if demo_user is None:
            demo_user = models.User(
                email=DEMO_EMAIL,
                name="OverFlowEngine Demo",
                password_hash=auth.hash_password(os.urandom(24).hex()),
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)

        already_seeded = (
            db.query(models.SavedFlow)
            .filter(models.SavedFlow.user_id == demo_user.id, models.SavedFlow.name == FLOW_NAME)
            .first()
        )
        if already_seeded is not None:
            return

        nodes = [
            {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {"label": "Generate Idea"}},
            {
                "id": "ideaInput",
                "type": "aiInput",
                "position": {"x": 380, "y": 0},
                "data": {
                    "label": "ideaInput",
                    "value": (
                        "Generate one realistic, specific business idea that could plausibly reach "
                        "$1,000,000 in annual revenue within a few years. Include: a business name, the "
                        "target customer, the core product or service, how it makes money, and the single "
                        "biggest reason it could work right now."
                    ),
                },
            },
            {
                "id": "ideaAgent",
                "type": "aiAgent",
                "position": {"x": 760, "y": 0},
                "data": {
                    "label": "Business Idea Generator",
                    "prompt": (
                        "You are a sharp startup advisor. Pitch one concrete, realistic million-dollar "
                        "business idea - no vague platitudes, no disclaimers, just the idea and why it works."
                    ),
                },
            },
            {
                "id": "ideaModel",
                "type": "aiModel",
                "position": {"x": 880, "y": 280},
                "data": {"label": "Model", "credentialId": None},
            },
            {
                "id": "businessIdea",
                "type": "aiOutput",
                "position": {"x": 1140, "y": 0},
                "data": {"label": "businessIdea"},
            },
        ]
        edges = [
            {"id": "e-trigger-ideaInput", "source": "trigger", "target": "ideaInput"},
            {"id": "e-ideaInput-ideaAgent", "source": "ideaInput", "target": "ideaAgent"},
            {"id": "e-ideaModel-ideaAgent", "source": "ideaModel", "target": "ideaAgent", "targetHandle": "model"},
            {"id": "e-ideaAgent-businessIdea", "source": "ideaAgent", "target": "businessIdea"},
        ]

        db.add(
            models.SavedFlow(
                user_id=demo_user.id,
                name=FLOW_NAME,
                description=(
                    "No setup needed - just press Start and AI generates a realistic business idea "
                    "that could make a million dollars."
                ),
                nodes=nodes,
                edges=edges,
                is_public=True,
            )
        )
        db.commit()
    finally:
        db.close()


class NodeIn(BaseModel):
    id: str
    type: str = "block"
    data: dict = {}


class EdgeIn(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class Workflow(BaseModel):
    nodes: list[NodeIn]
    edges: list[EdgeIn]


class ChoiceContinue(BaseModel):
    run_id: str
    choice: str


class RegisterIn(BaseModel):
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class CredentialIn(BaseModel):
    label: str
    api_key: str


class AppCredentialIn(BaseModel):
    target_app: str
    label: str
    token: str


class UpdateProfileIn(BaseModel):
    name: str | None = None
    email: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class ReauthIn(BaseModel):
    password: str


class FlowIn(BaseModel):
    name: str
    nodes: list[dict]
    edges: list[dict]


class FlowPatchIn(BaseModel):
    is_public: bool | None = None
    description: str | None = None


class MarketplaceCopyIn(BaseModel):
    name: str


class TaskIn(BaseModel):
    title: str


class TaskPatchIn(BaseModel):
    title: str | None = None
    done: bool | None = None


class AssignmentIn(BaseModel):
    name: str
    description: str | None = None


class AssignmentPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None


class CalendarAppIn(BaseModel):
    client_id: str
    client_secret: str


def _user_out(user: models.User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}


def _mask_key(key: str) -> str:
    if len(key) <= 4:
        return "*" * len(key)
    return f"{'*' * (len(key) - 4)}{key[-4:]}"


def _credential_out(cred: models.AiCredential) -> dict:
    return {
        "id": cred.id,
        "provider": cred.provider,
        "label": cred.label,
        "api_key_masked": _mask_key(cred.api_key),
        "verified": cred.verified,
        "created_at": cred.created_at,
    }


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if "@" not in email or not body.password:
        raise HTTPException(status_code=400, detail="A valid email and non-empty password are required")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    user = models.User(email=email, password_hash=auth.hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = auth.create_token(user.id, user.email)
    return {"token": token, "user": _user_out(user)}


@app.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth.create_token(user.id, user.email)
    return {"token": token, "user": _user_out(user)}


@app.get("/auth/me")
def me(current_user: models.User = Depends(auth.get_current_user)):
    return _user_out(current_user)


@app.patch("/auth/me")
def update_profile(
    body: UpdateProfileIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if body.name is not None:
        current_user.name = body.name.strip() or None
    if body.email is not None:
        email = body.email.strip().lower()
        if "@" not in email:
            raise HTTPException(status_code=400, detail="Enter a valid email address")
        existing = db.query(models.User).filter(models.User.email == email).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="An account with that email already exists")
        current_user.email = email
    db.commit()
    db.refresh(current_user)
    return _user_out(current_user)


@app.post("/auth/change-password")
def change_password(
    body: ChangePasswordIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    current_user.password_hash = auth.hash_password(body.new_password)
    db.commit()
    return {"status": "ok"}


@app.post("/auth/reauth")
def reauth(
    body: ReauthIn,
    current_user: models.User = Depends(auth.get_current_user),
):
    """Step-up check for sensitive settings (API keys, connected apps, security) -
    confirms the current password without changing anything. The frontend gates
    those pages behind this, separate from the long-lived login session."""
    if not auth.verify_password(body.password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"status": "ok"}


@app.get("/credentials")
def list_credentials(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    creds = (
        db.query(models.AiCredential)
        .filter(models.AiCredential.user_id == current_user.id)
        .order_by(models.AiCredential.created_at.desc())
        .all()
    )
    return [_credential_out(c) for c in creds]


@app.post("/credentials", status_code=status.HTTP_201_CREATED)
def create_credential(
    body: CredentialIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not body.label.strip() or not body.api_key.strip():
        raise HTTPException(status_code=400, detail="Label and API key are both required")

    api_key = body.api_key.strip()
    provider = providers.detect_provider(api_key)
    if provider == "other":
        raise HTTPException(
            status_code=400,
            detail="Could not recognize which platform this key is from - check it's copied correctly.",
        )

    verified = providers.verify_api_key(provider, api_key)
    if verified is False:
        raise HTTPException(
            status_code=400,
            detail=f"{provider} rejected this API key - double check it's correct.",
        )

    cred = models.AiCredential(
        user_id=current_user.id,
        provider=provider,
        label=body.label.strip(),
        api_key=api_key,
        verified=bool(verified),
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return _credential_out(cred)


@app.get("/models/{provider}")
def list_models(provider: str):
    return {"provider": provider, "models": providers.PROVIDER_MODELS.get(provider, [])}


@app.delete("/credentials/{credential_id}")
def delete_credential(
    credential_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    cred = (
        db.query(models.AiCredential)
        .filter(models.AiCredential.id == credential_id, models.AiCredential.user_id == current_user.id)
        .first()
    )
    if cred is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(cred)
    db.commit()
    return {"status": "deleted"}


def _app_credential_out(cred: models.AppCredential) -> dict:
    return {
        "id": cred.id,
        "target_app": cred.target_app,
        "label": cred.label,
        "token_masked": _mask_key(cred.token),
        "verified": cred.verified,
        "created_at": cred.created_at,
    }


@app.get("/app-credentials")
def list_app_credentials(
    target_app: str | None = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(models.AppCredential).filter(models.AppCredential.user_id == current_user.id)
    if target_app:
        query = query.filter(models.AppCredential.target_app == target_app)
    creds = query.order_by(models.AppCredential.created_at.desc()).all()
    return [_app_credential_out(c) for c in creds]


@app.post("/app-credentials", status_code=status.HTTP_201_CREATED)
def create_app_credential(
    body: AppCredentialIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    target_app = body.target_app.strip()
    token = body.token.strip()
    if not target_app or not body.label.strip() or not token:
        raise HTTPException(status_code=400, detail="Target app, label and token are all required")

    verified: bool | None = None
    if target_app == "Discord":
        verified, detail = discord_mcp_client.verify_discord_bot_token(token)
        if verified is False:
            raise HTTPException(status_code=400, detail=f"Discord rejected this bot token: {detail}")
        # verified is None when the MCP server itself couldn't be reached - still save
        # the token unverified rather than blocking on an infra hiccup.

    cred = models.AppCredential(
        user_id=current_user.id,
        target_app=target_app,
        label=body.label.strip(),
        token=token,
        verified=bool(verified),
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)
    return _app_credential_out(cred)


@app.delete("/app-credentials/{credential_id}")
def delete_app_credential(
    credential_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    cred = (
        db.query(models.AppCredential)
        .filter(models.AppCredential.id == credential_id, models.AppCredential.user_id == current_user.id)
        .first()
    )
    if cred is None:
        raise HTTPException(status_code=404, detail="Credential not found")
    db.delete(cred)
    db.commit()
    return {"status": "deleted"}


def _flow_summary(flow: models.SavedFlow) -> dict:
    return {
        "id": flow.id,
        "name": flow.name,
        "description": flow.description,
        "is_public": flow.is_public,
        "created_at": flow.created_at,
    }


def _marketplace_out(flow: models.SavedFlow, author: models.User) -> dict:
    return {
        "id": flow.id,
        "name": flow.name,
        "description": flow.description,
        "author": author.name or author.email,
        "created_at": flow.created_at,
    }


def _strip_shared_credentials(nodes: list[dict]) -> list[dict]:
    """Marketplace copies must never carry over another user's AI Model credential
    reference - reset those blocks to locked so the copier has to link their own key."""
    cleaned = []
    for n in nodes:
        n = dict(n)
        if n.get("type") == "aiModel":
            data = dict(n.get("data") or {})
            data["credentialId"] = None
            data.pop("provider", None)
            data.pop("model", None)
            n["data"] = data
        cleaned.append(n)
    return cleaned


@app.get("/flows")
def list_flows(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    flows = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.user_id == current_user.id)
        .order_by(models.SavedFlow.created_at.desc())
        .all()
    )
    return [_flow_summary(f) for f in flows]


@app.get("/flows/{flow_id}")
def get_flow(
    flow_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    flow = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.user_id == current_user.id)
        .first()
    )
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    return {**_flow_summary(flow), "nodes": flow.nodes, "edges": flow.edges}


@app.post("/flows", status_code=status.HTTP_201_CREATED)
def create_flow(
    body: FlowIn, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="A flow name is required")
    if not body.nodes:
        raise HTTPException(status_code=400, detail="Add at least one block before saving")
    flow = models.SavedFlow(user_id=current_user.id, name=body.name.strip(), nodes=body.nodes, edges=body.edges)
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return _flow_summary(flow)


@app.patch("/flows/{flow_id}")
def update_flow(
    flow_id: int,
    body: FlowPatchIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    flow = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.user_id == current_user.id)
        .first()
    )
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    if body.is_public is not None:
        flow.is_public = body.is_public
    if body.description is not None:
        flow.description = body.description.strip() or None
    db.commit()
    db.refresh(flow)
    return _flow_summary(flow)


@app.get("/marketplace")
def list_marketplace(db: Session = Depends(get_db)):
    rows = (
        db.query(models.SavedFlow, models.User)
        .join(models.User, models.SavedFlow.user_id == models.User.id)
        .filter(models.SavedFlow.is_public.is_(True))
        .order_by(models.SavedFlow.created_at.desc())
        .all()
    )
    return [_marketplace_out(flow, author) for flow, author in rows]


@app.post("/marketplace/{flow_id}/copy", status_code=status.HTTP_201_CREATED)
def copy_marketplace_flow(
    flow_id: int,
    body: MarketplaceCopyIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    source = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.is_public.is_(True))
        .first()
    )
    if source is None:
        raise HTTPException(status_code=404, detail="Marketplace flow not found")
    name = body.name.strip() or f"{source.name} (copy)"
    copy = models.SavedFlow(
        user_id=current_user.id,
        name=name,
        nodes=_strip_shared_credentials(source.nodes),
        edges=source.edges,
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return _flow_summary(copy)


@app.delete("/flows/{flow_id}")
def delete_flow(
    flow_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    flow = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.user_id == current_user.id)
        .first()
    )
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    db.query(models.AssignmentFlow).filter(models.AssignmentFlow.flow_id == flow_id).delete()
    db.delete(flow)
    db.commit()
    return {"status": "deleted"}


@app.post("/flows/{flow_id}/assignments/{assignment_id}", status_code=status.HTTP_201_CREATED)
def bind_flow_to_assignment(
    flow_id: int,
    assignment_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Labels a flow as bound to one big assignment. A flow can be bound to more than
    one assignment - call this once per assignment. Idempotent."""
    flow = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.user_id == current_user.id)
        .first()
    )
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    assignment = (
        db.query(models.Assignment)
        .filter(models.Assignment.id == assignment_id, models.Assignment.user_id == current_user.id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")

    existing = (
        db.query(models.AssignmentFlow)
        .filter(
            models.AssignmentFlow.flow_id == flow_id, models.AssignmentFlow.assignment_id == assignment_id
        )
        .first()
    )
    if existing is None:
        db.add(models.AssignmentFlow(assignment_id=assignment_id, flow_id=flow_id))
        db.commit()
    return {"status": "bound"}


@app.delete("/flows/{flow_id}/assignments/{assignment_id}")
def unbind_flow_from_assignment(
    flow_id: int,
    assignment_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    flow = (
        db.query(models.SavedFlow)
        .filter(models.SavedFlow.id == flow_id, models.SavedFlow.user_id == current_user.id)
        .first()
    )
    if flow is None:
        raise HTTPException(status_code=404, detail="Flow not found")
    db.query(models.AssignmentFlow).filter(
        models.AssignmentFlow.flow_id == flow_id, models.AssignmentFlow.assignment_id == assignment_id
    ).delete()
    db.commit()
    return {"status": "unbound"}


def _task_out(task: models.Task) -> dict:
    return {"id": task.id, "title": task.title, "done": task.done, "created_at": task.created_at}


@app.get("/tasks")
def list_tasks(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    tasks = (
        db.query(models.Task)
        .filter(models.Task.user_id == current_user.id)
        .order_by(models.Task.created_at.desc())
        .all()
    )
    return [_task_out(t) for t in tasks]


@app.post("/tasks", status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskIn, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="A task title is required")
    task = models.Task(user_id=current_user.id, title=body.title.strip())
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_out(task)


@app.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    body: TaskPatchIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    task = (
        db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == current_user.id).first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.title is not None:
        task.title = body.title.strip() or task.title
    if body.done is not None:
        task.done = body.done
    db.commit()
    db.refresh(task)
    return _task_out(task)


@app.delete("/tasks/{task_id}")
def delete_task(
    task_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    task = (
        db.query(models.Task).filter(models.Task.id == task_id, models.Task.user_id == current_user.id).first()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"status": "deleted"}


def _assignment_out(assignment: models.Assignment, flows: list[models.SavedFlow]) -> dict:
    return {
        "id": assignment.id,
        "name": assignment.name,
        "description": assignment.description,
        "created_at": assignment.created_at,
        "flows": [{"id": f.id, "name": f.name} for f in flows],
    }


@app.get("/assignments")
def list_assignments(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    assignments = (
        db.query(models.Assignment)
        .filter(models.Assignment.user_id == current_user.id)
        .order_by(models.Assignment.created_at.desc())
        .all()
    )
    out = []
    for a in assignments:
        flows = (
            db.query(models.SavedFlow)
            .join(models.AssignmentFlow, models.AssignmentFlow.flow_id == models.SavedFlow.id)
            .filter(models.AssignmentFlow.assignment_id == a.id)
            .all()
        )
        out.append(_assignment_out(a, flows))
    return out


@app.post("/assignments", status_code=status.HTTP_201_CREATED)
def create_assignment(
    body: AssignmentIn, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="An assignment name is required")
    assignment = models.Assignment(
        user_id=current_user.id, name=body.name.strip(), description=(body.description or "").strip() or None
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _assignment_out(assignment, [])


@app.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    body: AssignmentPatchIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .filter(models.Assignment.id == assignment_id, models.Assignment.user_id == current_user.id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if body.name is not None:
        assignment.name = body.name.strip() or assignment.name
    if body.description is not None:
        assignment.description = body.description.strip() or None
    db.commit()
    db.refresh(assignment)
    flows = (
        db.query(models.SavedFlow)
        .join(models.AssignmentFlow, models.AssignmentFlow.flow_id == models.SavedFlow.id)
        .filter(models.AssignmentFlow.assignment_id == assignment.id)
        .all()
    )
    return _assignment_out(assignment, flows)


@app.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    assignment = (
        db.query(models.Assignment)
        .filter(models.Assignment.id == assignment_id, models.Assignment.user_id == current_user.id)
        .first()
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.query(models.AssignmentFlow).filter(models.AssignmentFlow.assignment_id == assignment_id).delete()
    db.delete(assignment)
    db.commit()
    return {"status": "deleted"}


def _require_calendar_provider(provider: str) -> str:
    provider = provider.strip().lower()
    if provider not in calendar_providers.PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown calendar provider '{provider}'")
    return provider


def _calendar_connection_out(connection: models.CalendarConnection | None, provider: str) -> dict:
    if connection is None:
        return {"provider": provider, "has_app": False, "client_id": None, "connected": False, "account_email": None}
    return {
        "provider": provider,
        "has_app": bool(connection.client_id and connection.client_secret),
        "client_id": connection.client_id,
        "connected": bool(connection.access_token),
        "account_email": connection.account_email,
    }


@app.put("/calendar/{provider}/app")
def save_calendar_app(
    provider: str,
    body: CalendarAppIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Saves the user's own OAuth app (client id/secret) for this provider - no
    server-wide OAuth app exists, everyone registers and brings their own."""
    provider = _require_calendar_provider(provider)
    if not body.client_id.strip() or not body.client_secret.strip():
        raise HTTPException(status_code=400, detail="Both client ID and client secret are required")

    connection = (
        db.query(models.CalendarConnection)
        .filter(models.CalendarConnection.user_id == current_user.id, models.CalendarConnection.provider == provider)
        .first()
    )
    if connection is None:
        connection = models.CalendarConnection(user_id=current_user.id, provider=provider)
        db.add(connection)
    connection.client_id = body.client_id.strip()
    connection.client_secret = body.client_secret.strip()
    db.commit()
    db.refresh(connection)
    return _calendar_connection_out(connection, provider)


@app.get("/calendar/{provider}/connect")
def calendar_connect(
    provider: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the provider's consent-screen URL - the frontend navigates the
    browser there itself (a fetch response can't carry the redirect)."""
    provider = _require_calendar_provider(provider)
    connection = (
        db.query(models.CalendarConnection)
        .filter(models.CalendarConnection.user_id == current_user.id, models.CalendarConnection.provider == provider)
        .first()
    )
    if connection is None or not connection.client_id:
        raise HTTPException(
            status_code=400,
            detail=f"Save your {provider.capitalize()} OAuth app's client ID and secret first.",
        )
    # Reuses the login-token signer as short-lived, tamper-proof OAuth state - it
    # already round-trips a user id through decode_token, no need for a second scheme.
    state = auth.create_token(current_user.id, current_user.email)
    return {"url": calendar_providers.authorization_url(provider, connection.client_id, state)}


@app.get("/calendar/{provider}/callback")
def calendar_callback(provider: str, code: str, state: str, db: Session = Depends(get_db)):
    """Hit directly by Google/Microsoft's redirect after the user grants consent -
    a plain browser navigation, so it can't carry our Bearer token; the signed
    `state` round-trip is what ties this back to the right user."""
    provider = _require_calendar_provider(provider)
    try:
        payload = auth.decode_token(state)
    except HTTPException:
        raise HTTPException(status_code=400, detail="This connection link expired - try connecting again")
    user_id = payload["user_id"]

    connection = (
        db.query(models.CalendarConnection)
        .filter(models.CalendarConnection.user_id == user_id, models.CalendarConnection.provider == provider)
        .first()
    )
    if connection is None or not connection.client_id or not connection.client_secret:
        raise HTTPException(status_code=400, detail="No OAuth app saved for this provider - start over from Settings")

    tokens = calendar_providers.exchange_code(provider, connection.client_id, connection.client_secret, code)
    account_email = calendar_providers.fetch_account_email(provider, tokens["access_token"])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))

    connection.access_token = tokens["access_token"]
    if tokens.get("refresh_token"):
        connection.refresh_token = tokens["refresh_token"]
    connection.expires_at = expires_at
    connection.account_email = account_email
    db.commit()

    # ?calendar_connected=<provider> lets the frontend recognize this landing as the
    # tail end of the OAuth popup (see ConnectAppModal/OAuthPopupBridge) instead of
    # just loading the app fresh - it posts back to the tab that opened it and closes.
    return RedirectResponse(f"{calendar_providers.FRONTEND_BASE_URL}/?calendar_connected={provider}")


@app.get("/calendar/connections")
def list_calendar_connections(
    current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)
):
    connections = {
        c.provider: c
        for c in db.query(models.CalendarConnection)
        .filter(models.CalendarConnection.user_id == current_user.id)
        .all()
    }
    return [_calendar_connection_out(connections.get(p), p) for p in calendar_providers.PROVIDERS]


@app.delete("/calendar/{provider}")
def remove_calendar(
    provider: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Fully removes this provider's saved OAuth app credentials and any tokens -
    matches the add/delete-only pattern used for AI API keys (never edit a saved
    secret in place; delete and re-add instead)."""
    provider = _require_calendar_provider(provider)
    db.query(models.CalendarConnection).filter(
        models.CalendarConnection.user_id == current_user.id, models.CalendarConnection.provider == provider
    ).delete()
    db.commit()
    return {"status": "removed"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/workflows/run")
def run_workflow(
    workflow: Workflow,
    current_user: models.User | None = Depends(auth.get_current_user_optional),
    db: Session = Depends(get_db),
):
    nodes = [n.model_dump() for n in workflow.nodes]
    edges = [e.model_dump() for e in workflow.edges]
    return executor.run_workflow(db, nodes, edges, user_id=current_user.id if current_user else None)


@app.post("/workflows/continue")
def continue_workflow(body: ChoiceContinue, db: Session = Depends(get_db)):
    return executor.continue_workflow(db, body.run_id, body.choice)


@app.get("/state")
def get_state(db: Session = Depends(get_db)):
    variables = {
        v.name: {"type": v.var_type, "value": v.value} for v in db.query(models.Variable).all()
    }
    last_run = (
        db.query(models.WorkflowRun).order_by(models.WorkflowRun.id.desc()).first()
    )
    return {
        "variables": variables,
        "last_run": (
            {
                "run_id": last_run.id,
                "status": last_run.status,
                "steps": last_run.steps,
                "created_at": last_run.created_at,
            }
            if last_run
            else None
        ),
    }


@app.delete("/state")
def wipe_state(db: Session = Depends(get_db)):
    db.query(models.Variable).delete()
    db.query(models.WorkflowRun).delete()
    db.commit()
    return {"status": "wiped"}
