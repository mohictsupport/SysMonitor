# SysMonitor Deployment Script
# This script handles version bumping and provides deployment commands

param(
    [Parameter()]
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch"
)

# Read current version from package.json
$packageJson = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
$currentVersion = $packageJson.version

Write-Host "Current version: $currentVersion" -ForegroundColor Cyan

# Parse version parts
$versionParts = $currentVersion -split '\.'

$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

# Calculate new version
switch ($Bump) {
    "major" {
        $major++
        $minor = 0
        $patch = 0
    }

    "minor" {
        $minor++
        $patch = 0
    }

    "patch" {
        $patch++
    }
}

$newVersion = "$major.$minor.$patch"

Write-Host "New version: $newVersion" -ForegroundColor Green

# Update package.json
$packageJson.version = $newVersion

$jsonOutput = $packageJson | ConvertTo-Json -Depth 10

# Write without BOM using .NET (works in PowerShell 5 and 7)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonOutput)
[System.IO.File]::WriteAllBytes("package.json", $bytes)

Write-Host "OK - Updated package.json" -ForegroundColor Green

# Update README.md and AppFooter.tsx
Write-Host "Updating README.md..." -ForegroundColor Gray
node scripts/update-readme.cjs

Write-Host "Updating AppFooter.tsx..." -ForegroundColor Gray
node scripts/inject-version.cjs

Write-Host "OK - All version files updated" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "DEPLOYMENT COMMANDS" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""

# Commit changes
Write-Host "# 1. Commit changes" -ForegroundColor Gray
Write-Host "git add ." -ForegroundColor Cyan
Write-Host "git commit -m `"Release v$newVersion`"" -ForegroundColor Cyan
Write-Host "git push" -ForegroundColor Cyan
Write-Host ""

# Create tag
Write-Host "# 2. Create and push tag" -ForegroundColor Gray
Write-Host "git tag v$newVersion" -ForegroundColor Cyan
Write-Host "git push origin v$newVersion" -ForegroundColor Cyan
Write-Host ""

# Build app
Write-Host "# 3. Build and publish" -ForegroundColor Gray
Write-Host "npm run electron:build -- -p always" -ForegroundColor Cyan
Write-Host ""

# One-line deployment command
Write-Host "# 4. One line auto deploy command" -ForegroundColor Gray

$deployCommand = "git add .; git commit -m `"Release v$newVersion`"; git push; git tag v$newVersion; git push origin v$newVersion; npm run electron:build -- -p always"

Write-Host $deployCommand -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Done - Run the commands above to deploy" -ForegroundColor Green