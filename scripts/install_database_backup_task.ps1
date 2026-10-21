param([Parameter(Mandatory=$true)][string]$DestinationDirectory,[switch]$StatusOnly)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$destinationPath = (Resolve-Path -LiteralPath $DestinationDirectory).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$taskName = 'DomiNations Database Backup'
if ($StatusOnly) {
  $statusService = New-Object -ComObject 'Schedule.Service'
  $statusService.Connect()
  $registered = $statusService.GetFolder('\').GetTask($taskName)
  [ordered]@{enabled=$registered.Enabled;state=$registered.State;lastResult=$registered.LastTaskResult;lastRun=$registered.LastRunTime.ToString('s');nextRun=$registered.NextRunTime.ToString('s')} | ConvertTo-Json
  exit 0
}
$launcher = Join-Path $PSScriptRoot 'run_database_backup.ps1'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
$escape = { param($value) [System.Security.SecurityElement]::Escape($value) }
$scheduleConfig = @{destination=$destinationPath;nodePath=$nodePath;dailyLocalTime='10:00';weeklyRestoreVerification=$true;automaticDeletion=$false}
$scheduleConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectPath 'data\temp\database-backup-schedule.json') -Encoding Ascii
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
try { $existing = $folder.GetTask($taskName) } catch { $existing = $null }
if ($existing -and -not $existing.Xml.Contains((& $escape $launcher))) { throw 'An unrelated task already uses this name.' }
$boundary = (Get-Date).Date.AddHours(10).ToString('yyyy-MM-ddTHH:mm:ss')
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Private read-only DomiNations database backups. Requires the signed-in user, network access, and OneDrive for cloud upload.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>$userSid</UserId><Delay>PT2M</Delay></LogonTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>$userSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT15M</ExecutionTimeLimit><RestartOnFailure><Interval>PT30M</Interval><Count>3</Count></RestartOnFailure></Settings>
  <Actions Context="Author"><Exec><Command>$(& $escape $powershellPath)</Command><Arguments>$(& $escape $arguments)</Arguments><WorkingDirectory>$(& $escape $projectPath)</WorkingDirectory></Exec></Actions>
</Task>
"@
$null = $folder.RegisterTask($taskName,$xml,6,$userSid,$null,3,$null)
Write-Output 'Daily backup task installed: 10:00 local time, plus sign-in catch-up; three retries after failure.'
$task = $folder.GetTask($taskName)
$null = $task.Run($null)
Write-Output 'Started the first scheduled backup.'
