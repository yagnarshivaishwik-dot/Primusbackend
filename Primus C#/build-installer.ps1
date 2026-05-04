#Requires -Version 5.1
<#
.SYNOPSIS
    End-to-end Primus Client installer build with automatic version bump.

.DESCRIPTION
    Every invocation:
      1. Reads `version.txt` (semver, e.g. 1.0.2)
      2. Increments the PATCH component unless -SkipVersionBump is passed
      3. Writes the new version back to `version.txt`
      4. Prepends a dated entry to `CHANGELOG.md` (use -Message to provide notes)
      5. Runs tests (skippable with -SkipTests)
      6. Publishes self-contained single-file PrimusClient.exe to .\app
      7. Compiles the Inno Setup installer into .\installer\output with the new version

    The version is threaded through to:
      - dotnet publish  (via -p:Version / -p:FileVersion / -p:AssemblyVersion)
      - Inno Setup      (via `/DAppVersion=<ver>` preprocessor define)

.PARAMETER Configuration
    Debug or Release. Defaults to Release.

.PARAMETER Message
    Changelog entry text for this build. Defaults to "Automated rebuild."

.PARAMETER SkipTests
    Skip dotnet test.

.PARAMETER SkipVersionBump
    Rebuild without incrementing the version. Useful for re-running a failed build.

.PARAMETER BumpMinor
    Increment MINOR (and reset PATCH to 0) instead of PATCH.

.PARAMETER BumpMajor
    Increment MAJOR (and reset MINOR + PATCH to 0) instead of PATCH.

.EXAMPLE
    pwsh .\build-installer.ps1
    pwsh .\build-installer.ps1 -Message "Fixed HMAC replay edge case"
    pwsh .\build-installer.ps1 -BumpMinor -Message "Added launch_app command"
    pwsh .\build-installer.ps1 -SkipTests -SkipVersionBump
#>
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',

    [string]$Runtime = 'win-x64',

    [string]$Message = 'Automated rebuild.',

    [switch]$SkipTests,

    [switch]$SkipVersionBump,

    [switch]$BumpMinor,

    [switch]$BumpMajor
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root          = Split-Path -Parent $MyInvocation.MyCommand.Path
$versionFile   = Join-Path $root 'version.txt'
$changelogFile = Join-Path $root 'CHANGELOG.md'
$solution      = Join-Path $root 'PrimusKiosk.sln'
$appProject    = Join-Path $root 'PrimusKiosk.App\PrimusKiosk.App.csproj'
$tests         = Join-Path $root 'PrimusKiosk.Tests\PrimusKiosk.Tests.csproj'
$installer     = Join-Path $root 'installer\primus-client.iss'
$appDir        = Join-Path $root 'app'
$installerDir  = Join-Path $root 'installer\output'
$webDir        = Join-Path $root 'web'           # staged React dist/ (shipped to {app}\web\)

# Locate the React build output in priority order:
#   1. ClutcHH-1/dist at the STIC-SOFT root (current UI source)
#   2. Any PrimusClient/dist fallback (legacy Tauri UI)
#   3. Already-staged web/ dir next to this script
$repoRoot       = Split-Path -Parent (Split-Path -Parent $root)
$sticRoot       = Split-Path -Parent $repoRoot
$reactCandidates = @(
    (Join-Path $sticRoot 'ClutcHH-1\dist'),
    (Join-Path $repoRoot 'ClutcHH-1\dist'),
    (Join-Path $repoRoot 'Primusbackend\.claude\worktrees\nervous-goldwasser\PrimusClient\dist'),
    (Join-Path (Split-Path -Parent $repoRoot) 'PrimusClient\dist')
)
$reactDistDir = $null
foreach ($c in $reactCandidates) {
    if ($c -and (Test-Path (Join-Path $c 'index.html'))) {
        $reactDistDir = $c
        break
    }
}

