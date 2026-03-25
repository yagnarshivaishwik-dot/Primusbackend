@echo off
echo === Lance Backend Environment Setup ===

REM Check if .env already exists
if exist ".env" (
    echo .env file already exists.
    set /p overwrite="Do you want to overwrite it? (y/n): "
    if /i not "%overwrite%"=="y" (
        echo Skipping environment setup.
        goto :end
    )
)

REM Copy production template to .env
echo Copying environment template...
copy "env.production" ".env"

if %ERRORLEVEL% EQU 0 (
    echo Successfully created .env file!
    echo.
    echo IMPORTANT: Please edit .env file with your actual values:
    echo - Update JWT_SECRET and SECRET_KEY with secure random values
    echo - Configure SMTP settings for email functionality
    echo - Set OAuth credentials for social login
    echo - Update payment gateway credentials
    echo.
    echo The file already has ALLOW_ALL_CORS=true configured for tunnel access.
    echo.
    set /p edit="Do you want to open .env file for editing now? (y/n): "
    if /i "%edit%"=="y" (
        notepad .env
    )
) else (
    echo Failed to create .env file!
    echo Please manually copy env.production to .env
)

:end
echo.
echo Next steps:
echo 1. Edit .env file with your actual configuration values
echo 2. Run setup-cloudflare-tunnel.ps1 as Administrator to set up tunnel
echo 3. Use start-all.bat to run both backend and tunnel
echo.
pause
