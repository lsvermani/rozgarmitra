<#
.SYNOPSIS
  Generates all RozgarMitra launcher/store artwork from one source image.

.DESCRIPTION
  Source of truth: mobile/assets/images/logo.png (the RozgarMitra wordmark).
  The magnifier glyph is auto-cropped from the top of that image (no hard-coded
  pixel coordinates) and re-composed into:

    android/app/src/main/res/mipmap-*/ic_launcher.png            legacy square icon
    android/app/src/main/res/mipmap-*/ic_launcher_round.png      legacy round icon
    android/app/src/main/res/mipmap-*/ic_launcher_foreground.png adaptive foreground
    android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml  adaptive icon (API 26+)
    android/app/src/main/res/values/ic_launcher_background.xml   adaptive background colour
    web/icons/Icon-{192,512}.png, Icon-maskable-{192,512}.png    PWA icons
    web/favicon.png
    play-store/icon-512.png                    Play Console app icon (opaque, 512x512)
    play-store/feature-graphic-1024x500.png    Play Console feature graphic

  Requires the Windows .NET System.Drawing assembly (built in - no extra install).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\make-android-icons.ps1
#>
param(
  [string]$Source = '',
  [string]$MobileRoot = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $MobileRoot) { $MobileRoot = Join-Path $repoRoot 'mobile' }
if (-not $Source) { $Source = Join-Path $MobileRoot 'assets\images\logo.png' }
if (-not (Test-Path $Source)) { throw "Source image not found: $Source" }

$resDir = Join-Path $MobileRoot 'android\app\src\main\res'

# Legacy launcher icon sizes per density (dp 48).
$legacySizes = @{
  'mipmap-mdpi'    = 48
  'mipmap-hdpi'    = 72
  'mipmap-xhdpi'   = 96
  'mipmap-xxhdpi'  = 144
  'mipmap-xxxhdpi' = 192
}
# Adaptive foreground is 108dp; only the middle 72dp is guaranteed visible.
$foregroundSizes = @{
  'mipmap-mdpi'    = 108
  'mipmap-hdpi'    = 162
  'mipmap-xhdpi'   = 216
  'mipmap-xxhdpi'  = 324
  'mipmap-xxxhdpi' = 432
}

Write-Host "[icons] source: $Source" -ForegroundColor Cyan

$sourceImage = [System.Drawing.Image]::FromFile($Source)

