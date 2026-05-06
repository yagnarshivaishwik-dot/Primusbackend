<#
.SYNOPSIS
  Deploy the Persistent Profile Picture System to Azure (PowerShell edition).

.DESCRIPTION
  Mirror of `deploy-profile-pictures.sh` for Windows ops boxes and Azure
  Cloud Shell PowerShell. Performs four idempotent steps:

    1. Validate required env vars (DATABASE_URL, GLOBAL_DATABASE_URL,
       AZURE_STORAGE_CONNECTION_STRING).
    2. Install / upgrade `azure-storage-blob`.
    3. Create the `profile-pictures` Azure Blob container if missing.
    4. Run both Alembic migrations against Azure Postgres.

  Each step can be skipped individually. Run from any directory — the
  script resolves the backend root from its own location.

.EXAMPLE
  PS> .\scripts\deploy-profile-pictures.ps1
  PS> .\scripts\deploy-profile-pictures.ps1 -NoContainer
  PS> .\scripts\deploy-profile-pictures.ps1 -SmokeBaseUrl https://api.primustech.in
#>
[CmdletBinding()]
param(
  [switch]$NoPip,
  [switch]$NoContainer,
  [switch]$NoMigrate,
  [string]$SmokeBaseUrl = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
# Locate backend root
# ---------------------------------------------------------------------------

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $BackendDir
Write-Step "Backend root: $BackendDir"

# ---------------------------------------------------------------------------
# Optional: load .env so the script works locally without exporting first
# ---------------------------------------------------------------------------

$EnvFile = Join-Path $BackendDir ".env"
if (Test-Path $EnvFile) {
  Write-Step "Loading .env"
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#') { return }
    if ($_ -notmatch '=')   { return }
    $kv = $_ -split '=', 2
    $k = $kv[0].Trim()
    $v = $kv[1].Trim().Trim('"').Trim("'")
    if ($k) { Set-Item "env:$k" $v }
  }
}

# ---------------------------------------------------------------------------
# Env validation
# ---------------------------------------------------------------------------

function Require-Env($name) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    Fail "$name is not set. Set it in your environment or .env file."
  }
}

Write-Step "Validating environment"
Require-Env "DATABASE_URL"

if ([string]::IsNullOrWhiteSpace($env:GLOBAL_DATABASE_URL)) {
  Write-Warn2 "GLOBAL_DATABASE_URL not set — falling back to DATABASE_URL for the global migration."
  $env:GLOBAL_DATABASE_URL = $env:DATABASE_URL
}

if (-not $env:AZURE_PROFILE_PICTURES_CONTAINER) {
  $env:AZURE_PROFILE_PICTURES_CONTAINER = "profile-pictures"
}
if (-not $env:AZURE_PROFILE_PICTURES_PUBLIC) {
  $env:AZURE_PROFILE_PICTURES_PUBLIC = "1"
}

if ([string]::IsNullOrWhiteSpace($env:AZURE_STORAGE_CONNECTION_STRING) `
    -and [string]::IsNullOrWhiteSpace($env:AZURE_STORAGE_ACCOUNT_URL)) {
  Write-Warn2 "AZURE_STORAGE_CONNECTION_STRING is not set."
  Write-Warn2 "Backend will fall back to local /static/avatars/ — fine for dev, NOT for production."
  $NoContainer = $true
}
Write-Ok "Environment OK"

# ---------------------------------------------------------------------------
# Pip install
# ---------------------------------------------------------------------------

if (-not $NoPip) {
  Write-Step "Installing azure-storage-blob"
  python -m pip install --quiet --upgrade pip
  python -m pip install --quiet "azure-storage-blob>=12.19.0"
  if ($LASTEXITCODE -ne 0) { Fail "pip install failed" }
  Write-Ok "Python deps OK"
} else {
  Write-Warn2 "Skipping pip install (-NoPip)"
}

# ---------------------------------------------------------------------------
# Azure Blob container provisioning (idempotent)
# ---------------------------------------------------------------------------

if (-not $NoContainer) {
  Write-Step "Ensuring Azure Blob container '$($env:AZURE_PROFILE_PICTURES_CONTAINER)' exists (public=$($env:AZURE_PROFILE_PICTURES_PUBLIC))"
  $py = @"
import os, sys
from azure.storage.blob import BlobServiceClient, PublicAccess
from azure.core.exceptions import ResourceExistsError

container = os.environ.get('AZURE_PROFILE_PICTURES_CONTAINER', 'profile-pictures')
public = os.environ.get('AZURE_PROFILE_PICTURES_PUBLIC', '1') not in {'0', 'false', 'False'}

conn = os.environ.get('AZURE_STORAGE_CONNECTION_STRING')
acc_url = os.environ.get('AZURE_STORAGE_ACCOUNT_URL')
acc_key = os.environ.get('AZURE_STORAGE_ACCOUNT_KEY')

if conn:
    svc = BlobServiceClient.from_connection_string(conn)
elif acc_url and acc_key:
    svc = BlobServiceClient(account_url=acc_url, credential=acc_key)
else:
    sys.exit('No Azure credentials in env.')

cc = svc.get_container_client(container)
try:
    cc.create_container(public_access=PublicAccess.Blob if public else None)
    print(f"Created container '{container}' (public={public}).")
except ResourceExistsError:
    print(f"Container '{container}' already exists - leaving alone.")
"@
  $py | python -
  if ($LASTEXITCODE -ne 0) { Fail "Container provisioning failed" }
  Write-Ok "Azure Blob container ready"
} else {
  Write-Warn2 "Skipping container provisioning"
}

# ---------------------------------------------------------------------------
# Alembic migrations on Azure Postgres
# ---------------------------------------------------------------------------

if (-not $NoMigrate) {
  Write-Step "Running Alembic migrations (legacy schema → DATABASE_URL)"
  if (Test-Path "alembic.ini") {
    alembic -c alembic.ini upgrade head
    if ($LASTEXITCODE -ne 0) { Fail "Legacy migration failed" }
    Write-Ok "Legacy migrations applied"
  } else {
    Write-Warn2 "alembic.ini not found — skipping legacy migration"
  }

  Write-Step "Running Alembic migrations (global schema → GLOBAL_DATABASE_URL)"
  if (Test-Path "alembic_global.ini") {
    alembic -c alembic_global.ini upgrade head
    if ($LASTEXITCODE -ne 0) { Fail "Global migration failed" }
    Write-Ok "Global migrations applied"
  } else {
    Write-Warn2 "alembic_global.ini not found — skipping global migration"
  }
} else {
  Write-Warn2 "Skipping migrations (-NoMigrate)"
}

# ---------------------------------------------------------------------------
# Smoke test (optional)
# ---------------------------------------------------------------------------

if (-not [string]::IsNullOrWhiteSpace($SmokeBaseUrl)) {
  Write-Step "Smoke-testing API at $SmokeBaseUrl"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$SmokeBaseUrl/health" | Out-Null
    Write-Ok "/health OK"
  } catch {
    Fail "/health did not respond at $SmokeBaseUrl"
  }

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "$SmokeBaseUrl/api/profile" -ErrorAction SilentlyContinue
    $status = if ($resp) { $resp.StatusCode } else { 0 }
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
  }

  if ($status -in 401, 403) {
    Write-Ok "/api/profile mounted (got $status without token, as expected)"
  } else {
    Write-Warn2 "/api/profile returned HTTP $status — check router wiring."
  }
}

Write-Ok "Profile picture deploy complete."
Write-Step "Next step: restart the API process so the new routes & azure-storage-blob load."
