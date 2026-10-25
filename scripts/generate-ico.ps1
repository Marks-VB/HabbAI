Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\client\public\assets\brand\icon-512.png"
$icoPath = Join-Path $PSScriptRoot "..\habblaud.ico"
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

$sizes = @(256, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $sz, $sz)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    $pngStreams += ,@($sz, $ms.ToArray())
    $ms.Dispose()
}
$srcBmp.Dispose()

$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter $fs

# Header
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # ICO type
$bw.Write([uint16]$pngStreams.Count) # Image count

# Calculate offsets
# Header = 6 bytes, Each Dir Entry = 16 bytes
$offset = 6 + (16 * $pngStreams.Count)

foreach ($item in $pngStreams) {
    $sz = $item[0]
    $bytes = $item[1]
    
    $w = if ($sz -ge 256) { 0 } else { [byte]$sz }
    $h = if ($sz -ge 256) { 0 } else { [byte]$sz }
    
    $bw.Write([byte]$w)
    $bw.Write([byte]$h)
    $bw.Write([byte]0) # Color count
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Color planes
    $bw.Write([uint16]32) # Bpp
    $bw.Write([uint32]$bytes.Length)
    $bw.Write([uint32]$offset)
    
    $offset += $bytes.Length
}

foreach ($item in $pngStreams) {
    $bytes = $item[1]
    $bw.Write($bytes)
}

$bw.Close()
$fs.Close()
Write-Host "ICO successfully generated at $icoPath"
