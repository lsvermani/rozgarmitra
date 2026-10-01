<#
.SYNOPSIS
  Stops the local RozgarMitra dev stack started by scripts\dev-up.ps1.

.DESCRIPTION
  Stops, in order:
    - the Flutter tooling (dart/flutter processes: `flutter run` sessions)
    - whatever is listening on the API port (5000)
    - whatever is listening on the admin port (5173)
  MongoDB is left running on purpose (it is a Windows service and stopping it
  would affect other projects).

.PARAMETER ApiPort
  Backend port. Default 5000.

.PARAMETER AdminPort
  Admin dashboard port. Default 5173.
#>
param(
  [int]$ApiPort = 5000,
  [int]$AdminPort = 5173
)

function Stop-Port {
  param([int]$Port, [string]$Label)
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Host "  $Label (:$Port) - not running" -ForegroundColor DarkGray
    return
  }
  foreach ($pid_ in ($conns.OwningProcess | Sort-Object -Unique)) {
    $proc = Get-Process -Id $pid_ -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "  stopping $Label (: $Port, $($proc.ProcessName) pid $pid_)" -ForegroundColor Yellow
      Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host 'Stopping RozgarMitra dev stack...' -ForegroundColor Cyan

foreach ($name in 'dart', 'flutter') {
  $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
  if ($procs) {
    Write-Host "  stopping $($procs.Count) $name process(es)" -ForegroundColor Yellow
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
  }
}

Stop-Port -Port $ApiPort -Label 'API'
Stop-Port -Port $AdminPort -Label 'Admin'

Write-Host 'Done. MongoDB is still running (Windows service).' -ForegroundColor Green
