# Discord-Like Chat Application

A comprehensive real-time chat application with Discord-like features including user profiles, friends system, shop, voice channels, and media sharing.

##  Features

### User Management
-  User registration and login with email/password
-  JWT-based authentication  
-  Editable user profiles with bio and avatar
-  Persistent accounts saved in MongoDB

### Chat & Messaging
-  Real-time messaging with Socket.IO
-  Text channels and voice channel support
-  Typing indicators
-  Media sharing (photos & videos)
-  Message history

### Social Features
-  Friends list system
-  Friend requests with accept/reject
-  Online status tracking
-  Member list with online indicators

### Shop & Economy
-  In-game shop with purchasable items
-  Coin currency system (1000 starting coins)
-  User inventory
-  Purchase tracking

### UI/UX
-  Discord-inspired dark theme
-  Responsive design (desktop, tablet, mobile)
-  Channel sidebar with quick access
-  Member sidebar
-  Profile panel

##  Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm (comes with Node.js)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and set your MongoDB connection:
```
MONGODB_URI=mongodb://localhost:27017/discord-app
JWT_SECRET=your_secret_key_here
```

### Step 3: Start MongoDB
Make sure MongoDB is running on your system.

**Windows (if using local MongoDB):**
```bash
mongod
```

**Or use MongoDB Atlas (cloud):**
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a cluster
- Get your connection string
- Update `MONGODB_URI` in `.env`

### Step 4: Start the Server
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will start at `http://localhost:3000`

##  How to Use

### 1. Create Account
- Click "Register"
- Enter username, email, and password
- Click "Create Account"

### 2. Log In
- Enter your email and password
- Click "Login"

### 3. Send Messages
- Select a channel from the left sidebar
- Type your message in the input box
- Press Enter or click the send button

### 4. Share Media
- Click the paperclip icon in the message input
- Select an image or video from your computer
- The file will be sent in the message

### 5. Manage Profile
- Click the profile icon (top right)
- Edit your username and bio
- Click "Save Profile"
- Check your inventory and coins

### 6. Add Friends
- Click the Friends icon (users icon) in the left guild sidebar
- Accept friend requests from others
- View your current friends list

### 7. Use the Shop
- Click the Shop icon (store icon) in the left guild sidebar
- Browse available items
- Click "Buy" to purchase items (uses coins)
- Check inventory in your profile

##  Project Structure

```
message-app/
├── server.js              # Express & Socket.IO backend
├── client.js              # Frontend JavaScript
├── index.html             # Frontend HTML
├── package.json           # Dependencies
├── .env                   # Environment variables (create this)
├── .env.example           # Example environment file
└── README.md              # This file
```

##  API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - Login user

### Profile
- `GET /api/profile/:userId` - Get user profile
- `PUT /api/profile` - Update profile

### Friends
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests` - Get pending requests
- `POST /api/friends/accept` - Accept friend request
- `GET /api/friends` - Get friends list

### Shop
- `GET /api/shop` - Get shop items
- `POST /api/shop/buy` - Purchase item
- `GET /api/inventory` - Get user inventory

### Channels
- `POST /api/channels` - Create channel
- `GET /api/channels` - Get channels

## 🔌 Socket.IO Events

### Client to Server
- `join` - User joins with token
- `join channel` - Join a channel
- `leave channel` - Leave a channel
- `send message` - Send message
- `typing` - User is typing
- `stop typing` - User stopped typing
- `start voice call` - Start voice call

### Server to Client
- `users update` - Online users list updated
- `message` - New message received
- `user typing` - User is typing
- `user stop typing` - User stopped typing
- `voice call started` - Voice call started

## 🛠️ Configuration

### MongoDB
You can use either:
1. **Local MongoDB**: Install MongoDB Community Edition
2. **MongoDB Atlas**: Free cloud hosting at https://www.mongodb.com/cloud/atlas

### JWT Secret
Change the `JWT_SECRET` in `.env` to a secure random string for production:
```bash

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Port
Default port is 3000. Change in `.env`:
```
PORT=8080
```

##  Mobile Support

The app is fully responsive and works on:
- Desktop (Chrome, Firefox, Safari, Edge)
- Tablet (iPad, Android tablets)
- Mobile phones (iOS, Android)

##  Troubleshooting

### "Cannot connect to MongoDB"
- Make sure MongoDB is running (`mongod` command)
- Check `MONGODB_URI` in `.env`
- Verify MongoDB port (default 27017)

### "Port already in use"
- Change `PORT` in `.env`
- Or kill the process: `lsof -ti:3000 | xargs kill -9`

### "Socket.IO connection failed"
- Check if server is running
- Verify correct server URL
- Check CORS settings in server.js

### Files not uploading
- Check file size (max 50MB)
- Verify file type (images/videos only)
- Check browser console for errors

##  Default Shop Items

The shop comes with these starting items (add more by modifying server.js):
- Discord Nitro Badge - 500 coins
- Profile Border - 300 coins
- Custom Status - 200 coins
- Emote Pack - 250 coins

##  Security Notes

1. Change `JWT_SECRET` in production
2. Use strong MongoDB passwords
3. Enable HTTPS in production (use `setup-https.ps1`)
4. Keep dependencies updated with `npm update`

##  Support

For issues or questions:
1. Check the troubleshooting section
2. Review server console for errors
3. Check browser console (F12) for client errors

##  Future Enhancements

- [ ] Direct messaging (DMs)
- [ ] Message reactions with emojis
- [ ] Message editing and deletion
- [ ] Voice call with WebRTC
- [ ] Video streaming
- [ ] File storage with cloud services
- [ ] Admin commands
- [ ] Server roles and permissions
- [ ] Message pins
- [ ] Custom emoji upload

---

**Made with  using Node.js, Express, Socket.IO, and MongoDB**
