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
$packageJson | ConvertTo-Json -Depth 10 | Set-Content -Path "package.json" -Encoding UTF8
Write-Host "OK - Updated package.json" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "DEPLOYMENT COMMANDS" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "# 1. Update version in package.json" -ForegroundColor Gray
Write-Host "#    Already done - bumped to v$newVersion" -ForegroundColor Gray
Write-Host ""
Write-Host "# 2. Commit changes" -ForegroundColor Gray
Write-Host "git add ." -ForegroundColor Cyan
Write-Host "git commit -m Release v$newVersion" -ForegroundColor Cyan
Write-Host "git push" -ForegroundColor Cyan
Write-Host ""
Write-Host "# 3. Create and push tag" -ForegroundColor Gray
Write-Host "git tag v$newVersion" -ForegroundColor Cyan
Write-Host "git push origin v$newVersion" -ForegroundColor Cyan
Write-Host ""
Write-Host "# 4. Build and publish" -ForegroundColor Gray
Write-Host "set GH_TOKEN=your_token" -ForegroundColor Cyan
Write-Host "npm run electron:build" -ForegroundColor Cyan
Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Done - Run the commands above to deploy" -ForegroundColor Green
