<#
.SYNOPSIS
    One-shot kiosk provisioning. Writes C:\ProgramData\Primus\device.bin
    the same way the kiosk's SetupViewModel would, without needing the
    kiosk to ever show a setup page.

.DESCRIPTION
    Replicates SetupViewModel.RegisterAsync (C#) entirely from PowerShell:
      1. Compute hardware fingerprint matching HardwareFingerprintProvider.
      2. POST /api/clientpc/register.
      3. Build a DeviceCredentials JSON (camelCase property names).
      4. DPAPI-protect with LocalMachine scope.
      5. Write base64 ciphertext to device.bin.

.PARAMETER LicenseKey
    Full 36-char UUID from the licenses table.

.PARAMETER ApiBaseUrl
    Backend root. Defaults to the prod URL the kiosk currently targets.

.PARAMETER PcName
    Human-readable name for this PC. REQUIRED. Don't default to the Windows
    machine name (e.g. DESKTOP-ACUJQ5O) — those show up in admin
    notifications + chat panels as "PC name", and an auto-generated string
    looks awful next to friendly names operators picked for their other
    kiosks ("Reception", "Booth 3", "RTN", etc.). Make the caller pick a
    real name instead of letting it fall through to a machine string.

.EXAMPLE
    .\provision_kiosk_device.ps1 -LicenseKey D0F5A91B-2C59-47F5-932C-32318DC7FF31 -PcName "Reception"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$LicenseKey,

    [string]$ApiBaseUrl = "https://api.primustech.in",

    # Mandatory — see PARAMETER PcName above for why we no longer default to
    # $env:COMPUTERNAME. If the operator runs the script without -PcName,
    # PowerShell prompts interactively for the value (the [Parameter(Mandatory)]
    # contract). Don't add a default value here.
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$PcName
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# 1. Hardware fingerprint - must match HardwareFingerprintProvider.cs.
#    Algorithm: SHA-256(UTF-8(parts joined by '|')), hex lowercase.
# ---------------------------------------------------------------------------

function Get-WmiValues($wql, $propertyName) {
    $vals = @()
    try {
        $rows = Get-CimInstance -Query $wql -ErrorAction Stop
        foreach ($r in $rows) {
            $v = $r.$propertyName
            if ($null -ne $v -and $v.ToString().Trim().Length -gt 0) {
                $vals += $v.ToString()
            }
        }
    } catch {
        Write-Verbose "WMI '$wql' failed: $($_.Exception.Message)"
    }
    return $vals
}

function Get-HardwareFingerprint {
    $parts = New-Object System.Collections.Generic.List[string]

    [void]$parts.Add([Environment]::MachineName)
    [void]$parts.Add([Environment]::OSVersion.ToString())
    [void]$parts.Add([Environment]::ProcessorCount.ToString())

    $osArch  = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
    $procArch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
    [void]$parts.Add("$osArch|$procArch")

    foreach ($v in Get-WmiValues "SELECT UUID FROM Win32_ComputerSystemProduct" "UUID")          { [void]$parts.Add($v) }
    foreach ($v in Get-WmiValues "SELECT SerialNumber FROM Win32_BIOS"          "SerialNumber") { [void]$parts.Add($v) }
    foreach ($v in Get-WmiValues "SELECT SerialNumber FROM Win32_BaseBoard"     "SerialNumber") { [void]$parts.Add($v) }
    foreach ($v in Get-WmiValues "SELECT ProcessorId FROM Win32_Processor"      "ProcessorId")  { [void]$parts.Add($v) }

    # Filter out any blank/whitespace pieces then join with pipe.
    $nonEmpty = @()
    foreach ($p in $parts) {
        if (-not [string]::IsNullOrWhiteSpace($p)) { $nonEmpty += $p }
    }
    $canonical = ($nonEmpty -join "|")

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($canonical)
        $hash  = $sha.ComputeHash($bytes)
        $hex = ([BitConverter]::ToString($hash) -replace '-', '').ToLower()
        return $hex
    } finally {
        $sha.Dispose()
    }
}

# ---------------------------------------------------------------------------
# 2. POST /api/clientpc/register
# ---------------------------------------------------------------------------

