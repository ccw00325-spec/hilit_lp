param(
  [Parameter(Mandatory = $true)][string]$Video,
  [Parameter(Mandatory = $true)][string]$OutDir
)

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$player = [System.Windows.Media.MediaPlayer]::new()
$player.ScrubbingEnabled = $true
$player.Open([Uri]::new($Video))

for ($i = 0; $i -lt 80 -and $player.NaturalVideoWidth -eq 0; $i++) {
  Start-Sleep -Milliseconds 100
}

if ($player.NaturalVideoWidth -eq 0) {
  $player.Close()
  throw '영상 프레임을 읽지 못했습니다.'
}

$width = $player.NaturalVideoWidth
$height = $player.NaturalVideoHeight
$times = @(0.5, 4.0, 8.0, 12.0)

foreach ($seconds in $times) {
  $player.Position = [TimeSpan]::FromSeconds($seconds)
  $player.Play()
  Start-Sleep -Milliseconds 250
  $player.Pause()

  $visual = [System.Windows.Media.DrawingVisual]::new()
  $drawing = $visual.RenderOpen()
  $drawing.DrawVideo($player, [System.Windows.Rect]::new(0, 0, $width, $height))
  $drawing.Close()

  $bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new(
    $width,
    $height,
    96,
    96,
    [System.Windows.Media.PixelFormats]::Pbgra32
  )
  $bitmap.Render($visual)

  $encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
  $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
  $name = 'frame-{0:000}.png' -f [int]($seconds * 10)
  $stream = [System.IO.File]::Open(
    (Join-Path $OutDir $name),
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write
  )
  $encoder.Save($stream)
  $stream.Close()
}

$player.Close()
Write-Output "${width}x${height}"
