<#
.SYNOPSIS
  Starts the whole RozgarMitra stack for local development.

.DESCRIPTION
  One command, in order:
    1. make sure MongoDB is listening (scripts\start-mongodb.ps1)
    2. verify the backend's MONGO_URI and collection indexes (npm run db:setup)
    3. start the API            -> http://localhost:5000
    4. start the admin dashboard-> http://localhost:5173
    5. optionally start the Flutter app in Chrome and/or on an Android device

  Each server writes to rozgarmitra\logs\*.log and can be stopped with
  scripts\stop-all.ps1.

.PARAMETER SkipSeed
  Do not run the seeder even if the database looks empty.

.PARAMETER WithFlutterWeb
  Also launch `flutter run -d chrome` (mobile app in the browser).

.PARAMETER WithAndroid
  Also launch the app on the connected device/emulator.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -WithFlutterWeb
#>
[CmdletBinding()]
param(
  [switch]$SkipSeed,
  [switch]$WithFlutterWeb,
  [switch]$WithAndroid
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Wait-Http {
  param([string]$Url, [int]$TimeoutSeconds = 60)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

# 1) MongoDB ---------------------------------------------------------------
Write-Host ''
Write-Host '[1/5] MongoDB' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'start-mongodb.ps1')

# 2) Database connectivity + indexes --------------------------------------
Write-Host ''
Write-Host '[2/5] Database check' -ForegroundColor Cyan
Push-Location (Join-Path $repoRoot 'backend')
try {
  & node scripts/mongo-connect.js --indexes
  $dbExit = $LASTEXITCODE
} finally {
  Pop-Location
}
if ($dbExit -ne 0) {
  throw 'Could not reach MongoDB. Fix MONGO_URI in backend\.env and re-run.'
}

if (-not $SkipSeed) {
  Push-Location (Join-Path $repoRoot 'backend')
  try {
    $seedCheck = & node scripts/mongo-connect.js --json | ConvertFrom-Json
    $seeded = ($seedCheck.collections | Where-Object { $_.name -eq 'jobs' -and $_.documents -gt 0 }).Count -gt 0
    if (-not $seeded) {
      Write-Host '[2/5] Database looks empty - running `npm run seed`' -ForegroundColor Yellow
      & node src/seed/seed.js | Out-Host
    } else {
      Write-Host '[2/5] Demo data already present - skipping seed (use backend\npm run seed to refresh)' -ForegroundColor DarkGray
    }
  } finally {
    Pop-Location
  }
}

# 3) Backend API ----------------------------------------------------------
Write-Host ''
Write-Host '[3/5] Starting API on http://localhost:5000' -ForegroundColor Cyan
Start-Process -FilePath 'node' -ArgumentList 'src/server.js' `
  -WorkingDirectory (Join-Path $repoRoot 'backend') `
  -RedirectStandardOutput (Join-Path $logsDir 'backend.out.log') `
  -RedirectStandardError (Join-Path $logsDir 'backend.err.log') `
  -WindowStyle Hidden

if (Wait-Http -Url 'http://localhost:5000/api/health' -TimeoutSeconds 60) {
  Write-Host '      API is up (GET /api/health OK)' -ForegroundColor Green
} else {
  Write-Warning '      API did not answer in time - check logs\backend.err.log'
}

# 4) Admin dashboard ------------------------------------------------------
Write-Host ''
Write-Host '[4/5] Starting admin dashboard on http://localhost:5173' -ForegroundColor Cyan
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' `
  -WorkingDirectory (Join-Path $repoRoot 'admin') `
  -RedirectStandardOutput (Join-Path $logsDir 'admin.out.log') `
  -RedirectStandardError (Join-Path $logsDir 'admin.err.log') `
  -WindowStyle Hidden

if (Wait-Http -Url 'http://localhost:5173/' -TimeoutSeconds 90) {
  Write-Host '      Admin is up - opening in your browser' -ForegroundColor Green
  Start-Process 'http://localhost:5173/'
} else {
  Write-Warning '      Admin did not answer in time - check logs\admin.err.log'
}

# 5) Mobile app -----------------------------------------------------------
Write-Host ''
Write-Host '[5/5] Mobile app' -ForegroundColor Cyan
if ($WithFlutterWeb) {
  Write-Host '      launching Flutter web (Chrome) with API_BASE_URL=http://localhost:5000/api'
  Start-Process -FilePath 'flutter.bat' `
    -ArgumentList 'run', '-d', 'chrome', '--dart-define=API_BASE_URL=http://localhost:5000/api' `
    -WorkingDirectory (Join-Path $repoRoot 'mobile') `
    -RedirectStandardOutput (Join-Path $logsDir 'flutter-web.out.log') `
    -RedirectStandardError (Join-Path $logsDir 'flutter-web.err.log') `
    -WindowStyle Hidden
} else {
  Write-Host '      skipped (pass -WithFlutterWeb to run it in Chrome)' -ForegroundColor DarkGray
}

if ($WithAndroid) {
  Write-Host '      launching on the connected Android device (API_BASE_URL=http://10.0.2.2:5000/api)'
  Start-Process -FilePath 'flutter.bat' `
    -ArgumentList 'run', '-d', 'emulator-5554', '--dart-define=API_BASE_URL=http://10.0.2.2:5000/api' `
    -WorkingDirectory (Join-Path $repoRoot 'mobile') `
    -RedirectStandardOutput (Join-Path $logsDir 'flutter-android.out.log') `
    -RedirectStandardError (Join-Path $logsDir 'flutter-android.err.log') `
    -WindowStyle Hidden
} else {
  Write-Host '      skipped (pass -WithAndroid to run it on a device/emulator)' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '=== RozgarMitra dev stack ===' -ForegroundColor Green
Write-Host '  API        : http://localhost:5000/api/health'
Write-Host '  Admin      : http://localhost:5173   (admin login 9999999999 / OTP 123456)'
Write-Host '  Worker     : 9000000010 / OTP 123456'
Write-Host '  Creator    : 8000000010 / OTP 123456'
Write-Host "  Logs       : $logsDir"
Write-Host '  Stop all   : powershell -File scripts\stop-all.ps1'
Write-Host ''
