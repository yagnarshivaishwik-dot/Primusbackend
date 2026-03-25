param(
    [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

# Resolve repo root (this script is in scripts/)
$repoRoot = Split-Path $PSScriptRoot -Parent

Write-Host "=== Primus OSS Security Stack – Starting ==="

Write-Host "`n[*] Starting Vault and Keycloak containers via docker compose..."
Set-Location $repoRoot
docker compose up -d vault keycloak | Out-Null

Write-Host "[*] Initializing Vault dev secrets inside primus-vault container..."
docker exec primus-vault sh -c 'cd /vault/init && chmod +x init-dev.sh && VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root ./init-dev.sh' | Out-Null

Write-Host "[*] Starting runtime security stack (Falco, Loki, Prometheus, Grafana)..."
docker compose -f docker/runtime-security-compose.yml up -d | Out-Null

Write-Host "[*] Creating virtualenv (if needed) and installing backend requirements..."
Set-Location (Join-Path $repoRoot "backend")
if (-not (Test-Path "venv")) {
    & $PythonExe -m venv venv
}
& ".\venv\Scripts\activate.ps1"
pip install -r requirements.txt | Out-Null

Write-Host "[*] Starting backend with Vault environment variables..."
$env:VAULT_ADDR = "http://127.0.0.1:8200"
$env:VAULT_TOKEN = "root"

Write-Host "Backend will be available at http://localhost:8000"
Write-Host "Keycloak will be available at http://localhost:8080"
Write-Host "Grafana will be available at http://localhost:3000 (admin/admin)"
Write-Host "`n=== Press Ctrl+C to stop the backend (containers stay running) ===`n"

uvicorn main:app --host 0.0.0.0 --port 8000 --reload