function Invoke-Register($apiBase, $name, $licenseKey, $fingerprint) {
    $url = "$($apiBase.TrimEnd('/'))/api/clientpc/register"
    $body = @{
        name = $name
        license_key = $licenseKey
        hardware_fingerprint = $fingerprint
        capabilities = @{
            screenshot = $true
            commands = $true
            heartbeat = $true
        }
    } | ConvertTo-Json -Depth 5 -Compress

    Write-Host "POST $url"
    try {
        $resp = Invoke-RestMethod -Method Post `
            -Uri $url `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 30
        return $resp
    } catch {
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            Write-Host "ERROR: HTTP $([int]$_.Exception.Response.StatusCode) $($_.Exception.Response.StatusCode)" -ForegroundColor Red
            Write-Host "BODY:  $errBody" -ForegroundColor Red
        }
        throw
    }
}

# ---------------------------------------------------------------------------
# 3. Build DeviceCredentials JSON - matches Models/DeviceCredentials.cs
#    camelCase serialization (JsonNamingPolicy.CamelCase, WriteIndented=false).
# ---------------------------------------------------------------------------

function New-DeviceCredentialsJson($pcId, $licenseKey, $deviceSecret, $fingerprint) {
    $obj = [ordered]@{
        pcId                = [string]$pcId
        licenseKey          = $licenseKey
        deviceSecret        = $deviceSecret
        hardwareFingerprint = $fingerprint
        registeredAtUtc     = (Get-Date).ToUniversalTime().ToString("o")
    }
    return ($obj | ConvertTo-Json -Depth 3 -Compress)
}

# ---------------------------------------------------------------------------
# 4. DPAPI protect with LocalMachine scope (matches DpapiProtector.cs)
# ---------------------------------------------------------------------------

function Protect-WithDpapi([string]$plaintext) {
    Add-Type -AssemblyName System.Security
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($plaintext)
    $protected = [System.Security.Cryptography.ProtectedData]::Protect(
        $bytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    return [Convert]::ToBase64String($protected)
}

# ---------------------------------------------------------------------------
# 5. Write device.bin
# ---------------------------------------------------------------------------

function Write-DeviceBin([string]$base64Ciphertext) {
    $dir = "C:\ProgramData\Primus"
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $path = Join-Path $dir "device.bin"
    [System.IO.File]::WriteAllText($path, $base64Ciphertext)
    return $path
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "=== Primus Kiosk one-shot provisioner ==="
Write-Host "ApiBaseUrl : $ApiBaseUrl"
Write-Host "PcName     : $PcName"
Write-Host "LicenseKey : $($LicenseKey.Substring(0, [Math]::Min(16, $LicenseKey.Length)))..."
Write-Host ""

Write-Host "Step 1/5: computing hardware fingerprint..."
$fp = Get-HardwareFingerprint
Write-Host "  fingerprint = $($fp.Substring(0,16))... (full length $($fp.Length))"

Write-Host ""
Write-Host "Step 2/5: registering with backend..."
$resp = Invoke-Register $ApiBaseUrl $PcName $LicenseKey $fp
$pcId = $resp.id
$deviceSecret = $resp.device_secret
if (-not $pcId -or -not $deviceSecret) {
    throw "Backend response missing 'id' or 'device_secret'. Got: $($resp | ConvertTo-Json -Compress)"
}
Write-Host "  registered as pc_id=$pcId (device_secret length=$($deviceSecret.Length))"

Write-Host ""
Write-Host "Step 3/5: building DeviceCredentials JSON..."
$json = New-DeviceCredentialsJson $pcId $LicenseKey $deviceSecret $fp
Write-Host "  plaintext JSON bytes = $($json.Length)"

Write-Host ""
Write-Host "Step 4/5: DPAPI-protecting (LocalMachine scope)..."
$ciphertext = Protect-WithDpapi $json
Write-Host "  base64 ciphertext bytes = $($ciphertext.Length)"

Write-Host ""
Write-Host "Step 5/5: writing device.bin..."
$path = Write-DeviceBin $ciphertext
Write-Host "  wrote $path"

Write-Host ""
Write-Host "DONE. Launch the kiosk now:"
Write-Host '  cd "C:\Primusbackend\Primus C#\PrimusKiosk.App\bin\Debug\net8.0-windows\win-x64"'
Write-Host '  .\PrimusClient.exe'
Write-Host ""
