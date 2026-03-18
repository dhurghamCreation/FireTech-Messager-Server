#  Ultimate Chat App

A modern, feature-rich real-time chat application built with Socket.IO, Express, and vanilla JavaScript.

##  Features

### Core Functionality
-  **Real-time Messaging** - Instant message delivery using WebSocket technology
-  **Online Users List** - See who's currently active in the chat
-  **Typing Indicators** - Know when someone is typing a message
-  **Message History** - New users can see the last 50 messages
-  **Persistent Sessions** - Messages are saved during the session

### User Experience
-  **Modern UI/UX** - Beautiful gradient design with smooth animations
-  **Dark/Light Theme** - Toggle between themes, preference saved locally
-  **Emoji Support** - Built-in emoji picker with popular emojis
-  **Sound Notifications** - Audio alerts for new messages
-  **Smart Timestamps** - Dynamic time display (just now, X mins ago, etc.)
-  **Mobile Responsive** - Works perfectly on all device sizes
-  **User Avatars** - Auto-generated avatars with first letter of username

### UI Features
- Smooth fade-in animations for messages
- Auto-scroll to latest messages
- Custom scrollbar design
- Clean, organized message bubbles
- Distinct styling for own vs others' messages
- System notifications for user joins/leaves
- Professional header with action buttons

##  Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Navigate to the project directory:
```bash
cd message
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

###  Quick HTTPS Setup for LAN Access (Windows)

Run this **one command** in PowerShell to set up HTTPS with automatic certificate generation and firewall configuration:

```powershell
.\setup-https.ps1
```

Or using npm:

```powershell
npm run https
```

This will:
-  Auto-detect your LAN IP
-  Generate trusted HTTPS certificate
-  Configure Windows Firewall
-  Start the app on `https://localhost:3001`
-  Enable LAN access from mobile devices

##  Enable HTTPS

The server now supports HTTPS automatically when you provide certificate paths.

### 1) Create or obtain certificates

