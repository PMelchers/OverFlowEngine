<#
  Stops OverFlowEngine's backend and frontend dev servers by freeing
  ports 8000 and 5173, killing each process's full tree so reload/watcher
  child processes don't linger and re-hold the port next time you start.
#>

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }

function Stop-ProcessOnPort($port, $label) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Ok "$label (port $port) is not running"
        return
    }
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Warn "Stopping $label - '$($proc.ProcessName)' (PID $procId)"
            taskkill /PID $procId /T /F *> $null
        }
    }
    Write-Ok "$label (port $port) stopped"
}

Write-Step "Stopping OverFlowEngine dev servers"
Stop-ProcessOnPort 8000 "Backend"
Stop-ProcessOnPort 5173 "Frontend"

Write-Host ""
Write-Host "Postgres/Redis are still running in Docker. Run 'docker compose down' if you want to stop those too."
