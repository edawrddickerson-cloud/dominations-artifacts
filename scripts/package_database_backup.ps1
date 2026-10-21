param([Parameter(Mandatory=$true)][string]$BackupDirectory,[Parameter(Mandatory=$true)][string]$ArchiveFile)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$backupRoot = [System.IO.Path]::GetFullPath((Join-Path $projectPath 'data\temp\database-backups')) + '\'
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupDirectory)
$resolvedArchive = [System.IO.Path]::GetFullPath($ArchiveFile)
if (-not $resolvedBackup.StartsWith($backupRoot,[System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Parent $resolvedArchive) -ne $resolvedBackup) { throw 'Archive must be created inside its local backup folder.' }
Compress-Archive -LiteralPath @((Join-Path $resolvedBackup 'planner-auth.dump'),(Join-Path $resolvedBackup 'manifest.json')) -DestinationPath $resolvedArchive -CompressionLevel Optimal
