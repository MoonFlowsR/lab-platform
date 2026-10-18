param([Parameter(Mandatory=$true)][string]$PlatformRoot,[Parameter(Mandatory=$true)][int]$Port)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($PlatformRoot)
$entry=Join-Path $root 'server\index.cjs'
$status=Join-Path $root 'server\logs\startup-status.json'
$known=0
if(Test-Path -LiteralPath $status){try{$known=[int]((Get-Content -LiteralPath $status -Raw | ConvertFrom-Json).details.server_pid)}catch{}}
foreach($id in @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)){
  $candidate=Get-CimInstance Win32_Process -Filter "ProcessId=$id"
  $absolute=$candidate.CommandLine -match [regex]::Escape($entry)
  $legacy=$id -eq $known -and $candidate.CommandLine -match 'server[/\\]index\.cjs'
  if($candidate.Name -ne 'node.exe' -or -not ($absolute -or $legacy)){throw '该端口属于其它程序，未停止。'}
  Stop-Process -Id $id -Force
}
