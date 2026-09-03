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

**Shutdown:** `.\stop.ps1` (Windows) / `./stop.ps2` (Linux) stops both dev servers cleanly (see [Shutting down](#shutting-down)).

## What needs to be running

| Component | Purpose | Required for MVP? |
|---|---|---|
| **Frontend** (`frontend/`) | React Flow canvas UI, port `5173` | Yes |
| **Backend** (`backend/`) | FastAPI, executes workflows, port `8000` | Yes |
| **PostgreSQL** | Stores workflows, blocks, run history | Not yet used by the stub API, but start it — needed as soon as persistence lands |
| **Redis** | Queue/broker for async execution (Celery/ARQ workers) | Not yet used by the stub API, but start it — needed once execution moves off the request thread |

Right now `POST /workflows/run` just echoes the graph back — it doesn't touch Postgres or Redis yet. Starting them isn't strictly required to click "Run" today, but they're part of the intended stack (see [TECHSTACK.md](TECHSTACK.md)) and will be needed as soon as persistence/async execution are implemented.

## First-time setup

The quick-start scripts above do all of this for you automatically (including creating `backend/.env` from `.env.example`). Only follow these manual steps if you want to set things up by hand instead.

**Windows (PowerShell):**
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env    # adjust if needed

cd ..\frontend
npm install
```

**Linux:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # adjust if needed

cd ../frontend
npm install
```

## Every-day startup

Run each of these in its own terminal, from the project root.

**1. Infrastructure (Postgres + Redis)**
```bash
docker compose up -d
```

**2. Backend** (from `backend/`)
```powershell
.venv\Scripts\Activate.ps1     # Windows
source .venv/bin/activate      # Linux
uvicorn app.main:app --reload --port 8000
```
API docs at http://localhost:8000/docs, health check at http://localhost:8000/health.

**3. Frontend** (from `frontend/`)
```bash
npm run dev
```
Canvas at http://localhost:5173.

## Shutting down
**Windows:** run `.\stop.ps1` — it frees ports 8000/5173, killing each dev server's full process tree (so `uvicorn --reload`/`vite` watcher child processes don't linger and re-hold the port next time). Closing the two PowerShell windows also works, but `stop.ps1` is more reliable if a reload worker survived a window close.

**Linux:** run `./stop.ps2` — same idea, frees ports 8000/5173 via `lsof`/`kill`. Since `start.ps2` runs both servers in the background (not in a terminal you can Ctrl+C), this is the normal way to stop them.

```bash
docker compose down       # stop Postgres/Redis (add -v to also wipe data volumes)
```

## Troubleshooting
- **Run button shows "could not reach backend"** — make sure `uvicorn` is running on port 8000 and CORS origin matches the frontend's dev URL (`http://localhost:5173`, set in `backend/app/main.py`).
- **Port already in use / `WinError 10013`** — `start.ps1`/`start.ps2` now automatically free ports 8000 and 5173 before launching, so this should self-heal on the next run. If it still happens, run `.\stop.ps1` (Windows) or `./stop.ps2` (Linux) first, or manually find the process with `Get-NetTCPConnection -LocalPort 8000` (Windows) / `lsof -ti:8000` (Linux) and stop it.
- **`ModuleNotFoundError: No module named 'psycopg2'`** — `backend/.env` is gitignored, so if it was created before the project switched from `psycopg2` to `psycopg` (v3), it still has the old `DATABASE_URL=postgresql://...` scheme. Fix it in place or regenerate it:
  ```bash
  sed -i 's#DATABASE_URL=postgresql://#DATABASE_URL=postgresql+psycopg://#' backend/.env
  # or just: rm backend/.env   (the next script run recreates it from .env.example)
  ```
- **`pip install` fails building `pydantic-core` or `psycopg[binary]` from source** (seen on very new Python releases, e.g. 3.14) — `requirements.txt` uses `>=` minimum versions specifically so pip picks a release with a prebuilt wheel for your Python instead of an old exact pin with no wheel. If it still tries to compile from source, your Python is likely newer than any released wheel yet; either wait for upstream wheels or install build deps: `sudo apt install libpq-dev python3-dev`.
- **Don't run the start/stop scripts with `sudo`** — it isn't needed and leaves `backend/.venv`/`frontend/node_modules` root-owned, which then breaks normal (non-sudo) runs. If Docker needs `sudo`, fix that once with `sudo usermod -aG docker $USER` (then re-log in) instead. If you already ran with `sudo`, reclaim ownership: `sudo chown -R $USER:$USER backend/.venv frontend/node_modules`.
