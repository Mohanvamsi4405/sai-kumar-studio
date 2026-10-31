# Convenience wrapper around scripts/backup_database.py for Windows - activates the
# venv, writes a zipped backup and keeps only the newest N. Made for Task Scheduler,
# which needs a single command with no venv activation of its own.
#
# Run by hand:
#     .\scripts\backup_database.ps1
#     .\scripts\backup_database.ps1 -Out "D:\studio-backups" -Keep 30
#
# Schedule it daily (run once, from an elevated PowerShell, adjusting the path):
#     $action  = New-ScheduledTaskAction -Execute "powershell.exe" `
#         -Argument '-NoProfile -ExecutionPolicy Bypass -File "D:\Gen AI\Studio\studio-backed\backend\scripts\backup_database.ps1" -Out "D:\studio-backups" -Keep 30'
#     $trigger = New-ScheduledTaskTrigger -Daily -At 2:00am
#     Register-ScheduledTask -TaskName "Studio DB backup" -Action $action -Trigger $trigger
#
# The backup itself is read-only, so running it while the site is live is safe.

param(
    [string]$Out = "",
    [int]$Keep = 14
)

$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $PSScriptRoot
Set-Location $backendDir

$python = Join-Path $backendDir "venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }  # fall back to whatever is on PATH

$scriptArgs = @("scripts/backup_database.py", "--zip", "--keep", $Keep)
if ($Out) { $scriptArgs += @("--out", $Out) }

& $python @scriptArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup FAILED with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
