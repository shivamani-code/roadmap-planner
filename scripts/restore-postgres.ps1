$ErrorActionPreference = "Stop"

if ($env:CONFIRM_RESTORE -ne "RESTORE") { throw "Set CONFIRM_RESTORE=RESTORE for the isolated restore target" }
if (-not $env:RESTORE_DATABASE_URL) { throw "RESTORE_DATABASE_URL is required" }
if (-not $env:BACKUP_FILE) { throw "BACKUP_FILE is required" }

$backupFile = [System.IO.Path]::GetFullPath($env:BACKUP_FILE)
if (-not (Test-Path -LiteralPath $backupFile -PathType Leaf)) { throw "Backup file does not exist: $backupFile" }
$checksumFile = "$backupFile.sha256"
if (-not (Test-Path -LiteralPath $checksumFile -PathType Leaf)) { throw "Checksum file is required: $checksumFile" }
$expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split "\s+")[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile).Hash.ToLowerInvariant()
if ($expected -ne $actual) { throw "Backup checksum mismatch" }

& pg_restore --dbname=$env:RESTORE_DATABASE_URL --clean --if-exists --no-owner --no-privileges --exit-on-error $backupFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

& psql $env:RESTORE_DATABASE_URL -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS migration_count FROM _prisma_migrations;"
if ($LASTEXITCODE -ne 0) { throw "Restore verification query failed with exit code $LASTEXITCODE" }
