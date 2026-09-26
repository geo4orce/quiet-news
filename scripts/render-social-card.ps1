# Render the existing Quiet News identity as a share image. Windows only.
# No runtime dependency or site build step is introduced.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$siteRoot = Join-Path $PSScriptRoot '../public'
[xml]$logo = Get-Content -Raw (Join-Path $siteRoot 'quiet-news.svg')
if ($logo.svg.path.d -ne 'M10.75 28.75A14.5 14.5 0 1 1 31.25 28.75M24.5 25.5l9 10') {
    throw 'The source logo changed; update the corresponding arc geometry.'
}
$bitmap = [Drawing.Bitmap]::new(2400, 1260)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.ScaleTransform(2, 2)
$graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f4f1e9'))
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#18211d'))
$muted = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#626b65'))
$pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml($logo.svg.path.stroke), 18)
$pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
# Exact circle construction for the SVG's 14.5-radius major arc, scaled 3x.
$centerY = 28.75 - [Math]::Sqrt(14.5 * 14.5 - 10.25 * 10.25)
$angle = [Math]::Atan2(28.75 - $centerY, -10.25) * 180 / [Math]::PI
$graphics.DrawArc($pen, [single](100 + (21 - 14.5) * 3), [single](82 + ($centerY - 14.5) * 3), 87, 87, [single]$angle, [single](360 - (2 * $angle - 180)))
$graphics.DrawLine($pen, [single](100 + 24.5 * 3), [single](82 + 25.5 * 3), [single](100 + 33.5 * 3), [single](82 + 35.5 * 3))
$title = [Drawing.Font]::new('Georgia', 76, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$tagline = [Drawing.Font]::new('Georgia', 33, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$small = [Drawing.Font]::new('Arial', 23, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('Quiet News', $title, $ink, 100, 247)
$graphics.DrawString('AI-powered daily news.', $tagline, $muted, 104, 357)
$graphics.DrawString('Only what earns your attention.', $tagline, $muted, 104, 404)
$graphics.DrawString('quietnews.ai', $small, $muted, 107, 541)
$output = [Drawing.Bitmap]::new(1200, 630)
$outputGraphics = [Drawing.Graphics]::FromImage($output)
$outputGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$outputGraphics.DrawImage($bitmap, 0, 0, 1200, 630)
$output.Save((Join-Path $siteRoot 'social-card.png'), [Drawing.Imaging.ImageFormat]::Png)
foreach ($resource in @($outputGraphics,$output,$small,$tagline,$title,$pen,$muted,$ink,$graphics,$bitmap)) { $resource.Dispose() }