- **Development (self-signed):** use OpenSSL or `mkcert`
- **Production:** use a trusted cert (for example Let's Encrypt)

### 2) Set environment variables

Windows PowerShell:

```powershell
$env:SSL_KEY_PATH="C:\path\to\key.pem"
$env:SSL_CERT_PATH="C:\path\to\cert.pem"
$env:PORT="3000"
npm start
```

Without `SSL_KEY_PATH` and `SSL_CERT_PATH`, the app falls back to HTTP.

### Windows-only quick setup (no OpenSSL/mkcert required)

You can create a local `.pfx` certificate with built-in PowerShell commands:

```powershell
cd C:\Users\dell\Downloads\message
New-Item -ItemType Directory -Force certs | Out-Null
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\CurrentUser\My"
$pwd = ConvertTo-SecureString -String "123456" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\certs\localhost.pfx" -Password $pwd

$env:SSL_PFX_PATH="C:\Users\dell\Downloads\message\certs\localhost.pfx"
$env:SSL_PFX_PASSPHRASE="123456"
$env:PORT="3001"
npm start
```

Open:

```
https://localhost:3001
```

If browser warns about certificate trust, continue for local development.

### 3) Open HTTPS URL

```
https://localhost:3000
```

For self-signed certificates, your browser will show a warning unless the cert is trusted locally.

##  Allow connections beyond localhost

The server now listens on `0.0.0.0` by default, so devices on your network can connect.

### LAN access (same Wi-Fi/network)

**Step 1:** Find your PC's LAN IP address:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254.*"}).IPAddress
```

Example output: `192.168.1.25`

**Step 2:** Allow firewall for the app port:

```powershell
New-NetFirewallRule -DisplayName "Chat App HTTPS" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

**Step 3:** Generate cert for both localhost and LAN IP:

```powershell
cd C:\Users\dell\Downloads\message
taskkill /F /IM node.exe


$cert = New-SelfSignedCertificate `
  -Subject "CN=localhost" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @("2.5.29.17={text}DNS=localhost&IPAddress=192.168.56.1")

$pwd = ConvertTo-SecureString "123456" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath ".\certs\lan-localhost.pfx" -Password $pwd
Export-Certificate -Cert $cert -FilePath ".\certs\lan-localhost.cer" -Force
Import-Certificate -FilePath ".\certs\lan-localhost.cer" -CertStoreLocation "Cert:\CurrentUser\Root"

$env:SSL_PFX_PATH = (Resolve-Path ".\certs\lan-localhost.pfx").Path
$env:SSL_PFX_PASSPHRASE = "123456"
$env:PORT = "3001"
npm start
```

**Step 4:** Open from any device on your network:
   - On same PC: `https://localhost:3001`
   - On mobile/other PC: `https://192.168.56.1:3001` (use your actual IP)

**Note:** Mobile devices will show cert warning (self-signed). Click "Advanced" → "Proceed" for local testing.

### Internet access (different networks) - RECOMMENDED: Use Cloud Deployment

For users on different internet connections (cellular, other Wi-Fi), **deploy to a free cloud service** instead of exposing your home network:

| Option | Difficulty | Cost | HTTPS | Best For |
|--------|-----------|------|-------|----------|
| Railway |  Easy | Free tier |  Auto | Quick deployment, beginners |
| Render |  Easy | Free tier |  Auto | Static projects, free hosting |
| Self-host (DuckDNS+Caddy) |  Hard | Free |  Auto | Learning, full control |

####  Option 1: Deploy to Railway (Easiest - Free HTTPS + Domain)

1. Create account at https://railway.app
2. Install Railway CLI:
   ```powershell
   npm install -g @railway/cli
   ```
3. Deploy:
   ```powershell
   cd C:\Users\dell\Downloads\message
   railway login
   railway init
   railway up
   ```
4. Get your public URL:
   ```powershell
   railway domain
   ```
5. Share the URL (automatic HTTPS included!)

####  Option 2: Deploy to Render (Free tier available)

1. Create account at https://render.com
2. Click "New" → "Web Service"
3. Connect your GitHub repo (or upload via dashboard)
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Deploy and get free `.onrender.com` HTTPS URL

####  Option 3: Self-host with proper domain (Advanced)

For advanced users who want to host from home with a real domain:

**Requirements:**
- Static public IP or dynamic DNS (DuckDNS)
- Router port forwarding access
- Reverse proxy (Caddy recommended for auto-HTTPS)

**Steps:**
1. Get free domain: https://www.duckdns.org
2. Install Caddy on Windows: https://caddyserver.com/docs/install
3. Configure router port forward: `80` and `443` → your PC
4. Edit `Caddyfile` (included in project) with your domain
5. Run your Node app: `npm start`
6. Run Caddy in another terminal: `caddy run`
7. Caddy automatically gets Let's Encrypt certificate!

**Security Note:** Self-hosting exposes your home network. Use strong passwords, keep software updated, and consider a VPS instead.

##  How to Use

1. **Join the Chat**
   - Enter your desired username when prompted
   - Click "Join Chat" or press Enter

2. **Send Messages**
   - Type your message in the input field
   - Click the send button or press Enter
   - Your messages appear on the right (blue)
   - Others' messages appear on the left (gray)

3. **Use Emojis**
   - Click the emoji button (smiley face icon)
   - Select from popular emojis
   - Emojis are added to your message

4. **Switch Themes**
   - Click "Toggle Theme" in the sidebar
   - Your preference is saved automatically

5. **View Online Users**
   - Check the sidebar to see all active users
   - Your name is highlighted
   - Green dot indicates online status

6. **Clear Chat**
   - Click the trash icon in the header
   - Confirm to clear all messages (local only)

##  Project Structure

```
message/
├── index.html        # Main HTML with embedded CSS
├── client.js         # Client-side JavaScript & Socket.IO logic
├── server.js         # Express server & Socket.IO backend
├── package.json      # Project dependencies
├── README.md         # This file
├── setup-https.ps1   # Quick HTTPS setup script for Windows
├── railway.json      # Railway deployment config
├── render.yaml       # Render deployment config
├── Caddyfile         # Caddy reverse proxy config (for self-hosting)
├── .gitignore        # Git ignore rules
└── certs/            # Local HTTPS certificates (auto-generated)
```

##  Technologies Used

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Icons**: Font Awesome 6
- **Real-time Communication**: Socket.IO (WebSocket)

##  Design Highlights

### Color Scheme
- Primary: Purple gradient (#667eea → #764ba2)
- Light theme: Clean whites and grays
- Dark theme: Deep blacks with purple accents

### Animations
- Fade-in animations for new messages
- Typing indicator with bouncing dots
- Smooth hover effects on buttons
- Slide-in modal animations

##  Configuration

### Environment variables

Set these before starting the app:

```javascript
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
```

- `PORT`: server port (default `3000`)
- `HOST`: bind address (default `0.0.0.0`)
- `SSL_KEY_PATH`: absolute path to TLS private key (`.pem`)
- `SSL_CERT_PATH`: absolute path to TLS certificate (`.pem`)
- `SSL_PFX_PATH`: absolute path to TLS certificate bundle (`.pfx`)
- `SSL_PFX_PASSPHRASE`: passphrase for `.pfx` (if set)
- `CORS_ORIGIN`: optional comma-separated allowed origins for Socket.IO (default `*`)

### Adjust Message History
Edit `server.js`:
```javascript
const MAX_HISTORY = 50; 
```

##  Features in Detail

### Typing Indicators
When you start typing, other users see a real-time "typing..." indicator. It automatically disappears after 1 second of inactivity.

### Message History
New users joining the chat can see the last 50 messages, allowing them to catch up on the conversation.

### Smart Timestamps
- "Just now" for messages < 1 minute old
- "X mins ago" for messages < 1 hour old
- Time (HH:MM) for messages today
- Date + time for older messages

### User Management
- Automatic user tracking by socket connection
- Real-time updates when users join/leave
- Broadcast notifications to all connected clients

##  Future Enhancements

Potential features to add:
-  File/image sharing
-  Private messaging
-  Chat rooms
-  Message search
-  Database integration for persistent history
-  User authentication
-  Read receipts
-  Message reactions
-  Video/voice calls

##  License

This project is open source and available for personal and commercial use.

##  Developer

Created by Dhurgham Alsaadi using modern web technologies.

---

**Enjoy chatting!**
