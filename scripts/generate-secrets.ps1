# Generate Strong Secrets for Application (PowerShell)
# This script generates cryptographically secure secrets for use in the application

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Secret Generation Tool" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script generates strong secrets for:"
Write-Host "  - SECRET_KEY"
Write-Host "  - JWT_SECRET"
Write-Host "  - POSTGRES_PASSWORD"
Write-Host ""
Write-Host "Generated secrets are suitable for production use."
Write-Host ""

function Generate-Secret {
    param([int]$Length = 32)
    
    # Use .NET cryptography for secure random generation
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    
    # Convert to base64url-safe string
    $base64 = [Convert]::ToBase64String($bytes)
    $base64 = $base64.Replace('+', '-').Replace('/', '_').Replace('=', '')
    
    return $base64
}

Write-Host "Generating secrets..." -ForegroundColor Cyan
Write-Host ""

# Generate SECRET_KEY (32 bytes)
$SECRET_KEY = Generate-Secret -Length 32
Write-Host "SECRET_KEY=$SECRET_KEY" -ForegroundColor Green
Write-Host ""

# Generate JWT_SECRET (32 bytes)
$JWT_SECRET = Generate-Secret -Length 32
Write-Host "JWT_SECRET=$JWT_SECRET" -ForegroundColor Green
Write-Host ""

# Generate POSTGRES_PASSWORD (32 bytes)
$POSTGRES_PASSWORD = Generate-Secret -Length 32
Write-Host "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Copy these values to your .env file:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "SECRET_KEY=$SECRET_KEY"
Write-Host "JWT_SECRET=$JWT_SECRET"
Write-Host "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
Write-Host ""
Write-Host "⚠️  IMPORTANT:" -ForegroundColor Yellow
Write-Host "  - Store these secrets securely"
Write-Host "  - Never commit them to version control"
Write-Host "  - Use a password manager or secrets management system"
Write-Host "  - Rotate secrets regularly (every 90 days)"
Write-Host ""

$save = Read-Host "Save to .env.secrets.generated? (y/N)"
if ($save -eq "y" -or $save -eq "Y") {
    $content = @"
# Generated secrets - DO NOT COMMIT TO VERSION CONTROL
# Generated on: $(Get-Date)
SECRET_KEY=$SECRET_KEY
JWT_SECRET=$JWT_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
"@
    $content | Out-File -FilePath ".env.secrets.generated" -Encoding UTF8
    Write-Host "✅ Secrets saved to .env.secrets.generated" -ForegroundColor Green
    Write-Host "⚠️  Remember to add .env.secrets.generated to .gitignore" -ForegroundColor Yellow
}

