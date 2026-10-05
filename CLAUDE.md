# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

OverFlowEngine is a visual drag-and-drop workflow builder (in the spirit of n8n, Zapier, or ComfyUI) that is meant to grow into an agentic workflow platform. Users place blocks on a React Flow canvas, wire them together, and the FastAPI backend runs the graph server-side. Product concept and roadmap: [md/PROJECT.md](md/PROJECT.md). Architectural decisions and their reasoning: [md/DECISIONS.md](md/DECISIONS.md). Add new non-obvious decisions there.

## Layout

```
backend/app/        FastAPI app (Python, SQLAlchemy, Postgres)
frontend/src/       React 19 + TypeScript + React Flow v11 + Tailwind v4 (Vite)
frontend/tests/e2e/ Playwright E2E tests
mcp-servers/discord Standalone Discord MCP server (Streamable HTTP, port 8765)
md/                 Project docs: PROJECT, DECISIONS, RUNNING, TECHSTACK
```

## Commands

Development runs on Windows (PowerShell). The `.ps2` files are **bash** scripts for Linux, despite the extension.

| Task | Command |
|---|---|
| Start everything (deps, Docker Postgres/Redis, backend, frontend) | `.\start.ps1` (Linux: `./start.ps2`) |
| Stop dev servers (frees ports 8000/5173) | `.\stop.ps1` (Linux: `./stop.ps2`) |
| Infrastructure only | `docker compose up -d` |
| Backend only (from `backend/`) | `.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000` |
| Frontend only (from `frontend/`) | `npm run dev` (serves on http://localhost:5173) |
| Frontend type-check and build | `npm run build` (`tsc -b && vite build`) |
| Frontend lint | `npm run lint` (oxlint) |
| E2E tests, full bootstrap | `.\start-tests.ps1` (starts Docker, Postgres, Redis, and the backend, then runs Playwright) |
| E2E tests, backend already running | `cd frontend; npm run test:e2e` (`test:e2e:ui` for UI mode) |
| Single E2E test | `cd frontend; npx playwright test tests/e2e/dashboard.spec.ts -g "test name"` |
| Discord MCP server | `cd mcp-servers/discord; python server.py` |

API docs are at http://localhost:8000/docs and the health check is at `/health`. The project has no backend unit tests. Playwright is the only test suite. It needs a live backend and Postgres, and it starts or reuses the Vite dev server itself.

Important: `start.ps1` (Windows) does **not** start the Discord MCP server, but `start.ps2` (Linux) does. On Windows, start it by hand to test real Discord sends.

## Backend architecture (`backend/app/`)

- **`main.py`**: all HTTP routes live in this one file, together with their Pydantic request models (`NodeIn`, `EdgeIn`, `Workflow`, and others). The route groups are auth, AI credentials, app credentials, flows, marketplace, tasks, assignments, calendar OAuth, workflow run/continue, and state. CORS allows only `http://localhost:5173`.
- **No migration tool.** On startup, `Base.metadata.create_all()` runs, followed by hand-written `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements in `on_startup()`. **When you add a column to an existing model in `models.py`, also add a matching `ALTER TABLE` line there.** `create_all` alone does not update existing databases. Startup also seeds a demo marketplace flow.
- **`executor.py`**: the workflow engine, and the largest backend file.
  - `run_workflow()` builds adjacency maps from the edges and seeds a BFS queue with every trigger node (`trigger`, `appTrigger`, `formTrigger`). It then calls `_advance()`.
  - `_advance()` pops nodes off the queue and dispatches on `node["type"]` through one long `if/elif ntype == ...` chain. Each branch appends a `{node_id, type, label, message}` step and enqueues targets. Branching nodes enqueue only the edges whose `sourceHandle` matches the result. For `if`/`ifOne` the handle is `"true"` or `"false"`, and a missing handle counts as `"true"`. For `choice` the handle is the label of the chosen option. Unknown types fall through to a generic "activated" step.
  - **To add a block type on the backend, add an `elif ntype == "<kind>"` branch here.**
  - **Pausing:** `choice` and `activitySuggestion` nodes stop the run with `status: "awaiting_choice"`. The whole run state is stored in the in-memory dict `PENDING_RUNS` under a uuid `run_id`, and `POST /workflows/continue` resumes it. That state is lost when the backend restarts or reloads, and it only works with a single process.
  - The executor is synchronous. Async MCP calls are wrapped in `asyncio.run()`, one per call.
  - Text fields support `{variableName}` interpolation through `_render_message()`.
  - Variables are global rows in the `variables` table, so they are not scoped per user or per run. They persist across runs. `DELETE /state` wipes variables and run history.
- **`conditions.py`**: safe If-block evaluation (no `eval`). Conditions combine strictly left to right with per-clause `and`/`or` and no precedence. The right-hand value is coerced to the type of the variable on the left.
- **`providers.py`**: LLM provider abstraction. `detect_provider()` infers the provider from the API key's format. `call_model()` handles OpenAI, Anthropic (via the `anthropic` SDK), Google, and a `test` provider that needs no network. Model lists are in `PROVIDER_MODELS`. Raise `ModelCallError` with a message that is safe to show in the step log.
- **`auth.py`**: home-grown HMAC-signed tokens (not a JWT library) plus PBKDF2 password hashing. `get_current_user` requires sign-in. `get_current_user_optional` is used where anonymous use is allowed, for example running workflows. Anonymous editing and running are a supported mode, so don't add hard auth to the editor or run paths.
- **`calendar_providers.py`**: Google/Microsoft Calendar OAuth2. **Each user registers their own OAuth app.** No server-wide client ID or secret exists, and none should be added to `.env`.
- **`discord_mcp_client.py`**: MCP client that calls `mcp-servers/discord` at `DISCORD_MCP_URL`. Discord is a `targetApp` on the existing `appAction` block, not a separate node type (see DECISIONS.md). Per-user bot tokens are stored in `AppCredential`.
- **`accommodation_prices.py`**: the Trip Cost block's live accommodation prices. It gets booking-site rates from Xotelo (free, no key, keyed on TripAdvisor location codes). The location code is found via DuckDuckGo HTML search and then checked against a Nominatim geocode. All sources are unofficial, so any failure raises `AccommodationPriceError` and the executor falls back to the AI web-search estimate. See [md/LIVE-PRICES.md](md/LIVE-PRICES.md).
- **`fuel_prices.py`**: live fuel cost for own-car transport.
  - It builds an OSRM route with a point every 10 km. Ferry steps are excluded and reported as `ferryKm`.
  - Each point gets a country, and each country a price: station data for France, Spain and the UK, otherwise the EU Weekly Oil Bulletin average.
  - `simulate_fill_ups()` decides where the car fills up. The item carries the stops as `fuelStops`.
  - Failures raise `FuelPriceError`, which triggers the AI fallback. Tolls and ferry tickets are still asked of the AI.
- **`geo.py`**: shared geo helpers.
  - Nominatim geocoding goes through a process-wide 1 request/second throttle and an in-memory cache. **Always use these helpers for Nominatim calls. Don't call Nominatim directly.**
  - `country_code()` is an offline point-in-polygon lookup on Natural Earth borders, downloaded once to the gitignored `backend/.cache/`.
- **`maps.py`**: builds Google/Apple Maps directions URLs. **`tripsummary.py`**: generates trip PDFs with reportlab.

Config comes from `backend/.env` (copied from `.env.example` and gitignored). It uses `DATABASE_URL` with the `postgresql+psycopg://` scheme (psycopg v3, not psycopg2), plus `SECRET_KEY`, `DISCORD_MCP_URL`, `BACKEND_BASE_URL`, and `FRONTEND_BASE_URL`.

## Frontend architecture (`frontend/src/`)

- **Routing:** no router. `App.tsx` holds a `View` state union (`dashboard | editor | settings | marketplace`) and switches between them. A popup opened with `?calendar_connected=` renders `OAuthPopupBridge` instead of the app.
- **`Canvas.tsx`**: the editor and the largest frontend file. It holds the React Flow state, the `nodeTypes` map, save/load, grouping, running, and the log panel. **`nodeTypes` must stay referentially stable** because React Flow remounts every node when its identity changes. Define components at module scope. Most nodes are wrapped with `withQuickAdd`.
- **Groups / custom blocks:** "Group Selected" collapses nodes into a `group` node that holds a `subgraph`. Saved custom blocks live in `localStorage` (`customBlocks.ts`). Before a run, groups are recursively flattened into plain nodes, so **the backend never sees `group` nodes**. Editing a saved block updates every instance of it (`refreshGroupInstances`).
- **`nodes/types.ts`**: `BlockKind` union, the per-kind data types (a discriminated union on `kind`), `PALETTE_ITEMS`, `APP_TRIGGER_SOURCES`, and AI quick actions. `nodes/*Node.tsx` contains one component per block. Shared hooks: `useVariableInsertion`, `useConnectedModel` (finds the AI Model block wired under an agent), and `useAppConnection`.
- **Adding a new block type** touches `BlockKind` and its data type in `nodes/types.ts`, a `PALETTE_ITEMS` entry, a `nodes/<Name>Node.tsx` component, a registration in `nodeTypes` in `Canvas.tsx`, and an `elif` branch in `backend/app/executor.py`. The React Flow `type` and the backend `ntype` string must match.
- **Shared UI and helpers:** `Modal.tsx` (use it for all modals), `useAuthedResource.ts` (authenticated data fetching for pages), `auth.tsx` (`AuthProvider` with the token in `localStorage` key `overflow.authToken`, user in `overflow.authUser`), `theme.tsx` (dark mode), and `templates.ts` (starter flows on the dashboard).
- `API_BASE` comes from `apiBase.ts` (`VITE_API_BASE`, default `http://localhost:8000`). Import it from there and don't redefine it.
- Styling uses Tailwind utility classes with `dark:` variants throughout. Icons come from `lucide-react`.

## E2E tests

`frontend/tests/e2e/fixtures/auth.ts` provides `signedInUser` and `signedInPage`. These register a fresh user through the real API for each test and seed the auth keys in `localStorage`. Use these fixtures for tests that need a signed-in user instead of driving the auth modal. Prefer role- and text-based locators (`getByRole`, `getByText`).

## Conventions

- Match the surrounding comment style. Comments explain *why*, often at length, and usually point to related code or decisions.
- Error messages from block execution go into the run's step log as readable text. Avoid raising exceptions from inside the executor loop.
- Secrets (AI keys, bot tokens, OAuth client secrets) are stored per user in the database. They are masked in API responses and stripped when a flow is published to the marketplace (`_strip_shared_credentials`).
