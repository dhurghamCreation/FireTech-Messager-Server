<div align="center">

#  FireTech Messager

**A real-time, Discord-style chat application with communities, groups, direct messages, video calls, a shop economy, and a built-in security bot.**

![Version](https://img.shields.io/badge/version-3.2.13-blue)
![Node](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-orange)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Mobile-lightgrey)

</div>

---

##  Table of Contents

- [ Features](#-features)
- [ Tech Stack](#️-tech-stack)
- [ Quick Start (Run Locally)](#-quick-start-run-locally)
- [ How Others Connect to Your Server](#-how-others-connect-to-your-server)
  - [Option A: Same Wi-Fi / LAN Network](#option-a-same-wi-fi--lan-network)
  - [Option B: Over the Internet (Port Forwarding)](#option-b-over-the-internet-port-forwarding)
  - [Option C: Tunnel Services (ngrok / Cloudflare)](#option-c-tunnel-services-ngrok--cloudflare)
  - [Option D: Deploy to the Cloud (Recommended)](#option-d-deploy-to-the-cloud-recommended)
- [ Mobile Access](#-mobile-access)
- [ HTTPS Setup for LAN](#-https-setup-for-lan)
- [ Configuration (.env)](#️-configuration-env)
- [ Database Setup](#️-database-setup)
- [ API Endpoints](#-api-endpoints)
- [ Socket.IO Events](#-socketio-events)
- [ FireTech Bot Commands](#-firetech-bot-commands)
- [ Multi-Language Support](#-multi-language-support)
- [ Docker Deployment](#-docker-deployment)
- [ Cloud Deployment Guides](#️-cloud-deployment-guides)
- [ Troubleshooting](#️-troubleshooting)
- [ Project Structure](#-project-structure)
- [ License](#-license)

---

##  Features

###  User Management
-  Register & login with email/password (JWT authentication)
-  Editable profiles with bio, avatar, and phone number
-  Online / Offline / Away status tracking
-  Password reset

###  Real-Time Messaging
-  Instant messaging with **Socket.IO**
-  **Communities** (public rooms) & **Groups** (private rooms)
-  **Direct Messages (DMs)** between friends
-  Typing indicators
-  Media sharing — images, videos, emoji, stickers, GIFs, voice notes
-  Message history persisted in PostgreSQL
-  Room roles: **Owner / Admin / Member**
-  Rename rooms, change icons & banners

###  Social Features
-  Friends list & friend requests (accept / reject)
-  Online member lists with avatars
-  Real-time presence updates

###  Video Calls
-  WebRTC-based video calls between users
-  Incoming call notifications, accept / reject / end
-  STUN/TURN server support for NAT traversal

###  Shop & Economy
-  Coin currency system
-  Premium shop with purchasable items (badges, themes, nameplates, emoji packs, avatar rings)
-  User inventory & instant item application

###  Games & Challenges
-  Trivia, Speed Typing, Memory, Math Blitz, Riddles, Reaction Speed, Word Scramble
-  Earn coins by completing challenges

###  FireTech Security Bot
-  Built-in bot that answers security questions
-  Commands: `help`, `security`, `encryption`, `network`, `password`, `twofa`, `phishing`, `malware`, `vpn`

###  Internationalization
-  **12 languages**: English, Español, Français, Deutsch, 日本語, Português, العربية, 中文, Русский, 한국어, Türkçe, Italiano

###  UI/UX
-  Discord-inspired dark theme (with light mode)
-  Fully responsive — desktop, tablet, and mobile
-  Custom accent colors & compact mode
-  Desktop notifications & message sounds

---

##  Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express |
| **Real-time** | Socket.IO |
| **Database** | PostgreSQL (Sequelize ORM) |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Frontend** | Vanilla HTML/CSS/JS (single-page app) |
| **Video** | WebRTC (STUN/TURN) |
| **Deployment** | Docker, Render, Railway, HuggingFace Spaces |

---

##  Quick Start (Run Locally)

### Prerequisites

| Requirement | How to Install |
|-------------|----------------|
| **Node.js v18+** | [Download from nodejs.org](https://nodejs.org/) |
| **npm** | Comes with Node.js |
| **PostgreSQL** | [Download PostgreSQL](https://www.postgresql.org/download/) — *or use a free cloud DB like [Neon](https://neon.tech) or [Supabase](https://supabase.com)* |

### Step 1: Clone the Repository

```bash
git clone https://github.com/dhurghamCreation/FireTech-Messager-Server.git
cd FireTech-Messager-Server
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# Server
PORT=7860
HOST=0.0.0.0
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgres://postgres:password@localhost:5432/discord-app

# Security
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# CORS (use * for open access, or comma-separated origins)
CORS_ORIGIN=*

# Optional: HTTPS certificates
SSL_PFX_PATH=
SSL_PFX_PASSPHRASE=
SSL_KEY_PATH=
SSL_CERT_PATH=
```

>  **No local PostgreSQL?** Use a free cloud database:
> - **[Neon](https://neon.tech)** — free PostgreSQL with a connection string like `postgresql://user:pass@ep-xxx.aws.neon.tech/db?sslmode=require`
> - **[Supabase](https://supabase.com)** — free PostgreSQL
> - **[Railway](https://railway.app)** — free tier PostgreSQL

### Step 4: Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### Step 5: Open the App

Open your browser and go to:

```
http://localhost:7860
```

You should see the FireTech login screen. 🎉

### Step 6: Create an Account

1. Click **Register**
2. Enter a username, email, and password (min 6 characters)
3. Click **Create Account**
4. You're in! Start chatting, add friends, join communities, and earn coins.

---

##  How Others Connect to Your Server

This is the **most important part**. There are **4 ways** people can connect to your server. Choose the one that fits your situation.

---

### Option A: Same Wi-Fi / LAN Network

**Best for:** Friends & family on the same home/office network.

When you run the server, it automatically binds to `0.0.0.0`, which means **any device on your local network can connect**.

#### 1. Find Your Computer's LAN IP

**Windows:**
```powershell
ipconfig
```
Look for the **IPv4 Address** under your active adapter (e.g., `192.168.1.50` or `10.0.0.5`).

**macOS / Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show
```

#### 2. Allow the Port Through Your Firewall

**Windows** — run PowerShell **as Administrator**:

```powershell
New-NetFirewallRule -DisplayName "FireTech Chat" -Direction Inbound -LocalPort 7860 -Protocol TCP -Action Allow -Profile Any
```

Or use the included script:
```powershell
.\add-firewall-rule.ps1
```

**macOS** — you may need to allow Node.js in *System Settings → Network → Firewall*.

#### 3. Share Your Address

Give your friends this URL (replace `192.168.1.50` with **your** IP):

```
http://192.168.1.50:7860
```

They open it in any browser on the **same Wi-Fi** and they're connected! 

>  **Important:** Everyone must be on the **same network** (same router/Wi-Fi). This will **not** work over the internet.

---

### Option B: Over the Internet (Port Forwarding)

**Best for:** When you want people **outside** your network to connect directly to your PC.

>  **Security Warning:** Opening a port to the internet exposes your machine. Only do this on a trusted network, and change the `JWT_SECRET` to a strong value first.

#### 1. Find Your Public IP

```bash
curl ifconfig.me
```
Or visit [whatismyip.com](https://whatismyip.com).

#### 2. Set Up Port Forwarding on Your Router

1. Open your router admin page (usually `192.168.1.1` or `192.168.0.1`)
2. Find **Port Forwarding** / **Virtual Server** / **NAT**
3. Create a rule:
   - **External Port:** `7860`
   - **Internal Port:** `7860`
   - **Internal IP:** your computer's LAN IP (e.g., `192.168.1.50`)
   - **Protocol:** TCP
4. Save & apply

#### 3. Share Your Public Address

```
http://YOUR_PUBLIC_IP:7860
```

Anyone on the internet can now connect to your server.

>  **Tip:** Your public IP may change. Use a **Dynamic DNS** service (like [No-IP](https://noip.com) or [DuckDNS](https://duckdns.org)) to get a permanent hostname like `yourname.duckdns.org`.

---

### Option C: Tunnel Services (ngrok / Cloudflare)

**Best for:** Quick, temporary sharing without touching your router — and it works over the internet!

#### Using ngrok (free)

1. [Sign up & download ngrok](https://ngrok.com)
2. Start your server:
   ```bash
   npm start
   ```
3. In a **new terminal**, create a tunnel:
   ```bash
   ngrok http 7860
   ```
4. ngrok gives you a public URL like:
   ```
   https://abc123.ngrok-free.app
   ```
5. **Share that URL** — anyone can open it in their browser and connect to your server from anywhere in the world! 🌍

#### Using Cloudflare Tunnel (free, more permanent)

1. Install `cloudflared` from [developers.cloudflare.com](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Run:
   ```bash
   cloudflared tunnel --url http://localhost:7860
   ```
3. You'll get a `https://xxx.trycloudflare.com` URL to share.

---

### Option D: Deploy to the Cloud (Recommended)

**Best for:** A permanent, always-online server that anyone can access 24/7 — no need to keep your PC running!

The repo includes ready-made configs for **Render**, **Railway**, and **HuggingFace Spaces**.

#### Render (Free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — or configure manually:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Add environment variables (see `.env.example`)
6. Deploy! You get a URL like `https://your-app.onrender.com`

#### Railway (Free)

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Railway auto-detects `railway.json`
4. Add a **PostgreSQL** plugin and link it to `DATABASE_URL`
5. Deploy — you get a public URL

#### HuggingFace Spaces (Free)

The repo includes a `README.md` front-matter for HuggingFace:

```yaml
---
title: FireTech Message Server
emoji: 💬
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---
```

1. Create a new Space at [huggingface.co/spaces](https://huggingface.co/spaces)
2. Choose **Docker** SDK
3. Push this repo to the Space
4. Set `DATABASE_URL` in the Space's **Settings → Variables**
5. Your app is live at `https://yourname-firetech-message-server.hf.space`

---

##  Mobile Access

The app is fully responsive and works on phones and tablets.

### On the Same Wi-Fi

1. Run the server (or use `mobile-connect.ps1` on Windows)
2. Find your PC's IP (`ipconfig`)
3. On your phone, open: `http://YOUR_PC_IP:7860`

### Windows One-Click Mobile Setup

The repo includes `mobile-connect.ps1` which:
- Detects your Wi-Fi IP automatically
- Adds the firewall rule
- Starts the server with HTTPS on port `3001`

```powershell
.\mobile-connect.ps1
```

Then open `https://YOUR_WIFI_IP:3001` on your phone.

>  You'll see a **certificate warning** on your phone (self-signed cert). Tap **Advanced → Proceed** to continue.

---

##  HTTPS Setup for LAN

For secure connections on your local network, use the included HTTPS setup script:

```powershell
npm run https
```

This script:
1. Detects your LAN IP
2. Generates a self-signed SSL certificate
3. Adds a firewall rule for port `3001`
4. Starts the server with HTTPS

Access:
- On this PC: `https://localhost:3001`
- On LAN devices: `https://YOUR_LAN_IP:3001`

---

##  Configuration (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `7860` |
| `HOST` | Bind address (`0.0.0.0` = all interfaces) | `0.0.0.0` |
| `NODE_ENV` | `development` or `production` | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@localhost:5432/discord-app` |
| `JWT_SECRET` | Secret key for signing tokens | `secret_key` |
| `CORS_ORIGIN` | Allowed origins (`*` or comma-separated) | `*` |
| `MAX_FILE_SIZE` | Max upload size in bytes | `52428800` (50MB) |
| `SSL_PFX_PATH` | Path to PFX certificate (HTTPS) | *(empty)* |
| `SSL_PFX_PASSPHRASE` | PFX passphrase | *(empty)* |
| `SSL_KEY_PATH` | Path to SSL key (HTTPS) | *(empty)* |
| `SSL_CERT_PATH` | Path to SSL cert (HTTPS) | *(empty)* |
| `TURN_URLS` | TURN server URLs for WebRTC (comma-separated) | *(empty)* |
| `TURN_USERNAME` | TURN username | *(empty)* |
| `TURN_CREDENTIAL` | TURN credential | *(empty)* |
| `RTC_FORCE_RELAY` | Force relay mode for WebRTC (`true`/`false`) | `false` |

---

##  Database Setup

The app uses **PostgreSQL** with the **Sequelize** ORM. Tables are created automatically on first run.

### Local PostgreSQL

1. Install PostgreSQL from [postgresql.org](https://www.postgresql.org/download/)
2. Create a database:
   ```sql
   CREATE DATABASE "discord-app";
   ```
3. Update `DATABASE_URL` in `.env`:
   ```
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/discord-app
   ```

### Cloud PostgreSQL (Recommended for sharing)

- **[Neon](https://neon.tech)** — free, serverless PostgreSQL
- **[Supabase](https://supabase.com)** — free PostgreSQL
- **[Railway](https://railway.app)** — free tier PostgreSQL

Just paste your connection string into `DATABASE_URL`.

>  The server auto-creates all tables (`User`, `Channel`, `Message`, `ShopItem`, `Inventory`, `FriendRequest`, `DirectMessage`) and seeds default shop items on first run.

---

##  API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/register` | Register a new user |
| `POST` | `/api/login` | Login and get JWT token |
| `POST` | `/api/reset-password` | Reset password by email |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/profile/:userId` | Get user profile |
| `PUT` | `/api/profile` | Update profile (username, bio, avatar, phone) |
| `POST` | `/api/profile/upload` | Upload avatar |
| `POST` | `/api/profile/coins` | Sync coins |

### Friends
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/friends/request` | Send friend request |
| `GET` | `/api/friends/requests` | Get pending requests |
| `POST` | `/api/friends/accept` | Accept friend request |
| `POST` | `/api/friends/reject` | Reject friend request |
| `GET` | `/api/friends` | Get friends list |

### Direct Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dms/:friendId` | Get DM history with a friend |
| `POST` | `/api/dms` | Send a DM |
| `DELETE` | `/api/dms/:friendId` | Clear DM history |

### Shop & Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/shop` | Get shop items |
| `POST` | `/api/shop/buy` | Purchase an item |
| `GET` | `/api/inventory` | Get user inventory |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/version` | Get app version |
| `GET` | `/api/rtc-config` | Get WebRTC ICE server config |

---

##  Socket.IO Events

### Client → Server
| Event | Description |
|-------|-------------|
| `join` | Authenticate & join with JWT token |
| `join dm` / `leave dm` | Join/leave a DM room |
| `send dm` | Send a direct message |
| `dm typing` / `dm stop typing` | DM typing indicators |
| `join room chat` | Join a community/group room |
| `leave room chat` | Leave a room |
| `send room message` | Send a message to a room |
| `room typing` / `room stop typing` | Room typing indicators |
| `set room role` | Change member role (Owner/Admin) |
| `update room profile` | Rename room / change icon / banner |
| `clear room chat` | Clear room message history |
| `send friend request` | Send a friend request |
| `start video call` | Start a video call |
| `accept video call` | Accept an incoming call |
| `reject video call` | Reject an incoming call |
| `end video call` | End a call |
| `video signal` | WebRTC signaling (offer/answer/ICE) |

### Server → Client
| Event | Description |
|-------|-------------|
| `users update` | Online users list changed |
| `dm message` | New DM received |
| `dm user typing` | Friend is typing |
| `room message` | New room message |
| `room chat history` | Room message history |
| `room members update` | Room member list changed |
| `room profile updated` | Room name/icon changed |
| `room chat cleared` | Room chat was cleared |
| `friend request received` | New friend request |
| `friend request accepted` | Request accepted |
| `incoming video call` | Someone is calling you |
| `video call accepted` | Call was accepted |
| `video call rejected` | Call was rejected |
| `video call ended` | Call ended |
| `video signal` | WebRTC signaling data |

---

##  FireTech Bot Commands

DM the ** FireTech Bot** or mention it in a room with:

| Command | Response |
|---------|----------|
| `help` | Lists all available commands |
| `security` | Security best practices |
| `encryption` | Encryption facts |
| `network` | Network security insights |
| `password` | Password best practices |
| `twofa` | 2FA information |
| `phishing` | Phishing warnings |
| `malware` | Malware protection tips |
| `vpn` | VPN information |
| `hello` / `hi` | Greeting |

---

##  Multi-Language Support

The app supports **12 languages**, switchable in **Settings → Language**:

🇺🇸 English · 🇪🇸 Español · 🇫🇷 Français · 🇩🇪 Deutsch · 🇯🇵 日本語 · 🇧🇷 Português · 🇸🇦 العربية · 🇨🇳 中文 · 🇷🇺 Русский · 🇰🇷 한국어 · 🇹🇷 Türkçe · 🇮🇹 Italiano

---

##  Docker Deployment

A `Dockerfile` is included:

```dockerfile
FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 7860
CMD ["node", "server.js"]
```

### Build & Run

```bash
docker build -t firetech-messager .
docker run -p 7860:7860 --env-file .env firetech-messager
```

---

##  Cloud Deployment Guides

### Render
- `render.yaml` is included — Render auto-detects it
- Set `DATABASE_URL` and `JWT_SECRET` in environment

### Railway
- `railway.json` is included
- Add a PostgreSQL plugin, link it to `DATABASE_URL`

### HuggingFace Spaces
- Docker SDK, port `7860`
- Set `DATABASE_URL` in Space settings

### Vercel
- `vercel.json` is included (for static hosting of the frontend)

---

##  Troubleshooting

###  "Cannot connect to database"
- Make sure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- For cloud DBs, ensure the connection string includes `sslmode=require`

###  "Port already in use"
- Change `PORT` in `.env`
- Or kill the process:
  - **Windows:** `taskkill /F /IM node.exe`
  - **macOS/Linux:** `lsof -ti:7860 | xargs kill -9`

###  Friends can't connect to my LAN IP
- Make sure they're on the **same Wi-Fi**
- Check your firewall allows port `7860` (run `add-firewall-rule.ps1`)
- Verify your IP with `ipconfig` — don't use `localhost` or `127.0.0.1`

###  "Socket.IO connection failed"
- Check the server is running
- Verify the URL is correct (use your LAN IP, not localhost, for remote users)
- Check `CORS_ORIGIN` in `.env` (use `*` for open access)

###  Files not uploading
- Max file size is 50MB
- Supported: images, videos, emoji, stickers, GIFs, voice notes
- Clear browser cache and retry

###  Certificate warning on mobile
- This is normal with self-signed certs
- Tap **Advanced → Proceed** to continue

###  Video calls not working
- Both users must be online
- For calls across different networks, configure `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` in `.env`

---

##  Project Structure

```
FireTech-Messager-Server/
├──  server.js              # Backend: Express + Socket.IO + Sequelize
├──  client.js              # Frontend: all UI logic (8,700+ lines)
├──  index.html             # Frontend: HTML/CSS (4,000+ lines)
├──  package.json           # Dependencies & scripts
├──  .env.example           # Example environment config
├──  init-db.js             # Database initializer
├──  Dockerfile             # Docker container config
├──  render.yaml            # Render deployment config
├──  railway.json           # Railway deployment config
├──  vercel.json            # Vercel deployment config
├──  Caddyfile              # Caddy reverse-proxy config
├──  setup-https.ps1        # HTTPS LAN setup (Windows)
├──  mobile-connect.ps1     # Mobile connection setup (Windows)
├──  add-firewall-rule.ps1  # Firewall helper (Windows)
├──  Deploy-FireTech.ps1    # Full deployment script (Windows)
├──  deploy.ps1             # Deployment helper (Windows)
├──  QUICKSTART.sh          # Quick start (Linux/macOS)
├──  GETTING-STARTED.md     # Step-by-step guide
├──  SETUP-GUIDE.md         # Detailed setup guide
├──  FEATURES.md            # Feature documentation
├──  CHANGELOG-v2.2.5.md    # Changelog
├──  LICENSE                # MIT License
├──  images/                # App images & logo
├──  certs/                 # Generated SSL certificates
└──  node_modules/          # Dependencies (installed)
```

---

##  License

This project is licensed under the **Apache License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made by Dhurgham Alsaadi using Node.js, Express, Socket.IO, and PostgreSQL**

Star this repo if you find it useful!

</div>
</content>
<task_progress>
- [x] Analyze project structure and understand the app
- [x] Review server.js, client.js, package.json, .env, and helper scripts
- [x] Create comprehensive README.md with installation & connection guides
- [ ] Verify README renders correctly
</task_progress>
</task_progress>
