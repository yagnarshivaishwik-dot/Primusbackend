# Secret Rotation Verification Script (PowerShell)
# This script verifies that all required secrets are set and not using default values

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Secret Rotation Verification" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$Errors = 0
$Warnings = 0

function Check-Var {
    param(
        [string]$VarName,
        [bool]$IsSecret = $false
    )
    
    $value = [Environment]::GetEnvironmentVariable($VarName)
    
    if ([string]::IsNullOrEmpty($value)) {
        Write-Host "❌ $VarName is NOT SET" -ForegroundColor Red
        $script:Errors++
        return $false
    }
    
    # Check for default/weak values
    $weakPatterns = @("changeme", "your-", "dev-", "test-", "supersecret", "default-")
    $isWeak = $false
    
    foreach ($pattern in $weakPatterns) {
        if ($value -like "*$pattern*") {
            $isWeak = $true
            break
        }
    }
    
    if ($isWeak) {
        Write-Host "⚠️  $VarName is set but may be using a default/weak value" -ForegroundColor Yellow
        $script:Warnings++
    } else {
        if ($IsSecret) {
            if ($value.Length -gt 8) {
                $preview = $value.Substring(0, 4) + "..." + $value.Substring($value.Length - 4)
                Write-Host "✅ $VarName is set ($preview)" -ForegroundColor Green
            } else {
                Write-Host "⚠️  $VarName is set but seems too short" -ForegroundColor Yellow
                $script:Warnings++
            }
        } else {
            Write-Host "✅ $VarName is set" -ForegroundColor Green
        }
    }
    
    return $true
}

function Check-Exposed {
    param([string]$VarName)
    
    $value = [Environment]::GetEnvironmentVariable($VarName)
    
    if ([string]::IsNullOrEmpty($value)) {
        return
    }
    
    $exposedValues = @(
        "wfcq egau rthj wlgj",
        "760371470519-ma43dvpeogg1e3nf4ud5l8q1hnqlr155",
        "496813374696-q63fi7dr27q34hvgk6d8tolsv8rtitdg"
    )
    
    foreach ($exposed in $exposedValues) {
        if ($value -eq $exposed) {
            Write-Host "❌ $VarName contains EXPOSED SECRET - MUST BE ROTATED" -ForegroundColor Red
            $script:Errors++
            return
        }
    }
}

Write-Host "Checking required environment variables..." -ForegroundColor Cyan
Write-Host ""

Check-Var "SECRET_KEY" -IsSecret $true
Check-Exposed "SECRET_KEY"

Check-Var "JWT_SECRET" -IsSecret $true
Check-Exposed "JWT_SECRET"

Check-Var "DATABASE_URL" -IsSecret $false

# Check POSTGRES_PASSWORD if using PostgreSQL
$dbUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
if ($dbUrl -and $dbUrl -like "postgresql://*") {
    Check-Var "POSTGRES_PASSWORD" -IsSecret $true
    Check-Exposed "POSTGRES_PASSWORD"
}

Write-Host ""
Write-Host "Checking OAuth credentials..." -ForegroundColor Cyan
Check-Var "GOOGLE_CLIENT_ID" -IsSecret $false
Check-Exposed "GOOGLE_CLIENT_ID"

Check-Var "GOOGLE_CLIENT_SECRET" -IsSecret $true
Check-Exposed "GOOGLE_CLIENT_SECRET"

Write-Host ""
Write-Host "Checking email configuration..." -ForegroundColor Cyan
Check-Var "MAIL_PASSWORD" -IsSecret $true
Check-Exposed "MAIL_PASSWORD"

Write-Host ""
Write-Host "Checking security configuration..." -ForegroundColor Cyan
Check-Var "ALLOWED_REDIRECTS" -IsSecret $false
Check-Var "MAX_FAILED_LOGIN_ATTEMPTS" -IsSecret $false
Check-Var "LOCKOUT_DURATION_MINUTES" -IsSecret $false
Check-Var "RATE_LIMIT_PER_MINUTE" -IsSecret $false
Check-Var "ENABLE_CSRF_PROTECTION" -IsSecret $false

Write-Host ""
Write-Host "Checking environment..." -ForegroundColor Cyan
$env = [Environment]::GetEnvironmentVariable("ENVIRONMENT")
if ([string]::IsNullOrEmpty($env)) {
    $env = "development"
}

if ($env -eq "production") {
    Write-Host "✅ ENVIRONMENT is set to production" -ForegroundColor Green
    
    $allowAllCors = [Environment]::GetEnvironmentVariable("ALLOW_ALL_CORS")
    if ($allowAllCors -eq "true") {
        Write-Host "❌ ALLOW_ALL_CORS is true in production - SECURITY RISK" -ForegroundColor Red
        $Errors++
    } else {
        Write-Host "✅ ALLOW_ALL_CORS is false (correct for production)" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  ENVIRONMENT is not set to production (current: $env)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if ($Errors -eq 0 -and $Warnings -eq 0) {
    Write-Host "✅ All checks passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Run database migrations: alembic upgrade head"
    Write-Host "2. Restart application"
    Write-Host "3. Verify functionality"
    exit 0
} elseif ($Errors -eq 0) {
    Write-Host "⚠️  Checks passed with $Warnings warning(s)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Review warnings above and ensure all values are properly configured."
    exit 0
} else {
    Write-Host "❌ Verification failed with $Errors error(s) and $Warnings warning(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please fix the errors above before proceeding with deployment."
    exit 1
}

