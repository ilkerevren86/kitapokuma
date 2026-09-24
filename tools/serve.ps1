# Sayfa — yerel test sunucusu (bilgisayarda denemek için)
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\serve.ps1  ->  http://localhost:8765
param([int]$Port = 8765)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.webmanifest'='application/manifest+json'; '.json'='application/json'; '.pdf'='application/pdf'; '.txt'='text/plain; charset=utf-8'; '.docx'='application/octet-stream'; '.doc'='application/octet-stream'; '.epub'='application/epub+zip' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Sayfa: http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($p -eq '') { $p = 'index.html' }
    $f = Join-Path $root $p
    if ((Test-Path $f -PathType Leaf) -and ([IO.Path]::GetFullPath($f)).StartsWith($root)) {
      $b = [IO.File]::ReadAllBytes($f)
      $e = [IO.Path]::GetExtension($f).ToLower()
      $ctx.Response.ContentType = if ($types[$e]) { $types[$e] } else { 'application/octet-stream' }
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
