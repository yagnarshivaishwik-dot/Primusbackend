@echo off
REM Launch the Primus kiosk in development mode (points at localhost backend)
set DOTNET_ENVIRONMENT=Development
start "" "C:\Primusbackend\Primus C#\PrimusKiosk.App\bin\Debug\net8.0-windows\win-x64\PrimusClient.exe"
