$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) { throw "DATABASE_URL is required" }
if (-not $env:BACKUP_DIR) { throw "BACKUP_DIR is required" }
if ($env:BACKUP_ENCRYPTION_AT_REST_ACK -ne "true") {
  throw "Set BACKUP_ENCRYPTION_AT_REST_ACK=true only after verifying encrypted destination storage"
}

$backupDirectory = [System.IO.Path]::GetFullPath($env:BACKUP_DIR)
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$backupFile = Join-Path $backupDirectory "studentos-$timestamp.dump"

& pg_dump --dbname=$env:DATABASE_URL --format=custom --no-owner --no-privileges --file=$backupFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$backupFile.sha256" -Value "$hash  $([System.IO.Path]::GetFileName($backupFile))" -Encoding ascii
Write-Output $backupFile
