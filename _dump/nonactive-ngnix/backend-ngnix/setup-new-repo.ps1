# PowerShell script to set up a new backend repository

Write-Host "Setting up Lance Backend as a separate repository..." -ForegroundColor Green

# Create a new directory for the backend repo
$sourcePath = Get-Location
$targetPath = "K:\lance-backend"

# Check if target already exists
if (Test-Path $targetPath) {
    Write-Host "Target directory already exists: $targetPath" -ForegroundColor Red
    $response = Read-Host "Do you want to remove it and continue? (y/n)"
    if ($response -eq 'y') {
        Remove-Item $targetPath -Recurse -Force
    } else {
        Write-Host "Exiting..." -ForegroundColor Yellow
        exit
    }
}

Write-Host "Copying backend files to $targetPath..." -ForegroundColor Yellow
Copy-Item -Path $sourcePath -Destination $targetPath -Recurse

# Navigate to new directory
Set-Location $targetPath

# Clean up files that shouldn't be in the repo
Write-Host "Cleaning up sensitive files..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Remove-Item ".env" -Force
    Write-Host "Removed .env file" -ForegroundColor Gray
}
if (Test-Path "lance.db") {
    Remove-Item "lance.db" -Force
    Write-Host "Removed lance.db" -ForegroundColor Gray
}
if (Test-Path "primus-7b360-firebase-adminsdk-fbsvc-4b41845f71.json") {
    Remove-Item "primus-7b360-firebase-adminsdk-fbsvc-4b41845f71.json" -Force
    Write-Host "Removed Firebase credentials" -ForegroundColor Gray
}
if (Test-Path "venv") {
    Remove-Item "venv" -Recurse -Force
    Write-Host "Removed virtual environment" -ForegroundColor Gray
}
if (Test-Path "__pycache__") {
    Remove-Item "__pycache__" -Recurse -Force
    Write-Host "Removed __pycache__" -ForegroundColor Gray
}

# Initialize git repository
Write-Host "`nInitializing git repository..." -ForegroundColor Yellow
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Lance Backend API

- FastAPI backend for gaming cafe management system
- User authentication and management
- PC and session management
- Wallet and payment integration
- Real-time WebSocket support
- Comprehensive admin features"

Write-Host "`nRepository created successfully!" -ForegroundColor Green
Write-Host "Location: $targetPath" -ForegroundColor Cyan

Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Create a new repository on GitHub: https://github.com/new"
Write-Host "2. Run the following commands to push to GitHub:"
Write-Host "   git remote add origin https://github.com/YOUR-USERNAME/lance-backend.git" -ForegroundColor Gray
Write-Host "   git branch -M main" -ForegroundColor Gray
Write-Host "   git push -u origin main" -ForegroundColor Gray

Write-Host "`nOptional: Return to original directory with:" -ForegroundColor Yellow
Write-Host "   cd $sourcePath" -ForegroundColor Gray
