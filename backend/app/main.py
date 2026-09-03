from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import executor, models
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
