from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, func

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AiCredential(Base):
    __tablename__ = "ai_credentials"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False)
    label = Column(String, nullable=False)
    api_key = Column(String, nullable=False)
    verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppCredential(Base):
    """A secret needed to actually reach a target app from an App Action block (e.g. a
    Discord bot token) - kept separate from AiCredential since these aren't LLM providers
    and have no associated "model" concept."""

    __tablename__ = "app_credentials"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    target_app = Column(String, nullable=False)
    label = Column(String, nullable=False)
    token = Column(String, nullable=False)
    verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SavedFlow(Base):
    __tablename__ = "saved_flows"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    nodes = Column(JSON, nullable=False)
    edges = Column(JSON, nullable=False)
    # Marketplace: a flow the owner has chosen to publish, visible to every user.
    is_public = Column(Boolean, nullable=False, default=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Task(Base):
    """A small to-do item - added manually from the dashboard, or automatically by a
    Task block while a workflow runs (only when the run is made while signed in)."""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    done = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Assignment(Base):
    """A big-picture piece of work that one or more saved flows can be labeled as
    belonging to, so related flows can be found and tracked together on the dashboard."""

    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AssignmentFlow(Base):
    """Many-to-many link: a flow can be bound to more than one assignment, and an
    assignment can have more than one flow bound to it."""

    __tablename__ = "assignment_flows"

    id = Column(Integer, primary_key=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False, index=True)
    flow_id = Column(Integer, ForeignKey("saved_flows.id"), nullable=False, index=True)


class CalendarConnection(Base):
    """One user's own OAuth app registration + resulting link to a real Google or
    Microsoft calendar. There is no shared/server-wide OAuth app - each user brings
    their own client id/secret (registered by them with Google/Microsoft), so
    client_id/client_secret are set first, then access/refresh_token once they've
    actually completed the consent flow."""

    __tablename__ = "calendar_connections"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False)  # "google" | "microsoft"
    client_id = Column(String, nullable=True)
    client_secret = Column(String, nullable=True)
    account_email = Column(String, nullable=True)
    access_token = Column(String, nullable=True)
    refresh_token = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WorkflowRun(Base):
    """One row per run, created when the run starts. Variables are scoped to the run
    (no global variables table any more - see DECISIONS.md), and a run paused on a
    Choice / Activity Suggestion block keeps its full executor state in `state` so it
    survives a backend restart and can be continued from any process."""

    __tablename__ = "workflow_runs"

    id = Column(Integer, primary_key=True)
    # The id the frontend sees and continues with. A uuid rather than the integer id,
    # because anonymous runs can be continued by whoever holds it - it must not be guessable.
    public_id = Column(String, unique=True, nullable=True, index=True)
    # Null for anonymous runs - those are still logged, they just don't belong on
    # anyone's dashboard.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    # Which saved flow was open in the editor, if any. Deliberately not a foreign key:
    # deleting a flow must not delete (or be blocked by) its run history, and flow_name
    # keeps the run labeled after the flow is renamed or gone.
    flow_id = Column(Integer, nullable=True)
    flow_name = Column(String, nullable=True)
    # running -> awaiting_choice -> succeeded | failed, or interrupted / expired (see
    # executor.expire_stale_runs). "failed" means at least one step carries "error": True
    # or the run crashed. Rows from before succeeded/failed existed just say "completed".
    status = Column(String, nullable=False)
    steps = Column(JSON, nullable=False)
    variables_snapshot = Column(JSON, nullable=False)
    # Executor state while status == "awaiting_choice", cleared once the run moves on.
    state = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Bumped on every write - how long a paused run has been waiting (PENDING_RUN_TTL).
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
