$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $root 'public/kinetix-icon.png'
$buildDirectory = Join-Path $root 'build'
$iconPath = Join-Path $buildDirectory 'icon.ico'

if (-not (Test-Path $sourcePath)) {
  throw "Kinetix icon source not found: $sourcePath"
}

New-Item -ItemType Directory -Path $buildDirectory -Force | Out-Null
$source = [System.Drawing.Image]::FromFile($sourcePath)
$entries = @()

try {
  foreach ($size in @(256, 128, 64, 48, 32, 16)) {
    $bitmap = New-Object System.Drawing.Bitmap(
      $size,
      $size,
      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $memory = New-Object System.IO.MemoryStream

    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
      $entries += [PSCustomObject]@{
        Size = $size
        Bytes = $memory.ToArray()
      }
    }
    finally {
      $memory.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally {
  $source.Dispose()
}

$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)

try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$entries.Count)

  $offset = 6 + (16 * $entries.Count)
  foreach ($entry in $entries) {
    $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]$dimension)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$entry.Bytes.Length)
    $writer.Write([UInt32]$offset)
    $offset += $entry.Bytes.Length
  }

  foreach ($entry in $entries) {
    $writer.Write([Byte[]]$entry.Bytes)
  }

  [System.IO.File]::WriteAllBytes($iconPath, $icoStream.ToArray())
}
finally {
  $writer.Dispose()
  $icoStream.Dispose()
}

Write-Host "Generated Kinetix Studio multi-resolution icon: $iconPath"
