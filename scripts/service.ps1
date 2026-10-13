param([ValidateSet('Install','Start','Check','Remove')][string]$Action='Check')
$ErrorActionPreference='Stop'
$platformRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$platformEntry=Join-Path $platformRoot 'server\index.cjs'
$envFile=Join-Path $platformRoot '.env'
$logDir=Join-Path $platformRoot 'server\logs'
$pidFile=Join-Path $logDir 'service.pid'
$stateFile=Join-Path $logDir 'service-state.json'
$hashProvider=[Security.Cryptography.SHA256]::Create()
try {$rootHash=([BitConverter]::ToString($hashProvider.ComputeHash([Text.Encoding]::UTF8.GetBytes($platformRoot.ToLowerInvariant())))).Replace('-','').Substring(0,12)} finally {$hashProvider.Dispose()}
$taskName='LabPlatform-OpenSource-'+$rootHash
function Own-Process($processId) {
  $candidate=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$processId) -ErrorAction SilentlyContinue
  if (!$candidate -or $candidate.Name -ne 'node.exe') {return $false}
  $entryPattern='(?i)(?:^|\s)"?'+[regex]::Escape($platformEntry)+'"?(?:\s|$)'
  return [bool]($candidate.CommandLine -match $entryPattern)
}
function Stop-Owned {
  if (Test-Path -LiteralPath $pidFile) {
    $ownedProcessId=[int](Get-Content -LiteralPath $pidFile -Raw)
    if (Own-Process $ownedProcessId) {Stop-Process -Id $ownedProcessId -ErrorAction SilentlyContinue}
    Remove-Item -LiteralPath $pidFile -Force
  }
}
function Healthy($port) {
  try {
    $request=[Net.HttpWebRequest]::Create('http://127.0.0.1:'+$port+'/api/health')
    $request.Proxy=$null; $request.Timeout=3000
    $response=$request.GetResponse()
    try {$reader=New-Object IO.StreamReader($response.GetResponseStream()); try {$result=$reader.ReadToEnd() | ConvertFrom-Json} finally {$reader.Dispose()}; return $result.ok -and $result.service -eq 'lab-platform'} finally {$response.Dispose()}
  } catch {return $false}
}
try {
  if ($Action -eq 'Remove') {
    $existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false}
    Stop-Owned
    Write-Output '本目录的后台任务和进程已停止，数据保留。'
    exit 0
  }
  if (!(Test-Path -LiteralPath $envFile)) {throw '请先运行 npm run setup。'}
  if (!(Test-Path -LiteralPath (Join-Path $platformRoot 'dist\index.html'))) {throw '请先运行 npm ci 和 npm run build。'}
  $settings=@{}
  foreach ($line in (Get-Content -LiteralPath $envFile)) {if ($line -match '^\s*([A-Z_]+)\s*=(.*)$') {$settings[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'")}}
  $port=3001; if ($settings.ContainsKey('PORT')) {$port=[int]$settings.PORT}
  if ($port -lt 1 -or $port -gt 65535) {throw 'PORT 必须为1至65535。'}
  $nodePath=(Get-Command node.exe -ErrorAction Stop).Source
  $listener=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener -and !(Own-Process $listener.OwningProcess)) {throw '配置端口已被其它服务使用。请修改本目录 .env 中的 PORT，已有服务不会被停止。'}
  if ($Action -eq 'Install') {
    $taskCommand='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$PSCommandPath+'" -Action Check'
    $taskAction=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $taskCommand -WorkingDirectory $platformRoot
    $currentIdentity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    $triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $currentIdentity),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
    $principal=New-ScheduledTaskPrincipal -UserId $currentIdentity -LogonType Interactive -RunLevel Limited
    $taskSettings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $triggers -Principal $principal -Settings $taskSettings -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output '已安装本目录的静默后台任务；每分钟检查，登录后自动运行。'
    exit 0
  }
  if ($Action -eq 'Start') {
    if (!(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {throw '请先按README安装本目录的后台任务。'}
    Start-ScheduledTask -TaskName $taskName
    exit 0
  }
  [IO.Directory]::CreateDirectory($logDir) | Out-Null
  if ($listener -and (Healthy $port)) {
    @{checked_at=(Get-Date).ToString('o');state='healthy';failures=0} | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8
    exit 0
  }
  if ($listener) {
    $failureCount=1
    if (Test-Path -LiteralPath $stateFile) {try {$failureCount=1+[int]((Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).failures)} catch {}}
    @{checked_at=(Get-Date).ToString('o');state='retry';failures=$failureCount} | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8
    if ($failureCount -lt 3) {exit 0}
    if (Own-Process $listener.OwningProcess) {Stop-Process -Id $listener.OwningProcess}
  }
  $process=Start-Process -FilePath $nodePath -ArgumentList ('"'+$platformEntry+'"') -WorkingDirectory $platformRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server.error.log')
  $process.Id | Set-Content -LiteralPath $pidFile -Encoding ASCII
  for ($attempt=0;$attempt -lt 12;$attempt++) {if (Healthy $port) {break}; Start-Sleep -Milliseconds 500}
  if (!(Healthy $port)) {throw '服务启动未就绪，请查看 server/logs/server.error.log。'}
  @{checked_at=(Get-Date).ToString('o');state='healthy';failures=0} | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8
} catch {
  [IO.Directory]::CreateDirectory($logDir) | Out-Null
  ((Get-Date).ToString('o')+' '+$_.Exception.Message) | Add-Content -LiteralPath (Join-Path $logDir 'service.error.log') -Encoding UTF8
  Write-Error $_.Exception.Message
  exit 1
}
