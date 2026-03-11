# 🚀 Getting Started - Step by Step

## Prerequisites
- Node.js (https://nodejs.org/) - Download LTS version
- MongoDB - Either local or cloud (MongoDB Atlas)

## Step 1: Prepare Your Environment

### Install Node.js Dependencies
Open PowerShell in your project folder and run:
```powershell
npm install
```

This installs all required packages:
- express (web framework)
- socket.io (real-time communication)
- mongoose (database ORM)
- jsonwebtoken (authentication)
- bcryptjs (password hashing)
- And more...

## Step 2: Set Up MongoDB

### Option A: Local MongoDB
1. Download MongoDB Community Edition: https://www.mongodb.com/try/download/community
2. Install it (use default settings)
3. MongoDB will start automatically
4. Your connection string: `mongodb://localhost:27017/discord-app`

### Option B: MongoDB Atlas (Cloud)
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for free account
3. Create a cluster
4. Click "Connect"
5. Copy the connection string
6. Replace `<password>` with your password

## Step 3: Configure Environment

1. Edit the `.env` file in your project root:
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/discord-app
JWT_SECRET=MySecretKey123!
```

2. Replace `MONGODB_URI` with your MongoDB connection string

## Step 4: Initialize Database (Optional)

Add sample shop items:
```powershell
npm run init-db
```

This creates default shop items in your database.

## Step 5: Start the Server

### Development (with auto-reload):
```powershell
npm run dev
```

### Production:
```powershell
npm start
```

You should see:
```
╔═══════════════════════════════════════╗
║   🚀 Discord-Like Server Running     ║
║                                       ║
║   📡 Local: http://localhost:3000    ║
║   ✨ Status: Online & Ready          ║
╚═══════════════════════════════════════╝
```

## Step 6: Access the App

Open your browser and go to:
```
http://localhost:3000
```

## First Time Account Setup

1. **Click "Register"** (first time)
2. Enter:
   - Username (e.g., "john_doe")
   - Email (e.g., "john@example.com")
   - Password (minimum 6 characters)
3. Click "Create Account"
4. You're logged in! 🎉

## Test the Features

### 1. Send Messages
- Type in the message box
- Press Enter to send
- Messages appear in real-time

### 2. Upload Media
- Click the attachment icon (📎)
- Select an image or video
- It appears in the chat

### 3. Profile
- Click profile icon (top right)
- Edit username and bio
- Click "Save Profile"

### 4. Friends
- Click Friends icon (👥)
- See online members
- Accept friend requests

### 5. Shop
- Click Shop icon (🏪)
- Browse items for sale
- Buy with coins (1000 starting coins)
- Check inventory in profile

## Troubleshooting

### Port 3000 Already In Use
Change in `.env`:
```
PORT=8080
```

### MongoDB Connection Error
1. Make sure MongoDB is running
2. Check MONGODB_URI in .env is correct
3. If using local: `mongod` command starts it
4. If using Atlas: Check connection string has correct password

### App Won't Load
1. Check server is running (see console output)
2. Check localhost:3000 is being accessed
3. Press Ctrl+F5 to hard refresh browser
4. Check browser console (F12) for errors

### Can't Upload Files
1. Check file size < 50MB
2. Try PNG or JPG (not all formats supported)
3. Clear browser cache
4. Check file type (image/* or video/*)

## File Structure

```
📁 message-app/
├── 📄 server.js          ← Backend (API & WebSockets)
├── 📄 client.js          ← Frontend JavaScript
├── 📄 index.html         ← Frontend HTML/CSS
├── 📄 package.json       ← Dependencies list
├── 📄 .env               ← Configuration (you create this)
├── 📄 init-db.js         ← Database initializer
├── 📄 SETUP-GUIDE.md     ← Detailed setup guide
├── 📄 FEATURES.md        ← Features documentation
└── 📄 README.md          ← Original readme
```

## Command Reference

```powershell
npm install              
npm start                
npm run dev             
npm run init-db          
npm run https           
```

## Environment Variables

In `.env` file:
```env
PORT=3000                              # Server port
MONGODB_URI=mongodb://...              # Database URL
JWT_SECRET=your_secret_key             # JWT signature key
CORS_ORIGIN=*                          # Allowed origins
NODE_ENV=development                   # dev or production
```

## Next Steps

### To Customize:
1. Edit colors in `index.html` (CSS variables in :root)
2. Add more channels in `client.js` (showChannel function)
3. Add more shop items (modify init-db.js)
4. Change server name: Edit sidebar header in HTML

### To Deploy:
1. Use Heroku, Railway, or Render
2. Set environment variables in hosting platform
3. Use MongoDB Atlas (not local)
4. Add HTTPS certificates
5. Update CORS_ORIGIN to your domain

### To Extend:
- Add direct messaging
- Add voice/video (WebRTC)
- Add message reactions
- Add roles and permissions
- Add server administration

## Getting Help

1. Check SETUP-GUIDE.md for detailed instructions
2. Check FEATURES.md for feature list
3. Check browser console (F12) for errors
4. Check server console output
5. Try resetting browser cache (Ctrl+Shift+Delete)

---

**Enjoy your Discord-like chat application! 🎉**
