$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$scheduleConfig = Get-Content -LiteralPath (Join-Path $projectPath 'data\temp\database-backup-schedule.json') -Raw | ConvertFrom-Json
$runnerPath = Join-Path $PSScriptRoot 'run_database_backup.cjs'
$process = Start-Process -FilePath $scheduleConfig.nodePath -ArgumentList @(('"' + $runnerPath + '"')) -WorkingDirectory $projectPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectPath 'data\temp\scheduled-backup.stdout.log') -RedirectStandardError (Join-Path $projectPath 'data\temp\scheduled-backup.stderr.log') -Wait -PassThru
exit $process.ExitCode
