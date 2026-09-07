from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import auth, executor, models, providers
from .db import Base, engine, get_db

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
        conn.commit()


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


class UpdateProfileIn(BaseModel):
    name: str | None = None
    email: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class FlowIn(BaseModel):
    name: str
    nodes: list[dict]
    edges: list[dict]


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


def _flow_summary(flow: models.SavedFlow) -> dict:
    return {"id": flow.id, "name": flow.name, "created_at": flow.created_at}


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
    db.delete(flow)
    db.commit()
    return {"status": "deleted"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/workflows/run")
def run_workflow(workflow: Workflow, db: Session = Depends(get_db)):
    nodes = [n.model_dump() for n in workflow.nodes]
    edges = [e.model_dump() for e in workflow.edges]
    return executor.run_workflow(db, nodes, edges)


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
