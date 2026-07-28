param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('^[0-9A-Za-z._-]+$')]
  [string]$Version,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$Files
)

$siteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$versionedExtensions = @('.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff2')

if (-not $Files -or $Files.Count -eq 0) {
  $gitOutput = & git -C $siteRoot status --porcelain=v1 --untracked-files=all 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Git repository not found. Pass changed files explicitly, for example: .\bump-version.ps1 20260728-01 css/modern-ui.css app.js'
  }

  $Files = foreach ($line in $gitOutput) {
    if ($line.Length -lt 4) { continue }
    $path = $line.Substring(3).Trim()
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
    $path.Trim('"')
  }
}

$assets = $Files |
  ForEach-Object { $_.Replace('\', '/').TrimStart('.', '/') } |
  Where-Object { $versionedExtensions -contains [IO.Path]::GetExtension($_).ToLowerInvariant() } |
  Sort-Object -Unique

if (-not $assets -or $assets.Count -eq 0) {
  Write-Output 'No changed CSS, JS, image, or font assets need a version update.'
  exit 0
}

$htmlFiles = Get-ChildItem -LiteralPath $siteRoot -Filter '*.html' -File
$updatedReferences = 0
$quoteClass = '["' + [char]39 + ']'

foreach ($htmlFile in $htmlFiles) {
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $htmlFile.FullName
  $updated = $content

  foreach ($asset in $assets) {
    $escapedAsset = [regex]::Escape($asset)
    $pattern = '((?:src|href)=' + $quoteClass + '(?:\./)?' + $escapedAsset + ')(?:\?v=[0-9A-Za-z._-]+)?(' + $quoteClass + ')'
    $replacement = '${1}?v=' + $Version + '$2'
    $next = [regex]::Replace($updated, $pattern, $replacement)
    if ($next -ne $updated) {
      $updatedReferences += 1
      $updated = $next
    }
  }

  if ($updated -ne $content) {
    Set-Content -Encoding UTF8 -NoNewline -LiteralPath $htmlFile.FullName -Value $updated
  }
}

Write-Output ('Updated versions for {0} changed assets across {1} HTML references.' -f $assets.Count, $updatedReferences)
Write-Output ('Assets: ' + ($assets -join ', '))
