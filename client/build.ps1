param(
    [string]$Configuration = "Release"
)

Write-Host "Building PrimusKiosk ($Configuration)..." -ForegroundColor Cyan

dotnet build ".\PrimusKiosk\PrimusKiosk.csproj" -c $Configuration

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed."
    exit $LASTEXITCODE
}

Write-Host "Build completed successfully." -ForegroundColor Green