# ---------------------------------------------------------------------------
# Version bump
# ---------------------------------------------------------------------------
if (-not (Test-Path $versionFile)) {
    '1.0.0' | Set-Content -LiteralPath $versionFile -NoNewline
}
$currentVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ($currentVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "version.txt contains invalid semver '$currentVersion'. Expected MAJOR.MINOR.PATCH."
}

$parts = $currentVersion -split '\.'
[int]$major = $parts[0]
[int]$minor = $parts[1]
[int]$patch = $parts[2]

if (-not $SkipVersionBump) {
    if ($BumpMajor)      { $major++; $minor = 0; $patch = 0 }
    elseif ($BumpMinor)  { $minor++; $patch = 0 }
    else                 { $patch++ }
}

$newVersion = "$major.$minor.$patch"

Write-Host "===== Primus Client build =====" -ForegroundColor Cyan
Write-Host "Previous version : $currentVersion"
Write-Host "New version      : $newVersion"
Write-Host "Configuration    : $Configuration"
Write-Host "Runtime          : $Runtime"
Write-Host "Root             : $root"
Write-Host ""

if (-not $SkipVersionBump) {
    [System.IO.File]::WriteAllText($versionFile, $newVersion, [System.Text.UTF8Encoding]::new($false))
    Write-Host "    version.txt -> $newVersion" -ForegroundColor DarkGray

    # Prepend a new changelog entry. UTF-8 without BOM; ensure a blank line
    # separates every release block.
    $today = Get-Date -Format 'yyyy-MM-dd'
    $emdash = [char]0x2014
    $entry = "## v$newVersion $emdash $today`r`n`r`n- $Message`r`n`r`n"

    if (Test-Path $changelogFile) {
        $existing = [System.IO.File]::ReadAllText($changelogFile, [System.Text.UTF8Encoding]::new($false))
        $headerMatch = [regex]::Match($existing, '(?ms)^.*?(?=^## )')
        if ($headerMatch.Success -and $headerMatch.Length -gt 0) {
            $header = $headerMatch.Value
            $rest   = $existing.Substring($headerMatch.Length)
            $updated = $header + $entry + $rest
        }
        else {
            $updated = $entry + $existing
        }
        [System.IO.File]::WriteAllText($changelogFile, $updated, [System.Text.UTF8Encoding]::new($false))
    }
    else {
        $initial = "# Primus Client $emdash Changelog`r`n`r`n" + $entry
        [System.IO.File]::WriteAllText($changelogFile, $initial, [System.Text.UTF8Encoding]::new($false))
    }

    Write-Host "    CHANGELOG.md -> entry added" -ForegroundColor DarkGray
    Write-Host ""
}

