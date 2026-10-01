<#
.SYNOPSIS
  Creates the Android upload keystore + android/key.properties for RozgarMitra.

.DESCRIPTION
  Google Play requires every release to be signed with the same key forever.
  This script creates an RSA-2048 JKS keystore and writes the credentials into
  android/key.properties (both are gitignored).

  Run it ONCE per project. Re-running without -Force will refuse to touch an
  existing keystore, because replacing it would lock you out of publishing
  updates to the app that is already live.

.PARAMETER Alias
  Key alias inside the keystore. Default: upload

.PARAMETER Password
  Store/key password (must match for JKS). Generated when omitted.

.PARAMETER Force
  Overwrite an existing keystore + key.properties.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\make-upload-keystore.ps1
#>
[CmdletBinding()]
param(
  [string]$Alias = 'upload',
  [string]$Password = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $repoRoot 'mobile\android'
$keystoreRel = 'keystore/rozgarmitra-upload.jks'
$keystorePath = Join-Path $androidDir $keystoreRel
$keyPropsPath = Join-Path $androidDir 'key.properties'

if ((Test-Path $keystorePath) -and -not $Force) {
  Write-Host "[keystore] $keystorePath already exists - keeping it." -ForegroundColor Yellow
  Write-Host '[keystore] Use -Force only if you really want to replace the upload key.' -ForegroundColor Yellow
  exit 0
}

# keytool ships with the JDK bundled in Android Studio; fall back to PATH.
$keytool = Join-Path ${env:ProgramFiles} 'Android\Android Studio\jbr\bin\keytool.exe'
if (-not (Test-Path $keytool)) {
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw 'keytool not found. Install Android Studio (or a JDK 17+) and retry.'
  }
  $keytool = $cmd.Source
}

if (-not $Password) {
  # Alphanumeric only: safe inside a .properties file and easy to copy/paste.
  $Password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $keystorePath) | Out-Null

Write-Host "[keystore] generating $keystorePath" -ForegroundColor Cyan
& $keytool -genkeypair -v `
  -keystore $keystorePath `
  -storetype JKS `
  -storepass $Password `
  -keypass $Password `
  -alias $Alias `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -dname 'CN=RozgarMitra, OU=Mobile, O=RozgarMitra, L=Delhi, ST=Delhi, C=IN' 2>&1 |
  Select-String 'Storing' | Out-Host

$lines = @(
  '# RozgarMitra - Android upload/signing key. DO NOT COMMIT (gitignored).',
  '# Paths are relative to the android/ folder.',
  '# LOSING THIS KEYSTORE + THIS FILE MEANS NO MORE UPDATES CAN BE PUBLISHED.',
  '# Back both of them up somewhere safe (password manager / private storage).',
  "storePassword=$Password",
  "keyPassword=$Password",
  "keyAlias=$Alias",
  "storeFile=$keystoreRel",
  'storeType=JKS'
)
$lines | Set-Content -Path $keyPropsPath -Encoding UTF8

Write-Host ''
Write-Host '=== Upload key created ===' -ForegroundColor Green
Write-Host "  keystore  : $keystorePath"
Write-Host "  properties: $keyPropsPath"
Write-Host "  alias     : $Alias"
Write-Host "  password  : $Password"
Write-Host ''
Write-Host '  >>> SAVE THIS PASSWORD NOW. It is only stored in key.properties. <<<' -ForegroundColor Yellow
Write-Host ''
& $keytool -list -v -keystore $keystorePath -storepass $Password -alias $Alias 2>&1 |
  Select-String 'SHA1:|SHA256:|Valid from' | ForEach-Object { Write-Host ('  ' + $_.Line.Trim()) }
Write-Host ''
Write-Host 'Next: powershell -File scripts\build-release.ps1 -ApiBaseUrl https://your-api.example.com/api' -ForegroundColor Green
