# OverFlowEngine

A visual, drag-and-drop workflow builder. Place blocks on a canvas, configure what each one does, wire them together, and run the workflow — server-side, with real variables, conditional branching, and logging.

Think n8n / Zapier / ComfyUI, built to grow into an **agentic workflow platform**, where blocks can eventually be AI agents that reason, call tools, and make decisions mid-pipeline.

## Features
- Drag-and-drop canvas (React Flow) with grid snapping and node-to-node alignment guides
- Core blocks: Trigger, Variable, If (single or multi-condition), Choice, Log, App Trigger
- Agentic blocks: AI Agent, AI Input, AI Output — link a model to an agent step
- Group selected blocks into a single reusable, editable saved block; edits propagate to every instance
- Server-side execution: variables persist, conditions are evaluated safely (no arbitrary eval), runs are recorded
- Console log panel with a clear button

See [md/PROJECT.md](md/PROJECT.md) for the full concept and roadmap, and [md/TECHSTACK.md](md/TECHSTACK.md) for the stack.

## Quick start
Two scripts check your tooling, install anything missing, start Postgres/Redis via Docker, and launch both servers.

**Windows (PowerShell):**
```powershell
.\start.ps1
```

**Ubuntu / other Linux:**
```bash
chmod +x start.ps2   # first time only
./start.ps2
```

Then open the canvas at http://localhost:5173 (backend API docs at http://localhost:8000/docs).

**Stopping:** `.\stop.ps1` (Windows) / `./stop.ps2` (Linux) — frees ports 8000/5173 cleanly.

Full setup details, manual step-by-step startup, and troubleshooting live in [md/RUNNING.md](md/RUNNING.md).

## Project layout
```
backend/    FastAPI app: workflow execution, variables, conditions, persistence
frontend/   React + React Flow canvas UI
md/         Project docs (concept, tech stack, running instructions)
```
