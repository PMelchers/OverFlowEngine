<#
  Boots everything the E2E suite needs, then runs it:
   - starts Docker Desktop if it's not running, and waits for the daemon
   - starts Postgres + Redis via Docker Compose
   - installs backend/frontend dependencies if missing
   - starts the backend (FastAPI) in the background, waits until it responds
   - runs the Playwright suite (it starts/reuses the frontend dev server itself)

  Backend/Postgres/Redis are left running afterwards - use stop.ps1 to stop the
  backend, or 'docker compose down' to stop Postgres/Redis too.
#>

$root = $PSScriptRoot

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    ERROR: $msg" -ForegroundColor Red }

$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

# Docker
Write-Step "Checking Docker is running"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Docker daemon not reachable, starting Docker Desktop..."
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerExe)) {
        Write-Err "Docker Desktop not found at '$dockerExe'. Start Docker manually and re-run."
        exit 1
    }
    Start-Process $dockerExe
    $waited = 0
    while ($true) {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { break }
        if ($waited -ge 120) {
            Write-Err "Docker daemon did not come up within 120s."
            exit 1
        }
        Start-Sleep -Seconds 3
        $waited += 3
    }
}
Write-Ok "Docker daemon is running"

Write-Step "Starting Postgres + Redis (docker compose)"
Push-Location $root
docker compose up -d
Pop-Location
Write-Ok "Postgres (5432) and Redis (6379) starting"

# Backend
Write-Step "Checking backend environment"
if (-not (Test-Path $venvPython)) {
    Write-Warn "Backend virtualenv not found, creating it..."
    python -m venv (Join-Path $backendDir ".venv")
    Write-Ok "Created .venv"
}

& $venvPython -c "import fastapi, uvicorn, pydantic, psycopg, httpx, dotenv, mcp, reportlab" 2> $null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Backend dependencies missing, installing from requirements.txt..."
    & $venvPython -m pip install -q -r (Join-Path $backendDir "requirements.txt")
    Write-Ok "Backend dependencies installed"
} else {
    Write-Ok "Backend dependencies satisfied"
}

if (-not (Test-Path (Join-Path $backendDir ".env"))) {
    Copy-Item (Join-Path $backendDir ".env.example") (Join-Path $backendDir ".env")
    Write-Ok "Created backend/.env from .env.example"
}

Write-Step "Starting backend (FastAPI) on http://localhost:8000"
$backendRunning = (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)
if ($backendRunning) {
    Write-Ok "Backend already running on port 8000"
} else {
    Start-Process powershell -WindowStyle Hidden -ArgumentList @(
        "-NoExit", "-Command",
        "`$Host.UI.RawUI.WindowTitle = 'OverFlowEngine Backend (test run)'; cd `"$backendDir`"; .venv\Scripts\Activate.ps1; uvicorn app.main:app --port 8000"
    )
    $waited = 0
    while ($true) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) { break }
        } catch {}
        if ($waited -ge 60) {
            Write-Err "Backend did not respond on port 8000 within 60s."
            exit 1
        }
        Start-Sleep -Seconds 2
        $waited += 2
    }
    Write-Ok "Backend is responding"
}

# Frontend deps (Playwright's webServer runs `npm run dev` itself)
Write-Step "Checking frontend dependencies"
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Warn "node_modules not found, running npm install..."
    Push-Location $frontendDir
    npm install
    Pop-Location
    Write-Ok "Frontend dependencies installed"
} else {
    Write-Ok "Frontend dependencies satisfied"
}

npx --prefix $frontendDir playwright install chromium --with-deps *> $null

# Run the suite
Write-Step "Running Playwright E2E suite"
Push-Location $frontendDir
npm run test:e2e
$exitCode = $LASTEXITCODE
Pop-Location

Write-Host ""
if ($exitCode -eq 0) {
    Write-Ok "E2E suite passed"
} else {
    Write-Err "E2E suite failed (exit code $exitCode)"
}
Write-Host "Backend/Postgres/Redis are still running. Use stop.ps1 to stop the backend, 'docker compose down' for Postgres/Redis."
exit $exitCode
