

Write-Host "Adding Windows Firewall rule for Chat App (port 3001)..." -ForegroundColor Yellow

try {
 
    Remove-NetFirewallRule -DisplayName "Chat App HTTPS" -ErrorAction SilentlyContinue
    
    
    New-NetFirewallRule `
        -DisplayName "Chat App HTTPS" `
        -Direction Inbound `
        -LocalPort 3001 `
        -Protocol TCP `
        -Action Allow `
        -Profile Any `
        -Enabled True
    
    Write-Host "Firewall rule added successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now access the app from mobile devices on your network:" -ForegroundColor Cyan
    Write-Host "  https://192.168.56.1:3001" -ForegroundColor White
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please make sure you're running PowerShell as Administrator!" -ForegroundColor Yellow
}
