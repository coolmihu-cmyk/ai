param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9A-Za-z._-]+$')]
  [string]$Version
)

$siteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$htmlFiles = Get-ChildItem -LiteralPath $siteRoot -Filter '*.html' -File

foreach ($file in $htmlFiles) {
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName
  $updated = $content -replace '\?v=[0-9A-Za-z._-]+', ('?v=' + $Version)
  if ($updated -ne $content) {
    Set-Content -Encoding UTF8 -NoNewline -LiteralPath $file.FullName -Value $updated
  }
}

Write-Output "Release version updated to $Version in $($htmlFiles.Count) HTML files."
