# Ultimate Chat App - Quick HTTPS Setup for LAN Access
# Run this in PowerShell from the project directory

Write-Host "🚀 Ultimate Chat App - HTTPS LAN Setup" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Get LAN IP
$lanIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"}).IPAddress | Select-Object -First 1

if (!$lanIP) {
    Write-Host "❌ Could not detect LAN IP address" -ForegroundColor Red
    exit 1
}

Write-Host "📡 Detected LAN IP: $lanIP" -ForegroundColor Green
Write-Host ""

# Stop existing Node processes
Write-Host "🛑 Stopping existing Node processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null | Out-Null

# Create certs directory
Write-Host "📁 Creating certs directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force .\certs | Out-Null

# Add firewall rule
Write-Host "🔥 Adding Windows Firewall rule..." -ForegroundColor Yellow
$existingRule = Get-NetFirewallRule -DisplayName "Chat App HTTPS" -ErrorAction SilentlyContinue
if (!$existingRule) {
    New-NetFirewallRule -DisplayName "Chat App HTTPS" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow | Out-Null
    Write-Host "✅ Firewall rule added" -ForegroundColor Green
} else {
    Write-Host "✅ Firewall rule already exists" -ForegroundColor Green
}

# Generate certificate
Write-Host "🔐 Generating HTTPS certificate for localhost and $lanIP..." -ForegroundColor Yellow
$cert = New-SelfSignedCertificate `
  -Subject "CN=localhost" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @("2.5.29.17={text}DNS=localhost&IPAddress=$lanIP")

# Export certificate
$pwd = ConvertTo-SecureString "123456" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath ".\certs\lan-localhost.pfx" -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath ".\certs\lan-localhost.cer" -Force | Out-Null
Write-Host "✅ Certificate generated" -ForegroundColor Green

# Trust certificate
Write-Host "🔒 Trusting certificate..." -ForegroundColor Yellow
Import-Certificate -FilePath ".\certs\lan-localhost.cer" -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
Write-Host "✅ Certificate trusted" -ForegroundColor Green
Write-Host ""

# Set environment variables
$env:SSL_PFX_PATH = (Resolve-Path ".\certs\lan-localhost.pfx").Path
$env:SSL_PFX_PASSPHRASE = "123456"
$env:PORT = "3001"

# Display access URLs
Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🎉 Setup Complete!                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access URLs:" -ForegroundColor Yellow
Write-Host "  📱 On this PC:       https://localhost:3001" -ForegroundColor White
Write-Host "  📱 On LAN devices:   https://$lanIP:3001" -ForegroundColor White
Write-Host ""
Write-Host "Note: Mobile devices will show a certificate warning." -ForegroundColor Gray
Write-Host "      Click 'Advanced' → 'Proceed' to continue." -ForegroundColor Gray
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Yellow
Write-Host ""

# Start the app
npm start
