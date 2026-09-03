# Running OverFlowEngine

## Quick start

Two scripts check your tooling, install anything missing, start Postgres/Redis, and launch both servers for you. Both are safe to re-run any time.

**Windows (PowerShell):**
```powershell
.\start.ps1
```
Backend and frontend each open in their own PowerShell window so you can see their logs directly.

**Ubuntu / other Linux:**
```bash
./start.ps2
```
(The `.ps2` name is just this project's "startup script #2" naming — it's a bash script, not PowerShell.) Backend and frontend run in the background; logs go to `backend.log` and `frontend.log` in the project root. Tail them with `tail -f backend.log` / `tail -f frontend.log`. If it's not executable yet, run `chmod +x start.ps2` first.

## What needs to be running

| Component | Purpose | Required for MVP? |
|---|---|---|
| **Frontend** (`frontend/`) | React Flow canvas UI, port `5173` | Yes |
| **Backend** (`backend/`) | FastAPI, executes workflows, port `8000` | Yes |
| **PostgreSQL** | Stores workflows, blocks, run history | Not yet used by the stub API, but start it — needed as soon as persistence lands |
| **Redis** | Queue/broker for async execution (Celery/ARQ workers) | Not yet used by the stub API, but start it — needed once execution moves off the request thread |

Right now `POST /workflows/run` just echoes the graph back — it doesn't touch Postgres or Redis yet. Starting them isn't strictly required to click "Run" today, but they're part of the intended stack (see [TECHSTACK.md](TECHSTACK.md)) and will be needed as soon as persistence/async execution are implemented.

## First-time setup

```bash
# Backend
cd backend
python -m venv .venv
./.venv/Scripts/activate      # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
cp .env.example .env          # adjust if needed

# Frontend
cd frontend
npm install
```

## Every-day startup

Run each of these in its own terminal, from the project root.

**1. Infrastructure (Postgres + Redis)**
```bash
docker compose up -d
```

**2. Backend** (from `backend/`)
```bash
./.venv/Scripts/activate
uvicorn app.main:app --reload --port 8000
```
API docs at http://localhost:8000/docs, health check at http://localhost:8000/health.

**3. Frontend** (from `frontend/`)
```bash
npm run dev
```
Canvas at http://localhost:5173.

## Shutting down
```bash
docker compose down       # stop Postgres/Redis (add -v to also wipe data volumes)
```
Stop the backend/frontend dev servers with `Ctrl+C` in their terminals.

## Troubleshooting
- **Run button shows "could not reach backend"** — make sure `uvicorn` is running on port 8000 and CORS origin matches the frontend's dev URL (`http://localhost:5173`, set in `backend/app/main.py`).
- **Port already in use** — another process is bound to 5173/8000/5432/6379; stop it or change the port. On Windows this can show up as `WinError 10013` when starting `uvicorn`, which looks like a permissions error but usually just means something (often a leftover `uvicorn` process from an earlier run) is already listening on that port — find it with `Get-NetTCPConnection -LocalPort 8000` / `Get-Process -Id <pid>` and stop it.
- **`pip install` fails with `pg_config executable not found` while building `psycopg2`** (seen on Ubuntu) — pip is trying to build `psycopg2-binary` from source because no prebuilt wheel exists for your Python version (common if you're on a very new/just-released Python). Install libpq's dev headers and re-run: `sudo apt install libpq-dev python3-dev`.
