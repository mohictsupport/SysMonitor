# Self-Signed Code Signing Certificate Generator for SysMonitor
# Run this script as Administrator to generate a certificate for signing the app

param(
    [string]$CertName = "SysMonitor",
    [string]$Password = "SysMonitor123!",
    [string]$OutputPath = "certs"
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "SysMonitor Self-Signed Certificate Generator" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Create certs directory if it doesn't exist
if (!(Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    Write-Host "Created directory: $OutputPath" -ForegroundColor Green
}

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator. Certificate will be created but won't be trusted system-wide." -ForegroundColor Yellow
}

Write-Host "Generating self-signed code signing certificate..." -ForegroundColor Yellow

# Generate self-signed certificate
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=$CertName" `
    -FriendlyName "SysMonitor Code Signing" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyUsage DigitalSignature `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" `
    -NotAfter (Get-Date).AddYears(5)

if ($cert) {
    Write-Host "Certificate created successfully!" -ForegroundColor Green
    Write-Host "Subject: $($cert.Subject)" -ForegroundColor Gray
    Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
    Write-Host "Valid until: $($cert.NotAfter)" -ForegroundColor Gray
    Write-Host ""
    
    # Export to PFX file
    $pfxPath = "$OutputPath\sysmonitor-cert.pfx"
    $securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText
    
    Export-PfxCertificate `
        -Cert $cert `
        -FilePath $pfxPath `
        -Password $securePassword | Out-Null
    
    Write-Host "Exported certificate to: $pfxPath" -ForegroundColor Green
    Write-Host ""
    
    # Export public certificate for distribution
    $cerPath = "$OutputPath\sysmonitor-cert.cer"
    Export-Certificate `
        -Cert $cert `
        -FilePath $cerPath `
        -Type CERT | Out-Null
    
    Write-Host "Exported public cert to: $cerPath" -ForegroundColor Green
    Write-Host ""
    
    # Instructions
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. The certificate has been exported to: $pfxPath" -ForegroundColor White
    Write-Host "2. Certificate password: $Password" -ForegroundColor White
    Write-Host ""
    Write-Host "3. The build configuration in package.json is already set up." -ForegroundColor White
    Write-Host "4. Run 'npm run electron:build' to sign the installer." -ForegroundColor White
    Write-Host ""
    Write-Host "TO INSTALL THE CERTIFICATE ON OTHER MACHINES:" -ForegroundColor Yellow
    Write-Host "- Copy $cerPath to the target machine" -ForegroundColor Gray
    Write-Host "- Double-click the .cer file and install to 'Trusted Root Certification Authorities'" -ForegroundColor Gray
    Write-Host "- This eliminates the 'Unknown Publisher' warning" -ForegroundColor Gray
    Write-Host ""
    
} else {
    Write-Host "ERROR: Failed to create certificate!" -ForegroundColor Red
    exit 1
}
