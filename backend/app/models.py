from sqlalchemy import JSON, Column, DateTime, Integer, String, func

from .db import Base


class Variable(Base):
    __tablename__ = "variables"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    var_type = Column(String, nullable=False, default="string")
    value = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id = Column(Integer, primary_key=True)
    status = Column(String, nullable=False)
    steps = Column(JSON, nullable=False)
    variables_snapshot = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