# ---------------------------------------------------------------------------
# Crop the magnifier glyph out of the wordmark.
# ---------------------------------------------------------------------------
# The artwork has the magnifier on top and the "RozgarMitra" lettering below,
# but the handle dips so close to the lettering that there is no clean
# horizontal whitespace band between them. There IS a reliable horizontal cue
# though: the lettering starts at the far left (x ~ 4% of the width) while the
# magnifier never extends left of ~30% of the width. So:
#   1. skip the empty top margin to the first row with ink  -> glyphTop
#   2. keep going until a row shows ink in the lettering zone -> glyphBottom
#   3. take the x-extent over exactly those rows            -> left/right edges
# No hard-coded pixel coordinates beyond the ratios below, so this keeps working
# if the artwork is re-exported at a different size.
$full = New-Object System.Drawing.Bitmap($sourceImage)
$imgWidth = $full.Width
$imgHeight = $full.Height
$stride = 0
$pixels = $null
$rectAll = New-Object System.Drawing.Rectangle(0, 0, $full.Width, $full.Height)
$locked = $full.LockBits($rectAll, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $stride = $locked.Stride
  $pixels = New-Object byte[] ($stride * $full.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($locked.Scan0, $pixels, 0, $pixels.Length)
} finally {
  $full.UnlockBits($locked)
}
$full.Dispose()

$inkThreshold = 245                                   # anything darker than this is artwork
$letterZoneX = [int]($imgWidth * 0.15)               # left edge of the wordmark

# Pass 1: per-row ink extents + ink mass.
$rowMinX = New-Object int[] $imgHeight
$rowMaxX = New-Object int[] $imgHeight
$rowInk = New-Object int[] $imgHeight
for ($y = 0; $y -lt $imgHeight; $y++) { $rowMinX[$y] = $imgWidth; $rowMaxX[$y] = -1 }

for ($y = 0; $y -lt $imgHeight; $y++) {
  $rowStart = $y * $stride
  for ($x = 0; $x -lt $imgWidth; $x++) {
    $i = $rowStart + ($x * 4)
    if ($pixels[$i] -lt $inkThreshold -or $pixels[$i + 1] -lt $inkThreshold -or $pixels[$i + 2] -lt $inkThreshold) {
      if ($x -lt $rowMinX[$y]) { $rowMinX[$y] = $x }
      if ($x -gt $rowMaxX[$y]) { $rowMaxX[$y] = $x }
      $rowInk[$y]++
    }
  }
}

# Pass 2: locate the glyph rows.
$glyphTopRow = -1
$glyphBottomRow = -1
for ($y = 0; $y -lt $imgHeight; $y++) {
  if ($rowMaxX[$y] -lt 0) { continue }              # empty row
  if ($glyphTopRow -lt 0) { $glyphTopRow = $y }
  if ($rowMinX[$y] -lt $letterZoneX) { break }       # lettering has started
  $glyphBottomRow = $y
}
if ($glyphTopRow -lt 0 -or $glyphBottomRow -lt 0) {
  throw 'Could not isolate the magnifier glyph in the source image.'
}

$minX = $imgWidth; $maxX = -1
for ($y = $glyphTopRow; $y -le $glyphBottomRow; $y++) {
  if ($rowMaxX[$y] -lt 0) { continue }
  if ($rowMinX[$y] -lt $minX) { $minX = $rowMinX[$y] }
  if ($rowMaxX[$y] -gt $maxX) { $maxX = $rowMaxX[$y] }
}
$minY = $glyphTopRow
$maxY = $glyphBottomRow

# Trim thin ink tails: the apex of a tall letter (e.g. the "M" in Mitra) can
# reach into the glyph's rows with only a sliver of pixels. The magnifier's
# strokes are thick, so require a minimum ink mass per row and walk up until we
# find it. Keeps stray letter specks out of the icon.
$widthGuess = $maxX - $minX + 1
$minRowInk = [Math]::Max(8, [int]($widthGuess * 0.04))
for ($y = $maxY; $y -gt $minY; $y--) {
  if ($rowInk[$y] -ge $minRowInk) { $maxY = $y; break }
}

$glyphW = $maxX - $minX + 1
$glyphH = $maxY - $minY + 1
$side = [Math]::Max($glyphW, $glyphH)
# Square the box so the glyph never distorts when scaled. Horizontally we centre
# on the glyph; vertically we anchor to the glyph's BOTTOM edge so the square
# cannot spill down into the first rows of the lettering.
$cx = ($minX + $maxX) / 2
$cropX = [int][Math]::Round($cx - ($side / 2))
$cropY = [int]($maxY - $side + 1)
$cropX = [Math]::Max(0, [Math]::Min($cropX, $sourceImage.Width - $side))
$cropY = [Math]::Max(0, [Math]::Min($cropY, $sourceImage.Height - $side))

$glyph = New-Object System.Drawing.Bitmap($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gGlyph = [System.Drawing.Graphics]::FromImage($glyph)
$gGlyph.SmoothingMode = 'AntiAlias'
$gGlyph.InterpolationMode = 'HighQualityBicubic'
$gGlyph.DrawImage($sourceImage,
  (New-Object System.Drawing.Rectangle(0, 0, $side, $side)),
  $cropX, $cropY, $side, $side,
  [System.Drawing.GraphicsUnit]::Pixel)
$gGlyph.Dispose()

Write-Host "[icons] glyph crop: $side x $side  (x=$cropX y=$cropY)" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Composition helpers
# ---------------------------------------------------------------------------
function New-IconBitmap {
  param(
    [System.Drawing.Image]$GlyphSource,
    [int]$Size,
    [System.Drawing.Color]$Background,
    [double]$GlyphScale,
    [ValidateSet('square', 'rounded', 'circle', 'none')][string]$Shape = 'rounded'
  )

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($Shape -ne 'none' -and $Background.A -gt 0) {
    $brush = New-Object System.Drawing.SolidBrush($Background)
    switch ($Shape) {
      'square' { $g.FillRectangle($brush, 0, 0, $Size, $Size) }
      'circle' { $g.FillEllipse($brush, 0, 0, $Size, $Size) }
      'rounded' {
        $r = [int]($Size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
        $path.AddArc($Size - (2 * $r), 0, 2 * $r, 2 * $r, 270, 90)
        $path.AddArc($Size - (2 * $r), $Size - (2 * $r), 2 * $r, 2 * $r, 0, 90)
        $path.AddArc(0, $Size - (2 * $r), 2 * $r, 2 * $r, 90, 90)
        $path.CloseFigure()
        $g.FillPath($brush, $path)
        $path.Dispose()
      }
    }
    $brush.Dispose()
  }

  $glyphSize = [int][Math]::Round($Size * $GlyphScale)
  $offset = [int][Math]::Round(($Size - $glyphSize) / 2)
  $g.DrawImage(
    $GlyphSource,
    (New-Object System.Drawing.Rectangle($offset, $offset, $glyphSize, $glyphSize)),
    0, 0, $GlyphSource.Width, $GlyphSource.Height,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $g.Dispose()
  return $bmp
}

function Save-Png {
  param([System.Drawing.Image]$Image, [string]$Path)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Image.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)

# ---------------------------------------------------------------------------
# Android launcher icons
# ---------------------------------------------------------------------------
foreach ($density in $legacySizes.Keys) {
  $dir = Join-Path $resDir $density
  $legacy = $legacySizes[$density]
  $fgsize = $foregroundSizes[$density]

  $img = New-IconBitmap -GlyphSource $glyph -Size $legacy -Background $white -GlyphScale 0.74 -Shape rounded
  Save-Png -Image $img -Path (Join-Path $dir 'ic_launcher.png')
  $img.Dispose()

  $img = New-IconBitmap -GlyphSource $glyph -Size $legacy -Background $white -GlyphScale 0.74 -Shape circle
  Save-Png -Image $img -Path (Join-Path $dir 'ic_launcher_round.png')
  $img.Dispose()

  # Adaptive foreground: transparent, glyph kept inside the 72dp safe zone.
  $img = New-IconBitmap -GlyphSource $glyph -Size $fgsize -Background $clear -GlyphScale 0.56 -Shape none
  Save-Png -Image $img -Path (Join-Path $dir 'ic_launcher_foreground.png')
  $img.Dispose()

  Write-Host "  $density : ic_launcher ${legacy}px, ic_launcher_round ${legacy}px, foreground ${fgsize}px" -ForegroundColor DarkGray
}

# Adaptive icon descriptors (API 26+).
$anydpi = Join-Path $resDir 'mipmap-anydpi-v26'
New-Item -ItemType Directory -Force -Path $anydpi | Out-Null
$adaptiveXml = @(
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- RozgarMitra adaptive launcher icon (API 26+). Generated by scripts/make-android-icons.ps1. -->',
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
  '    <background android:drawable="@color/ic_launcher_background" />',
  '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />',
  '</adaptive-icon>',
  ''
)
Set-Content -Path (Join-Path $anydpi 'ic_launcher.xml') -Value $adaptiveXml -Encoding UTF8
Set-Content -Path (Join-Path $anydpi 'ic_launcher_round.xml') -Value $adaptiveXml -Encoding UTF8

$valuesDir = Join-Path $resDir 'values'
New-Item -ItemType Directory -Force -Path $valuesDir | Out-Null
$colorXml = @(
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources>',
  '    <!-- Adaptive launcher icon background (brand surface white). -->',
  '    <color name="ic_launcher_background">#FFFFFFFF</color>',
  '</resources>',
  ''
)
Set-Content -Path (Join-Path $valuesDir 'ic_launcher_background.xml') -Value $colorXml -Encoding UTF8

Write-Host '[icons] Android launcher icons written' -ForegroundColor Green


# ---------------------------------------------------------------------------
# Web / PWA icons (used by `flutter run -d chrome` and `flutter build web`)
# ---------------------------------------------------------------------------
$webIcons = Join-Path $MobileRoot 'web\icons'
$webSizes = @{ 'Icon-192.png' = 192; 'Icon-512.png' = 512; 'Icon-maskable-192.png' = 192; 'Icon-maskable-512.png' = 512 }
foreach ($name in $webSizes.Keys) {
  $size = $webSizes[$name]
  # Maskable icons need ~20% padding so launchers can crop to any shape.
  $scale = if ($name -like '*maskable*') { 0.55 } else { 0.74 }
  $img = New-IconBitmap -GlyphSource $glyph -Size $size -Background $white -GlyphScale $scale -Shape square
  Save-Png -Image $img -Path (Join-Path $webIcons $name)
  $img.Dispose()
}
$fav = New-IconBitmap -GlyphSource $glyph -Size 64 -Background $white -GlyphScale 0.76 -Shape rounded
Save-Png -Image $fav -Path (Join-Path $MobileRoot 'web\favicon.png')
$fav.Dispose()
Write-Host '[icons] web/PWA icons written' -ForegroundColor Green

# ---------------------------------------------------------------------------
# Google Play Console listing assets
# ---------------------------------------------------------------------------
$playDir = Join-Path $MobileRoot 'play-store'
New-Item -ItemType Directory -Force -Path $playDir | Out-Null

# App icon: must be a 512x512 opaque (no transparency) 32-bit PNG.
$playIcon = New-IconBitmap -GlyphSource $glyph -Size 512 -Background $white -GlyphScale 0.74 -Shape square
Save-Png -Image $playIcon -Path (Join-Path $playDir 'icon-512.png')
$playIcon.Dispose()

# Feature graphic: 1024x500, opaque. Brand teal field + white card + wordmark.
$fgW = 1024; $fgH = 500
$teal = [System.Drawing.Color]::FromArgb(255, 15, 118, 110)
$feature = New-Object System.Drawing.Bitmap($fgW, $fgH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gFeature = [System.Drawing.Graphics]::FromImage($feature)
$gFeature.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gFeature.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gFeature.FillRectangle((New-Object System.Drawing.SolidBrush($teal)), 0, 0, $fgW, $fgH)

# White rounded card inset from the edges.
$pad = 44
$cardPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$radius = 32
$cardPath.AddArc($pad, $pad, 2 * $radius, 2 * $radius, 180, 90)
$cardPath.AddArc($fgW - $pad - (2 * $radius), $pad, 2 * $radius, 2 * $radius, 270, 90)
$cardPath.AddArc($fgW - $pad - (2 * $radius), $fgH - $pad - (2 * $radius), 2 * $radius, 2 * $radius, 0, 90)
$cardPath.AddArc($pad, $fgH - $pad - (2 * $radius), 2 * $radius, 2 * $radius, 90, 90)
$cardPath.CloseFigure()
$gFeature.FillPath((New-Object System.Drawing.SolidBrush($white)), $cardPath)
$cardPath.Dispose()

# Wordmark centred inside the card, preserving aspect ratio.
$logoW = $sourceImage.Width
$logoH = $sourceImage.Height
$maxW = ($fgW - (2 * $pad)) * 0.90
$maxH = ($fgH - (2 * $pad)) * 0.90
$scale = [Math]::Min($maxW / $logoW, $maxH / $logoH)
$drawW = [int][Math]::Round($logoW * $scale)
$drawH = [int][Math]::Round($logoH * $scale)
$drawX = [int][Math]::Round(($fgW - $drawW) / 2)
$drawY = [int][Math]::Round(($fgH - $drawH) / 2)
$gFeature.DrawImage(
  $sourceImage,
  (New-Object System.Drawing.Rectangle($drawX, $drawY, $drawW, $drawH)),
  0, 0, $logoW, $logoH,
  [System.Drawing.GraphicsUnit]::Pixel
)
$gFeature.Dispose()
Save-Png -Image $feature -Path (Join-Path $playDir 'feature-graphic-1024x500.png')
$feature.Dispose()
Write-Host '[icons] Play Store assets written to mobile\play-store' -ForegroundColor Green

$sourceImage.Dispose()
$glyph.Dispose()
Write-Host '[icons] done.' -ForegroundColor Green

