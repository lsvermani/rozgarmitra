<#
.SYNOPSIS
  Makes sure a MongoDB server is listening for the Rozgarmitra backend.

.DESCRIPTION
  Resolution order:
    1. Nothing to do if 127.0.0.1:27017 already accepts connections.
    2. Start the Windows service named "MongoDB" (needs an elevated shell).
    3. Fall back to launching the installed mongod.exe with a repo-local dbPath.

.PARAMETER Port
  Port to check/use. Default 27017.

.PARAMETER DbPath
  Data directory for the fallback mongod.exe launch.
  Default: <repo>\.mongo-data

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\start-mongodb.ps1
#>
param(
  [int]$Port = 27017,
  [string]$DbPath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-PortOpen {
  param([int]$p)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect('127.0.0.1', $p, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(1200, $false)
    if (-not $ok) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

Write-Host "[mongo] Checking 127.0.0.1:$Port ..." -ForegroundColor Cyan

if (Test-PortOpen -p $Port) {
  Write-Host "[mongo] Already running - nothing to do." -ForegroundColor Green
  exit 0
}

# 1) Preferred: the installer-created Windows service.
$service = Get-Service -Name 'MongoDB' -ErrorAction SilentlyContinue
if ($service) {
  Write-Host "[mongo] Service 'MongoDB' is $($service.Status). Starting it..." -ForegroundColor Yellow
  try {
    Start-Service -Name 'MongoDB' -ErrorAction Stop
    Start-Sleep -Seconds 3
    if (Test-PortOpen -p $Port) {
      Write-Host "[mongo] Service started." -ForegroundColor Green
      exit 0
    }
  } catch {
    Write-Warning "[mongo] Could not start the service ($($_.Exception.Message))."
    Write-Warning "[mongo] Re-run this script from an elevated (Administrator) PowerShell to start it."
  }
}

# 2) Fallback: run mongod.exe directly against a repo-local data directory.
$mongod = Get-ChildItem 'C:\Program Files\MongoDB\Server\*\bin\mongod.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1

if (-not $mongod) {
  Write-Error @"
[mongo] MongoDB is not installed on this machine.
        Install MongoDB Community Server: https://www.mongodb.com/try/download/community
        ...or point the backend at a cloud cluster instead:
          1) create a free cluster at https://cloud.mongodb.com
          2) copy the connection string into backend\.env as MONGO_URI
          3) npm run db:check   (from the backend folder)
"@
  exit 1
}

if (-not $DbPath) { $DbPath = Join-Path $repoRoot '.mongo-data' }
New-Item -ItemType Directory -Force -Path $DbPath | Out-Null
$logPath = Join-Path $repoRoot '.mongo-data\mongod.log'

Write-Host "[mongo] Starting $($mongod.FullName)" -ForegroundColor Yellow
Write-Host "[mongo]   dbPath = $DbPath"
Write-Host "[mongo]   log    = $logPath"

Start-Process -FilePath $mongod.FullName `
  -ArgumentList @('--dbpath', $DbPath, '--port', $Port, '--bind_ip', '127.0.0.1', '--logpath', $logPath) `
  -WindowStyle Hidden

for ($i = 1; $i -le 15; $i++) {
  Start-Sleep -Seconds 1
  if (Test-PortOpen -p $Port) {
    Write-Host "[mongo] mongod is up on 127.0.0.1:$Port (pid check: Get-Process mongod)" -ForegroundColor Green
    exit 0
  }
}

Write-Error "[mongo] mongod did not begin listening on port $Port. See $logPath for details."
exit 1
