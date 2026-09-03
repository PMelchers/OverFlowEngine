<#
  Starts OverFlowEngine end-to-end:
   - checks required tooling is installed
   - installs backend/frontend dependencies if missing
   - starts Postgres + Redis via Docker Compose
   - launches the backend (FastAPI) and frontend (Vite) each in their own window
#>

$root = $PSScriptRoot

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    ERROR: $msg" -ForegroundColor Red }

$missing = @()

Write-Step "Checking required tools"

function Test-Tool($name, $command, $versionArgs) {
    $cmd = Get-Command $command -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Write-Err "$name not found (expected command '$command' on PATH)"
        $script:missing += $name
        return $false
    }
    $version = (& $command $versionArgs 2>$null | Select-Object -First 1)
    if ($version) {
        Write-Ok "$name found - $version"
    } else {
        Write-Ok "$name found"
    }
    return $true
}

$hasNode   = Test-Tool "Node.js" "node" "--version"
$hasNpm    = Test-Tool "npm" "npm" "--version"
$hasPython = Test-Tool "Python" "python" "--version"
$hasDocker = Test-Tool "Docker" "docker" "--version"

if ($missing.Count -gt 0) {
    Write-Err "Missing required tools: $($missing -join ', '). Install them and re-run this script."
    exit 1
}

# Docker daemon check (compose needs the daemon, not just the CLI)
Write-Step "Checking Docker is running"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Docker daemon not reachable. Start Docker Desktop, then re-run this script to get Postgres/Redis."
    $dockerRunning = $false
} else {
    Write-Ok "Docker daemon is running"
    $dockerRunning = $true
}

# Backend setup
Write-Step "Checking backend environment"
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Warn "Backend virtualenv not found, creating it..."
    python -m venv (Join-Path $backendDir ".venv")
    Write-Ok "Created .venv"
}

Write-Step "Checking backend dependencies"
& $venvPython -c "import fastapi, uvicorn, pydantic" 2> $null
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

# Frontend setup
Write-Step "Checking frontend dependencies"
$frontendDir = Join-Path $root "frontend"
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Warn "node_modules not found, running npm install..."
    Push-Location $frontendDir
    npm install
    Pop-Location
    Write-Ok "Frontend dependencies installed"
} else {
    Write-Ok "Frontend dependencies satisfied"
}

# Infrastructure
if ($dockerRunning) {
    Write-Step "Starting Postgres + Redis (docker compose)"
    Push-Location $root
    docker compose up -d
    Pop-Location
    Write-Ok "Postgres (5432) and Redis (6379) starting"
} else {
    Write-Warn "Skipping Postgres/Redis (Docker not running)"
}

# Launch backend
Write-Step "Starting backend (FastAPI) on http://localhost:8000"
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd `"$backendDir`"; .venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
)

# Launch frontend
Write-Step "Starting frontend (Vite) on http://localhost:5173"
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd `"$frontendDir`"; npm run dev"
)

Write-Host ""
Write-Ok "OverFlowEngine is starting up in separate windows."
Write-Host "    Frontend: http://localhost:5173"
Write-Host "    Backend:  http://localhost:8000/docs"
if (-not $dockerRunning) {
    Write-Host "    Postgres/Redis were NOT started - start Docker and re-run if needed." -ForegroundColor Yellow
}
