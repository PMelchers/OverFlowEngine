# OverFlowEngine

## What it is
A visual, drag-and-drop workflow builder. Users place blocks ("nodes") on a canvas, assign each block a function, and connect them into a pipeline. A workflow starts when its trigger fires and runs the connected blocks in order.

Think n8n / Zapier / ComfyUI, but built to grow into an **agentic workflow platform** — where blocks aren't just fixed functions but can eventually be AI agents that reason, call tools, and make decisions mid-pipeline.

## Core concept
- **Playground / canvas** — infinite pan-and-zoom surface where blocks are placed and wired together.
- **Blocks (nodes)** — a block wraps a function: input(s) in, output(s) out. Users configure what a block does.
- **Connections (edges)** — wires between block outputs and inputs define execution/data flow.
- **Trigger** — the entry point that starts a workflow run.
  - **v1: manual Button trigger** — click "Run" to execute the workflow.
  - Future: webhook, schedule/cron, event-based triggers.
- **Execution** — running the graph: resolving order from connections, passing data along edges, executing each block, tracking status/results per node.

## MVP scope (v1)
1. Canvas with drag-and-drop block placement (React Flow).
2. A small set of built-in block types (e.g. input, transform/function, output/log).
3. Connect blocks via edges; validate the graph (no invalid/cyclic connections where not allowed).
4. One trigger type: a manual **Run** button.
5. Backend executes the graph server-side, in topological order, and returns/streams results per node back to the canvas (node status: idle/running/success/error).
6. Save/load workflows.

## Future direction: agentic workflows
- **Agent blocks**: a block whose "function" is an LLM/agent step — given a prompt/goal and access to tools (which may be *other blocks* or external APIs), it decides what to do rather than running fixed logic.
- **Dynamic/conditional routing**: agents choosing which downstream branch to take instead of a fixed static path.
- **Tool-calling blocks**: expose blocks to an agent as callable tools, so an agent block can invoke other nodes in the graph.
- **More trigger types**: webhook, schedule, external event, incoming message.
- **Human-in-the-loop blocks**: pause execution for approval/input mid-run.
- **Credentials & secrets per block** for calling external services (APIs, DBs, LLM providers).
- **Execution history & replay**: inspect past runs, re-run from a failed node.

## Tech stack
See [TECHSTACK.md](TECHSTACK.md).

- **Frontend**: React + TypeScript + React Flow for the canvas/graph editor, Tailwind for styling.
- **Backend**: Python + FastAPI for the API, Pydantic for schema/validation of block configs and workflow definitions, SQLAlchemy for persistence.
- **Infrastructure**: PostgreSQL (workflows, blocks, run history), Redis + Celery/ARQ (async execution queue, background workers), Docker for deployment.
- **Execution layer**: a workflow engine that resolves the graph, a node/block registry defining available block types, a worker pool that runs block functions, a retry system for failed nodes, execution history for observability, and a credential manager for storing/using secrets blocks need.

## Open questions
- Block definition format: how is a block's "function" specified — built-in code, user-supplied script, or config-driven?
- Data passing: typed ports between blocks, or a loose JSON payload?
- How much of the agentic layer to design for now vs. defer (e.g. should the node schema anticipate agent blocks from day one)?
