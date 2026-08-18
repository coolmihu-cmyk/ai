param(
  [Parameter(Mandatory=$true,Position=0)]
  [string[]]$Files
)

$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$changed=0

foreach($file in $Files){
  $relative=$file.Replace('\','/').TrimStart('./')
  $source=Join-Path $root $relative
  if(!(Test-Path -LiteralPath $source)){Write-Warning "未找到文件：$relative";continue}
  git -C $root ls-files --error-unmatch -- $relative *> $null
  $tracked=$LASTEXITCODE -eq 0
  if($tracked){
    git -C $root diff --quiet -- $relative
    if($LASTEXITCODE -eq 0){Write-Host "未改动，跳过：$relative";continue}
  }
  $escaped=[regex]::Escape($relative)
  $htmlFiles=Get-ChildItem -LiteralPath $root -Filter '*.html' -File
  $updated=0
  foreach($html in $htmlFiles){
    $text=[IO.File]::ReadAllText($html.FullName)
    $pattern='('+ $escaped +'\?v=)[^"''\s>]+'
    $next=[regex]::Replace($text,$pattern,{param($match)$match.Groups[1].Value+$stamp})
    if($next -eq $text){continue}
    $bytes=[IO.File]::ReadAllBytes($html.FullName)
    $hasBom=$bytes.Length -ge 3 -and $bytes[0]-eq 239 -and $bytes[1]-eq 187 -and $bytes[2]-eq 191
    [IO.File]::WriteAllText($html.FullName,$next,[Text.UTF8Encoding]::new($hasBom))
    $updated++
  }
  if($updated){Write-Host "已更新 $relative 的 $updated 个引用 → $stamp";$changed++}else{Write-Warning "没有找到 $relative 的版本引用"}
}
if(!$changed){Write-Host '没有需要更新的版本号。'}