# Cloudflare Tunnel Setup Script for Windows PowerShell
# Run this script as Administrator

Write-Host "=== Cloudflare Tunnel Setup for primustech.in ===" -ForegroundColor Green

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script requires Administrator privileges. Please run as Administrator." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 1: Download and install cloudflared
Write-Host "Step 1: Installing cloudflared..." -ForegroundColor Yellow

$cloudflaredUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
$cloudflaredPath = "$env:ProgramFiles\Cloudflare\cloudflared.exe"
$cloudflaredDir = Split-Path $cloudflaredPath -Parent

# Create directory if it doesn't exist
if (!(Test-Path $cloudflaredDir)) {
    New-Item -ItemType Directory -Force -Path $cloudflaredDir
}

# Download cloudflared
Write-Host "Downloading cloudflared..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $cloudflaredUrl -OutFile $cloudflaredPath
    Write-Host "cloudflared downloaded successfully!" -ForegroundColor Green
} catch {
    Write-Host "Failed to download cloudflared: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Add to PATH if not already there
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
if ($currentPath -notlike "*$cloudflaredDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$cloudflaredDir", "Machine")
    Write-Host "Added cloudflared to system PATH" -ForegroundColor Green
}

# Step 2: Authenticate with Cloudflare
Write-Host "`nStep 2: Authenticating with Cloudflare..." -ForegroundColor Yellow
Write-Host "This will open a browser window. Please log in to your Cloudflare account and select the 'primustech.in' domain." -ForegroundColor Cyan

try {
    & $cloudflaredPath tunnel login
    Write-Host "Authentication successful!" -ForegroundColor Green
} catch {
    Write-Host "Authentication failed: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Create tunnel
Write-Host "`nStep 3: Creating tunnel..." -ForegroundColor Yellow
$tunnelName = "primustech-backend"

try {
    $tunnelOutput = & $cloudflaredPath tunnel create $tunnelName 2>&1
    Write-Host "Tunnel created successfully!" -ForegroundColor Green
    Write-Host $tunnelOutput -ForegroundColor Gray
    
    # Extract tunnel ID from output
    $tunnelId = ($tunnelOutput | Select-String "Created tunnel .* with id (.*)").Matches.Groups[1].Value
    if ($tunnelId) {
        Write-Host "Tunnel ID: $tunnelId" -ForegroundColor Cyan
    }
} catch {
    Write-Host "Failed to create tunnel: $_" -ForegroundColor Red
    # Continue anyway, tunnel might already exist
}

# Step 4: Route DNS
Write-Host "`nStep 4: Setting up DNS routing..." -ForegroundColor Yellow

try {
    & $cloudflaredPath tunnel route dns $tunnelName primustech.in
    Write-Host "DNS routing configured successfully!" -ForegroundColor Green
} catch {
    Write-Host "DNS routing failed: $_" -ForegroundColor Red
    Write-Host "You may need to manually configure DNS in Cloudflare dashboard" -ForegroundColor Yellow
}

# Step 5: Create configuration file
Write-Host "`nStep 5: Creating tunnel configuration..." -ForegroundColor Yellow

$configDir = "$env:USERPROFILE\.cloudflared"
$configFile = "$configDir\config.yml"

if (!(Test-Path $configDir)) {
    New-Item -ItemType Directory -Force -Path $configDir
}

# Get tunnel ID for config
$tunnelList = & $cloudflaredPath tunnel list 2>&1
$tunnelId = ($tunnelList | Select-String "$tunnelName\s+([a-f0-9-]+)").Matches.Groups[1].Value

if ($tunnelId) {
    $configContent = @"
tunnel: $tunnelId
credentials-file: $configDir\$tunnelId.json

ingress:
  # Route API requests to FastAPI backend
  - hostname: primustech.in
    path: /api/*
    service: http://localhost:8000
  
  # Route WebSocket connections
  - hostname: primustech.in
    path: /ws/*
    service: http://localhost:8000
  
  # Route health check
  - hostname: primustech.in
    path: /health
    service: http://localhost:8000
  
  # Route root endpoint
  - hostname: primustech.in
    path: /
    service: http://localhost:8000
  
  # Catch-all rule (required)
  - service: http_status:404

# Enable metrics (optional)
metrics: 127.0.0.1:2000
"@

    Set-Content -Path $configFile -Value $configContent
    Write-Host "Configuration file created: $configFile" -ForegroundColor Green
} else {
    Write-Host "Could not determine tunnel ID. Please check tunnel list manually." -ForegroundColor Red
}

# Step 6: Create startup scripts
Write-Host "`nStep 6: Creating startup scripts..." -ForegroundColor Yellow

# Create start-backend script
$startBackendScript = @"
@echo off
echo Starting Lance Backend...
cd /d "$($PWD.Path)"

REM Activate virtual environment if it exists
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
    echo Virtual environment activated
)

REM Start the backend
echo Starting FastAPI server on port 8000...
python main.py

pause
"@

Set-Content -Path "start-backend.bat" -Value $startBackendScript
Write-Host "Created start-backend.bat" -ForegroundColor Green

# Create start-tunnel script
$startTunnelScript = @"
@echo off
echo Starting Cloudflare Tunnel for primustech.in...

REM Start the tunnel using the configuration file
"$cloudflaredPath" tunnel --config "$configFile" run $tunnelName

pause
"@

Set-Content -Path "start-tunnel.bat" -Value $startTunnelScript
Write-Host "Created start-tunnel.bat" -ForegroundColor Green

# Create combined start script
$startAllScript = @"
@echo off
echo Starting Lance Backend with Cloudflare Tunnel...

REM Start backend in new window
start "Lance Backend" cmd /c "start-backend.bat"

REM Wait a moment for backend to start
timeout /t 5 /nobreak

REM Start tunnel
echo Starting tunnel...
start "Cloudflare Tunnel" cmd /c "start-tunnel.bat"

echo Both services are starting...
echo Backend: http://localhost:8000
echo Public URL: https://primustech.in
echo.
echo Press any key to exit...
pause
"@

Set-Content -Path "start-all.bat" -Value $startAllScript
Write-Host "Created start-all.bat" -ForegroundColor Green

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Copy 'env.production' to '.env' and update with your actual values" -ForegroundColor Cyan
Write-Host "2. Make sure your backend is configured with ALLOW_ALL_CORS=true" -ForegroundColor Cyan
Write-Host "3. Run 'start-all.bat' to start both backend and tunnel" -ForegroundColor Cyan
Write-Host "4. Your API will be available at https://primustech.in" -ForegroundColor Cyan
Write-Host "`nImportant files created:" -ForegroundColor Yellow
Write-Host "- start-backend.bat (starts just the backend)" -ForegroundColor Gray
Write-Host "- start-tunnel.bat (starts just the tunnel)" -ForegroundColor Gray
Write-Host "- start-all.bat (starts both services)" -ForegroundColor Gray
Write-Host "- env.production (environment template)" -ForegroundColor Gray

Read-Host "`nPress Enter to exit"
"@
