# 📱 Complete Guide to Connect from Mobile Phone

## Step 1: Check Your Phone's Network

**On your phone:**
1. Open Settings → Wi-Fi
2. Look at which Wi-Fi network you're connected to
3. **Write down the Wi-Fi name (SSID)**

**On your PC:**
1. Open Settings → Network & Internet → Wi-Fi
2. Look at which Wi-Fi network you're connected to
3. **Make sure it's the EXACT SAME Wi-Fi as your phone**

⚠️ **IMPORTANT:** If they're on different Wi-Fi networks, connect your phone to the **same Wi-Fi** as your PC first!

---

## Step 2: Find Your PC's Wi-Fi IP

Run this in PowerShell:

```powershell
$wifiIP = (Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null} | Select-Object -ExpandProperty IPv4Address).IPAddress
Write-Host "Your PC's Wi-Fi IP: $wifiIP"
```

Write down that IP. Example: `10.46.20.218`

---

## Step 3: Kill Old Server and Start Fresh

```powershell
cd C:\Users\dell\Downloads\message
taskkill /F /IM node.exe 2>$null
Start-Sleep -Seconds 2

# Set environment variables
$env:SSL_PFX_PATH = (Resolve-Path ".\certs\lan-localhost.pfx").Path
$env:SSL_PFX_PASSPHRASE = "123456"
$env:PORT = "3001"
$env:HOST = "0.0.0.0"

# Start server
npm start
```

Wait for this message to appear:
```
✓ Real-time messaging
✓ Online users tracking
```

---

## Step 4: Connect from Phone

**On your phone browser:**
1. Open: `https://YOUR_WIFI_IP:3001`
   - Replace `YOUR_WIFI_IP` with the IP from Step 2
   - Example: `https://10.46.20.218:3001`

2. You'll see certificate warning:
   - Click "Advanced"
   - Click "Proceed to 10.46.20.218" (or whatever your IP is)

3. **You should now see the chat app!**

---

## If Still Not Working - Troubleshooting

### Check 1: Are you on the SAME Wi-Fi?
```powershell
# Run on PC
ipconfig | findstr "Wi-Fi" -A 5

# Phone: Settings → Wi-Fi → see network name
# They must match!
```

### Check 2: Is server actually listening?
```powershell
netstat -ano | findstr ":3001"
# Should show: TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING
```

### Check 3: Firewall again (run as Admin)
```powershell
New-NetFirewallRule -DisplayName "Chat App HTTP" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -Profile Any
```

### Check 4: Can you ping your PC from phone?
On phone, open a command app and try:
```
ping YOUR_PC_WIFI_IP
```
If you get "Timeout" or "Unreachable", the networks aren't connected.

---

## Nuclear Option - Try HTTP (Temporary Testing)

If HTTPS still fails, test with plain HTTP first:

```powershell
cd C:\Users\dell\Downloads\message
taskkill /F /IM node.exe 2>$null
$env:PORT = "3001"
npm start
```

Then on phone browser try: `http://10.46.20.218:3001` (no HTTPS)

If HTTP works but HTTPS doesn't, it's a certificate issue (easier to fix).
If even HTTP doesn't work, it's a network/firewall issue.
