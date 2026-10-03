<#
.SYNOPSIS
  Builds the Google Play ready artefacts for RozgarMitra.

.DESCRIPTION
  Produces a signed release Android App Bundle (the format Google Play requires)
  plus a signed universal APK for sideloading/testing, and prints the fingerprints
  you need for Firebase / Play App Signing.

.PARAMETER ApiBaseUrl
  REQUIRED. The deployed backend the app must talk to, including /api.
  A release build that points at 10.0.2.2 would only work on a local emulator,
  so this parameter is mandatory. Must be https:// for a store release.

.PARAMETER BuildName
  Optional versionName override (default: the version in pubspec.yaml).

.PARAMETER BuildNumber
  Optional versionCode override (default: the build number in pubspec.yaml).
  Play Console rejects a build number lower than the last uploaded one.

.PARAMETER ApkOnly / AabOnly
  Build just one of the two formats.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 `
    -ApiBaseUrl https://api.rozgarmitra.com/api
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ApiBaseUrl,
  [string]$BuildName = '',
  [int]$BuildNumber = 0,
  [switch]$ApkOnly,
  [switch]$AabOnly
)

$ErrorActionPreference = 'Stop'

# Any failure prints the exact line that broke instead of a bare "Path is null".
trap {
  Write-Host ''
  Write-Host ("[release] FAILED: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host $_.InvocationInfo.PositionMessage -ForegroundColor DarkGray
  exit 1
}

if (-not $PSScriptRoot) {
  throw 'Could not determine the repository layout ($PSScriptRoot is empty). Run this script with -File.'
}

if ($ApiBaseUrl -notmatch '^https?://') {
  throw "ApiBaseUrl must start with http:// or https:// (got '$ApiBaseUrl')."
}
if ($ApiBaseUrl -notmatch '^https://' -and -not $ApkOnly) {
  Write-Warning "ApiBaseUrl is not https:// - Google Play releases should use HTTPS."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileRoot = Join-Path $repoRoot 'mobile'
$androidDir = Join-Path $mobileRoot 'android'
"PSScriptRoot='$PSScriptRoot'`nrepoRoot='$repoRoot'`nmobileRoot='$mobileRoot'`nandroidDir='$androidDir'" | Out-File -FilePath (Join-Path $env:TEMP 'rel-debug.txt') -Encoding utf8

if (-not (Test-Path (Join-Path $androidDir 'key.properties'))) {
  throw @"
No android/key.properties found - the release would be signed with the debug key
and Play Console would reject it.

Create the upload key first:
  powershell -ExecutionPolicy Bypass -File scripts\make-upload-keystore.ps1
"@
}

# --- Sanity checks ---------------------------------------------------------
# Flutter resolves its project from the *process* working directory, which is not
# always what Push-Location sets when the script is launched via Start-Process.
# (SetCurrentDirectory is intentionally not used: with a null/empty argument it
# throws "Path cannot be the empty string", and Push-Location alone is enough.)
Push-Location $mobileRoot

if (-not (Test-Path (Join-Path $mobileRoot 'pubspec.yaml'))) {
  throw "No pubspec.yaml in $mobileRoot - is the repository layout intact?"
}