# ---------------------------------------------------------------------------
# 1. Tests
# ---------------------------------------------------------------------------
if (-not $SkipTests) {
    Write-Host "[1/4] Running unit tests..." -ForegroundColor Cyan
    dotnet test $tests -c $Configuration --verbosity minimal
    if ($LASTEXITCODE -ne 0) { throw "Tests failed ($LASTEXITCODE)" }
    Write-Host ""
}
else {
    Write-Host "[1/4] Tests skipped (--SkipTests)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 1b. Stage React dist → web/  (ISCC reads web\ to ship to {app}\web\)
# ---------------------------------------------------------------------------
Write-Host "[1b] Staging React UI to $webDir ..." -ForegroundColor Cyan

# Guard against $reactDistDir being $null when none of the candidate paths
# resolved (happens when this script runs from a deep worktree where
# Split-Path -Parent walks past the STIC-SOFT root). Test-Path $null throws.
if ($reactDistDir -and (Test-Path $reactDistDir)) {
    if (Test-Path $webDir) { Remove-Item $webDir -Recurse -Force }
    Copy-Item -Path $reactDistDir -Destination $webDir -Recurse -Force
    Write-Host "    React dist staged from $reactDistDir" -ForegroundColor DarkGray
}
else {
    if ($reactDistDir) {
        Write-Host "    React dist not found at $reactDistDir" -ForegroundColor Yellow
    } else {
        Write-Host "    No React dist candidate path resolved (likely running from a worktree)." -ForegroundColor Yellow
    }
    Write-Host "    Checking existing $webDir ..." -ForegroundColor Yellow
    if (-not (Test-Path (Join-Path $webDir 'index.html'))) {
        Write-Host "    WARNING: $webDir\index.html missing. Run 'npm run build' in PrimusClient/ first, or copy dist/ to $webDir" -ForegroundColor Yellow
    } else {
        Write-Host "    Using pre-staged $webDir" -ForegroundColor DarkGray
    }
}
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Publish
# ---------------------------------------------------------------------------
Write-Host "[2/4] Publishing PrimusClient.exe $newVersion to $appDir ..." -ForegroundColor Cyan
if (Test-Path $appDir) { Remove-Item $appDir -Recurse -Force }
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

$assemblyVersion = "$major.$minor.$patch.0"

dotnet publish $appProject `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -p:PublishReadyToRun=true `
    -p:PublishTrimmed=false `
    -p:DebugType=embedded `
    -p:Version=$newVersion `
    -p:FileVersion=$assemblyVersion `
    -p:AssemblyVersion=$assemblyVersion `
    -p:InformationalVersion=$newVersion `
    -o $appDir

if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed ($LASTEXITCODE)" }

$exe = Join-Path $appDir 'PrimusClient.exe'
if (-not (Test-Path $exe)) {
    throw "Expected PrimusClient.exe missing at $exe. Verify PrimusKiosk.App.csproj AssemblyName."
}
$exeSize = [Math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "    -> $exe ($exeSize MB)"

$requiredCfg = @('appsettings.json', 'appsettings.Production.json', 'appsettings.Development.json')
foreach ($cfg in $requiredCfg) {
    $p = Join-Path $appDir $cfg
    if (-not (Test-Path $p)) { throw "Missing config file after publish: $cfg" }
}
Write-Host ""

# ---------------------------------------------------------------------------
# 3. Locate ISCC
# ---------------------------------------------------------------------------
Write-Host "[3/4] Locating Inno Setup compiler..." -ForegroundColor Cyan
$iscc = $null
$candidates = @(
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 5\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 5\ISCC.exe"
)
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $iscc = $c; break }
}
if (-not $iscc) {
    $onPath = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue
    if ($onPath) { $iscc = $onPath.Source }
}
if (-not $iscc) {
    Write-Host "    Inno Setup compiler (ISCC.exe) not found." -ForegroundColor Yellow
    Write-Host "    Install from https://jrsoftware.org/isdl.php then re-run this script." -ForegroundColor Yellow
    Write-Host "    Publish output is ready at: $appDir" -ForegroundColor Yellow
    exit 0
}
Write-Host "    Found: $iscc"
Write-Host ""

# ---------------------------------------------------------------------------
# 4. Compile installer (version threaded via /DAppVersion)
# ---------------------------------------------------------------------------
Write-Host "[4/4] Compiling installer $newVersion to $installerDir ..." -ForegroundColor Cyan
if (Test-Path $installerDir) { Remove-Item $installerDir -Recurse -Force }
New-Item -ItemType Directory -Path $installerDir -Force | Out-Null

& $iscc "/DAppVersion=$newVersion" $installer
if ($LASTEXITCODE -ne 0) { throw "ISCC failed ($LASTEXITCODE)" }

Write-Host ""
Write-Host "===== Build complete (v$newVersion) =====" -ForegroundColor Green
Get-ChildItem -Path $installerDir -Filter "PrimusInstaller-*.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 |
    ForEach-Object {
        $sizeMB = [Math]::Round($_.Length / 1MB, 1)
        Write-Host ("Installer: {0} ({1} MB)" -f $_.FullName, $sizeMB)
    }

Write-Host ""
Write-Host "All artifacts under: $root" -ForegroundColor Green
Write-Host "Changelog at       : $changelogFile" -ForegroundColor Green
