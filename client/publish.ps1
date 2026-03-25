param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)

$publishDir = Join-Path $PSScriptRoot "publish"
New-Item -ItemType Directory -Force -Path $publishDir | Out-Null

Write-Host "Publishing PrimusKiosk as single-file EXE..." -ForegroundColor Cyan

dotnet publish ".\PrimusKiosk\PrimusKiosk.csproj" `
    -c $Configuration `
    -r $Runtime `
    -p:PublishSingleFile=true `
    -p:SelfContained=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    --output $publishDir

if ($LASTEXITCODE -ne 0) {
    Write-Error "Publish failed."
    exit $LASTEXITCODE
}

Write-Host "Publish completed. Output in $publishDir" -ForegroundColor Green
Write-Host "PrimusKiosk.exe should be present for deployment." -ForegroundColor Green