try {
  # Make the build hermetic. Flutter's bin/internal/update_engine_version.ps1
  # normally re-derives the engine version by shelling out to git; on a
  # memory-starved machine that PowerShell child dies with
  # "System.OutOfMemoryException" and the whole Gradle build fails with
  # "Unable to determine engine version". Pinning the version from the SDK's own
  # engine.version file skips the git subprocess entirely and is what CI does.
  if (-not $env:FLUTTER_PREBUILT_ENGINE_VERSION -and $env:FLUTTER_ROOT) {
    $engineVersionFile = Join-Path $env:FLUTTER_ROOT 'bin\internal\engine.version'
    if (Test-Path $engineVersionFile) {
      $env:FLUTTER_PREBUILT_ENGINE_VERSION = (Get-Content $engineVersionFile -Raw).Trim()
      Write-Host ("[release] pinned engine " + $env:FLUTTER_PREBUILT_ENGINE_VERSION)
    }
  }

  Write-Host '[release] flutter pub get' -ForegroundColor Cyan
  & flutter pub get | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "flutter pub get failed (exit $LASTEXITCODE)." }

  $pubspec = Get-Content (Join-Path $mobileRoot 'pubspec.yaml') -Raw
  $versionLine = ($pubspec -split "`n" | Where-Object { $_ -match '^\s*version:\s*' } | Select-Object -First 1)
  $version = ($versionLine -replace '^\s*version:\s*', '').Trim()
  $parts = $version -split '\+'
  $pubVersionName = $parts[0]
  $pubVersionCode = if ($parts.Count -gt 1) { [int]$parts[1] } else { 1 }

  if ($BuildName) { $pubVersionName = $BuildName }
  if ($BuildNumber -gt 0) { $pubVersionCode = $BuildNumber }

  Write-Host "[release] version $pubVersionName ($pubVersionCode) -> $ApiBaseUrl" -ForegroundColor Cyan

  $defineArgs = @("--dart-define=API_BASE_URL=$ApiBaseUrl")
  if ($BuildName -or $BuildNumber -gt 0) {
    $defineArgs += "--build-name=$pubVersionName"
    $defineArgs += "--build-number=$pubVersionCode"
  }

  # --- Build -------------------------------------------------------------
  if (-not $ApkOnly) {
    Write-Host '[release] flutter build appbundle --release  (Google Play upload format)' -ForegroundColor Cyan
    & flutter build appbundle --release @defineArgs | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "flutter build appbundle failed (exit $LASTEXITCODE)." }
  }

  if (-not $AabOnly) {
    Write-Host '[release] flutter build apk --release  (universal APK for sideloading)' -ForegroundColor Cyan
    & flutter build apk --release @defineArgs | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "flutter build apk failed (exit $LASTEXITCODE)." }
  }

  # --- Report ------------------------------------------------------------
  $aab = Join-Path $mobileRoot 'build\app\outputs\bundle\release\app-release.aab'
  $apk = Join-Path $mobileRoot 'build\app\outputs\flutter-apk\app-release.apk'

  Write-Host ''
  Write-Host '=== Artefacts ===' -ForegroundColor Green
  foreach ($file in @($aab, $apk)) {
    if (Test-Path $file) {
      $item = Get-Item $file
      $mb = [Math]::Round($item.Length / 1MB, 2)
      Write-Host ("  {0}  ({1} MB)" -f $item.FullName, $mb)
    }
  }

  $storeDir = Join-Path $repoRoot 'release-artifacts'
  New-Item -ItemType Directory -Force -Path $storeDir | Out-Null
  if (Test-Path $aab) { Copy-Item $aab (Join-Path $storeDir "rozgarmitra-$pubVersionName-$pubVersionCode.aab") -Force }
  if (Test-Path $apk) { Copy-Item $apk (Join-Path $storeDir "rozgarmitra-$pubVersionName-$pubVersionCode.apk") -Force }
  Write-Host ("  Copied to {0}" -f $storeDir)

  # --- Signing fingerprints (needed for Firebase + Play App Signing) ------
  $keyProps = @{}
  Get-Content (Join-Path $androidDir 'key.properties') | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' } | ForEach-Object {
    $kv = $_ -split '=', 2
    $keyProps[$kv[0].Trim()] = $kv[1].Trim()
  }
  $keystoreRel = $keyProps['storeFile']
  if (-not $keystoreRel) {
    Write-Warning "android/key.properties has no storeFile entry - cannot verify fingerprints."
    $keystore = $null
  } else {
    # storeFile is stored with forward slashes (Gradle style) - normalise for Windows.
    $keystore = Join-Path $androidDir ($keystoreRel -replace '/', '\')
  }
  $keytool = Join-Path ${env:ProgramFiles} 'Android\Android Studio\jbr\bin\keytool.exe'
  if (-not (Test-Path $keytool)) { $keytool = 'keytool' }

  if ($keystore -and (Test-Path $keystore)) {
    Write-Host ''
    Write-Host '=== Upload key fingerprints (add SHA-1/SHA-256 to Firebase) ===' -ForegroundColor Green
    & $keytool -list -v -keystore $keystore -storepass $keyProps['storePassword'] -alias $keyProps['keyAlias'] 2>&1 |
      Select-String 'SHA1:|SHA256:' | ForEach-Object { Write-Host ("  " + $_.Line.Trim()) }
  }

  Write-Host ''
  Write-Host 'Next: upload the .aab in Play Console -> Production -> Create release.' -ForegroundColor Green
  Write-Host 'See docs\RUN_AND_RELEASE.md for the full checklist.' -ForegroundColor Green
} finally {
  Pop-Location
}
