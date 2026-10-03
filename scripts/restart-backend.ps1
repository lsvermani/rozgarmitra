<#
.SYNOPSIS
  Restarts ONLY the backend API (never Vite/MongoDB) and waits until healthy.

.DESCRIPTION
  The global rate limiter (backend/src/app.js) allows 200 requests per 15
  minutes across all /api routes and keeps counters in memory. Restarting the
  API process is the only way to reset that budget without waiting out the
  window, so test suites can be run one at a time without 429 contamination.

  Deliberately does NOT touch port 5173 - running scripts\stop-all.ps1 would
  take the admin dashboard down with it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restart-backend.ps1
#>
[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repoRoot 'backend'
$logs = Join-Path $repoRoot 'logs'

# Kill only whatever is listening on the API port.
$conn = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conn) {
  $procId = $c.OwningProcess
  if ($procId -and $procId -ne $PID) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2

# Lift the admin-login lockout ceiling so auth suites cannot lock the account.
$env:ADMIN_LOGIN_MAX_ATTEMPTS = '500'

Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
  -WorkingDirectory $backend `
  -RedirectStandardOutput (Join-Path $logs 'backend.out.log') `
  -RedirectStandardError (Join-Path $logs 'backend.err.log') `
  -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-RestMethod 'http://localhost:5000/api/health' -TimeoutSec 5
    if ($r.database.connected) {
      if (-not $Quiet) { Write-Host 'backend up, rate-limit budget reset' -ForegroundColor Green }
      exit 0
    }
  } catch { }
  Start-Sleep -Seconds 2
}
Write-Error 'Backend did not become healthy in time - see logs\backend.err.log'
exit 1