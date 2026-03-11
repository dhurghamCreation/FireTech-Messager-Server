

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Mobile Connection Setup - Complete   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""


Write-Host "Finding your PC Wi-Fi IP address..." -ForegroundColor Yellow
$wifiIP = $null
try {
    $wifiIP = (Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -ne $null
    } | Select-Object -ExpandProperty IPv4Address).IPAddress | Where-Object {$_ -like "10.*" -or $_ -like "192.168.*"}
}
catch {}

if (!$wifiIP) {
    Write-Host "Could not find Wi-Fi IP automatically" -ForegroundColor Red
    Write-Host "   Run: ipconfig" -ForegroundColor Yellow
    Write-Host "   Look for your Wi-Fi adapter IP (usually 10.x.x.x or 192.168.x.x)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found Wi-Fi IP: $wifiIP" -ForegroundColor Green
Write-Host ""


Write-Host "Stopping existing servers..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null | Out-Null
Start-Sleep -Seconds 2
Write-Host "OK - Stopped" -ForegroundColor Green
Write-Host ""


Write-Host "Checking certificate..." -ForegroundColor Yellow
$pfxPath = "C:\Users\dell\Downloads\message\certs\lan-localhost.pfx"
if (!(Test-Path $pfxPath)) {
    Write-Host "Certificate file not found!" -ForegroundColor Red
    Write-Host "   Run: npm run https" -ForegroundColor Yellow
    exit 1
}
Write-Host "OK - Certificate ready" -ForegroundColor Green
Write-Host ""


Write-Host "Adding firewall rule..." -ForegroundColor Yellow
try {
    Remove-NetFirewallRule -DisplayName "Chat App 3001" -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName "Chat App 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -Profile Any | Out-Null
    Write-Host "OK - Firewall configured" -ForegroundColor Green
} catch {
    Write-Host "Warning: Firewall rule failed (may need admin)" -ForegroundColor Yellow
}
Write-Host ""


Write-Host "Starting server..." -ForegroundColor Yellow
Write-Host ""

Set-Location "C:\Users\dell\Downloads\message"
$env:SSL_PFX_PATH = $pfxPath
$env:SSL_PFX_PASSPHRASE = "123456"
$env:PORT = "3001"
$env:HOST = "0.0.0.0"

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║        MOBILE CONNECTION INFO         ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
Write-Host "Open on your phone (same Wi-Fi):" -ForegroundColor White
Write-Host "  https://$wifiIP:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "If you see a certificate warning:" -ForegroundColor White
Write-Host "  1. Click Advanced" -ForegroundColor Gray
Write-Host "  2. Click Proceed to the IP shown above" -ForegroundColor Gray
Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor White
Write-Host "  Can't connect? Make sure phone is on SAME Wi-Fi" -ForegroundColor Gray
Write-Host "  Check: ipconfig (on PC) vs Settings WiFi (on phone)" -ForegroundColor Gray
Write-Host ""

npm start
