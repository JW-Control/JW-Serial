Add-Type -AssemblyName System.Drawing

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $RepoRoot "build"
$IconPngDir = Join-Path $BuildDir "icons"
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path $IconPngDir | Out-Null

function New-RoundedRectPath {
  param(
    [System.Drawing.RectangleF] $Rect,
    [float] $Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Scale-Point {
  param([double[]] $Point, [double] $Scale)
  return @([float]($Point[0] * $Scale), [float]($Point[1] * $Scale))
}

function Draw-Series {
  param(
    [System.Drawing.Graphics] $Graphics,
    [double] $Scale,
    [object[]] $Points,
    [System.Drawing.Color] $Color
  )

  $pen = New-Object System.Drawing.Pen $Color, ([float](28 * $Scale))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  for ($i = 0; $i -lt $Points.Length - 1; $i++) {
    $a = Scale-Point $Points[$i] $Scale
    $b = Scale-Point $Points[$i + 1] $Scale
    $Graphics.DrawLine($pen, $a[0], $a[1], $b[0], $b[1])
  }

  $brush = New-Object System.Drawing.SolidBrush $Color
  for ($i = 1; $i -lt $Points.Length; $i++) {
    $p = Scale-Point $Points[$i] $Scale
    $r = [float](38 * $Scale)
    $Graphics.FillEllipse($brush, $p[0] - $r, $p[1] - $r, $r * 2, $r * 2)
  }

  $pen.Dispose()
  $brush.Dispose()
}

function New-IconPng {
  param(
    [int] $Size,
    [string] $Path
  )

  $scale = $Size / 1024.0
  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $rect = New-Object System.Drawing.RectangleF ([float](28 * $scale)), ([float](28 * $scale)), ([float](968 * $scale)), ([float](968 * $scale))
  $shape = New-RoundedRectPath $rect ([float](190 * $scale))

  $shadow = $shape.Clone()
  $matrix = New-Object System.Drawing.Drawing2D.Matrix
  $matrix.Translate(0, [float](12 * $scale))
  $shadow.Transform($matrix)
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, 0, 28, 65))
  $g.FillPath($shadowBrush, $shadow)

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(255, 242, 247, 252),
    [float]45
  )
  $g.FillPath($bgBrush, $shape)

  $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 210, 220, 234)), ([float](3 * $scale))
  $g.DrawPath($borderPen, $shape)

  $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(78, 210, 218, 226)), ([float](8 * $scale))
  $gridPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $gridPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  foreach ($x in @(330, 510, 690, 850)) {
    $g.DrawLine($gridPen, [float]($x * $scale), [float](190 * $scale), [float]($x * $scale), [float](805 * $scale))
  }
  foreach ($y in @(300, 470, 650)) {
    $g.DrawLine($gridPen, [float](185 * $scale), [float]($y * $scale), [float](900 * $scale), [float]($y * $scale))
  }

  $axisPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 7, 34, 70)), ([float](30 * $scale))
  $axisPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $axisPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($axisPen, [float](155 * $scale), [float](175 * $scale), [float](155 * $scale), [float](830 * $scale))
  $g.DrawLine($axisPen, [float](155 * $scale), [float](830 * $scale), [float](900 * $scale), [float](830 * $scale))

  $cyan = [System.Drawing.Color]::FromArgb(255, 0, 173, 238)
  $green = [System.Drawing.Color]::FromArgb(255, 116, 210, 0)
  Draw-Series $g $scale @(@(205, 640), @(330, 545), @(510, 340), @(670, 495), @(845, 250)) $cyan
  Draw-Series $g $scale @(@(205, 760), @(330, 725), @(510, 610), @(670, 710), @(845, 525)) $green

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $axisPen.Dispose()
  $gridPen.Dispose()
  $borderPen.Dispose()
  $bgBrush.Dispose()
  $shadowBrush.Dispose()
  $matrix.Dispose()
  $shadow.Dispose()
  $shape.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

function Write-UInt16LE {
  param([System.IO.Stream] $Stream, [int] $Value)
  $bytes = [BitConverter]::GetBytes([UInt16]$Value)
  $Stream.Write($bytes, 0, 2)
}

function Write-UInt32LE {
  param([System.IO.Stream] $Stream, [long] $Value)
  $bytes = [BitConverter]::GetBytes([UInt32]$Value)
  $Stream.Write($bytes, 0, 4)
}

function Write-Int32LE {
  param([System.IO.Stream] $Stream, [int] $Value)
  $bytes = [BitConverter]::GetBytes([Int32]$Value)
  $Stream.Write($bytes, 0, 4)
}

function Convert-PngToIconDib {
  param([string] $Path)

  $bmp = [System.Drawing.Bitmap]::FromFile($Path)
  $width = $bmp.Width
  $height = $bmp.Height
  $stream = New-Object System.IO.MemoryStream

  Write-UInt32LE $stream 40
  Write-Int32LE $stream $width
  Write-Int32LE $stream ($height * 2)
  Write-UInt16LE $stream 1
  Write-UInt16LE $stream 32
  Write-UInt32LE $stream 0
  Write-UInt32LE $stream ($width * $height * 4)
  Write-Int32LE $stream 0
  Write-Int32LE $stream 0
  Write-UInt32LE $stream 0
  Write-UInt32LE $stream 0

  for ($y = $height - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $width; $x++) {
      $pixel = $bmp.GetPixel($x, $y)
      $stream.WriteByte($pixel.B)
      $stream.WriteByte($pixel.G)
      $stream.WriteByte($pixel.R)
      $stream.WriteByte($pixel.A)
    }
  }

  $maskRowBytes = [int]([Math]::Ceiling($width / 32.0) * 4)
  $maskRow = New-Object byte[] $maskRowBytes
  for ($y = 0; $y -lt $height; $y++) {
    $stream.Write($maskRow, 0, $maskRow.Length)
  }

  $bytes = $stream.ToArray()
  $stream.Dispose()
  $bmp.Dispose()
  return $bytes
}

$pngSizes = @(16, 24, 32, 48, 64, 128, 256, 512, 1024)
foreach ($size in $pngSizes) {
  New-IconPng $size (Join-Path $IconPngDir "icon-$size.png")
}

Copy-Item (Join-Path $IconPngDir "icon-1024.png") (Join-Path $BuildDir "icon.png") -Force

$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$entries = @()
foreach ($size in $icoSizes) {
  $bytes = Convert-PngToIconDib (Join-Path $IconPngDir "icon-$size.png")
  $entries += [PSCustomObject]@{
    Size = $size
    Bytes = $bytes
  }
}

$icoPath = Join-Path $BuildDir "icon.ico"
$stream = [System.IO.File]::Create($icoPath)
Write-UInt16LE $stream 0
Write-UInt16LE $stream 1
Write-UInt16LE $stream $entries.Count

$offset = 6 + (16 * $entries.Count)
foreach ($entry in $entries) {
  $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
  $stream.WriteByte([byte]$dimension)
  $stream.WriteByte([byte]$dimension)
  $stream.WriteByte(0)
  $stream.WriteByte(0)
  Write-UInt16LE $stream 1
  Write-UInt16LE $stream 32
  Write-UInt32LE $stream $entry.Bytes.Length
  Write-UInt32LE $stream $offset
  $offset += $entry.Bytes.Length
}

foreach ($entry in $entries) {
  $stream.Write($entry.Bytes, 0, $entry.Bytes.Length)
}

$stream.Dispose()
Write-Output "Generated $icoPath"
