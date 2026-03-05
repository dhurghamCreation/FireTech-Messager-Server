const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected')).catch(err => console.error('MongoDB connection error:', err));

// ======================== SCHEMAS ========================

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: 'No bio yet' },
  status: { type: String, enum: ['online', 'offline', 'away'], default: 'offline' },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  coins: { type: Number, default: 1000 },
  createdAt: { type: Date, default: Date.now }
});

// Channel Schema
const channelSchema = new mongoose.Schema({
  channelId: String,
  name: String,
  type: { type: String, enum: ['text', 'voice'], default: 'text' },
  description: String,
  isPrivate: { type: Boolean, default: false },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  messageId: String,
  channelId: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderUsername: String,
  content: String,
  mediaType: { type: String, enum: ['text', 'image', 'video', 'emoji'], default: 'text' },
  mediaUrl: String,
  timestamp: { type: Date, default: Date.now },
  reactions: [{ emoji: String, users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] }]
});

// Shop Item Schema
const shopItemSchema = new mongoose.Schema({
  itemId: String,
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  createdAt: { type: Date, default: Date.now }
});

// User Inventory Schema
const inventorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  itemId: String,
  quantity: { type: Number, default: 1 },
  purchasedAt: { type: Date, default: Date.now }
});

// Friend Request Schema
const friendRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Direct Message Schema
const directMessageSchema = new mongoose.Schema({
  messageId: String,
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fromUsername: String,
  toUsername: String,
  content: String,
  mediaType: { type: String, enum: ['text', 'image', 'video', 'emoji'], default: 'text' },
  mediaUrl: String,
  timestamp: { type: Date, default: Date.now },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

// Models
const User = mongoose.model('User', userSchema);
const Channel = mongoose.model('Channel', channelSchema);
const Message = mongoose.model('Message', messageSchema);
const ShopItem = mongoose.model('ShopItem', shopItemSchema);
const Inventory = mongoose.model('Inventory', inventorySchema);
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);
const DirectMessage = mongoose.model('DirectMessage', directMessageSchema);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret_key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ======================== AUTH ROUTES ========================

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (await User.findOne({ username })) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'secret_key'
    );

    res.status(201).json({ token, user: { id: user._id, username, email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'secret_key'
    );

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        username: user.username, 
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        coins: user.coins
      } 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== PROFILE ROUTES ========================

// Get Profile
app.get('/api/profile/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('friends');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      status: user.status,
      coins: user.coins,
      friends: user.friends,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Profile
app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (username && username !== user.username) {
      if (await User.findOne({ username })) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      user.username = username;
    }

    if (bio) user.bio = bio;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.json({ 
      message: 'Profile updated',
      user: {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload Profile Image
app.post('/api/profile/upload', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (avatar) {
      user.avatar = avatar;
      await user.save();
    }

    res.json({ 
      message: 'Profile image updated',
      avatar: user.avatar
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== FRIENDS ROUTES ========================

// Send Friend Request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;
    const request = new FriendRequest({ from: req.user.userId, to: toUserId });
    await request.save();
    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Friend Requests
app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.user.userId, status: 'pending' })
      .populate('from', 'username avatar');
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept Friend Request
app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findById(requestId);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    request.status = 'accepted';
    await request.save();

    await User.findByIdAndUpdate(request.from, { $addToSet: { friends: request.to } });
    await User.findByIdAndUpdate(request.to, { $addToSet: { friends: request.from } });

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Friends List
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('friends', 'username avatar status bio');
    res.json(user.friends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== DIRECT MESSAGES ROUTES ========================

// Get DMs with a specific friend
app.get('/api/dms/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    const messages = await DirectMessage.find({
      $or: [
        { from: req.user.userId, to: friendId },
        { from: friendId, to: req.user.userId }
      ]
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send DM (POST also works in addition to Socket.IO)
app.post('/api/dms', authenticateToken, async (req, res) => {
  try {
    const { toUserId, content, mediaType, mediaUrl } = req.body;
    const fromUser = await User.findById(req.user.userId);
    const toUser = await User.findById(toUserId);

    if (!toUser) return res.status(404).json({ error: 'User not found' });

    // Check if users are friends
    if (!fromUser.friends.includes(toUserId)) {
      return res.status(403).json({ error: 'Can only DM friends' });
    }

    const dm = new DirectMessage({
      messageId: uuidv4(),
      from: req.user.userId,
      to: toUserId,
      fromUsername: fromUser.username,
      toUsername: toUser.username,
      content,
      mediaType: mediaType || 'text',
      mediaUrl: mediaUrl || null
    });

    await dm.save();
    res.status(201).json(dm);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== SHOP ROUTES ========================

// Get Shop Items
app.get('/api/shop', authenticateToken, async (req, res) => {
  try {
    const items = await ShopItem.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buy Shop Item
app.post('/api/shop/buy', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    const item = await ShopItem.findById(itemId);
    const user = await User.findById(req.user.userId);

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (user.coins < item.price) return res.status(400).json({ error: 'Not enough coins' });

    user.coins -= item.price;
    await user.save();

    const inventory = new Inventory({ userId: user._id, itemId: item._id });
    await inventory.save();

    res.json({ message: 'Item purchased', coins: user.coins });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Inventory
app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const inventory = await Inventory.find({ userId: req.user.userId }).populate('itemId');
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== CHANNELS ROUTES ========================

// Create Channel
app.post('/api/channels', authenticateToken, async (req, res) => {
  try {
    const { name, type, description, isPrivate } = req.body;
    const channel = new Channel({
      channelId: uuidv4(),
      name,
      type,
      description,
      isPrivate,
      createdBy: req.user.userId,
      members: [req.user.userId]
    });
    await channel.save();
    res.status(201).json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Channels
app.get('/api/channels', authenticateToken, async (req, res) => {
  try {
    const channels = await Channel.find({ $or: [{ isPrivate: false }, { members: req.user.userId }] });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== SOCKET.IO ========================

function createServer(appInstance) {
  const pfxPath = process.env.SSL_PFX_PATH;
  const pfxPassphrase = process.env.SSL_PFX_PASSPHRASE;
  const keyPath = process.env.SSL_KEY_PATH;
  const certPath = process.env.SSL_CERT_PATH;

  if (pfxPath) {
    const httpsOptions = {
      pfx: fs.readFileSync(path.resolve(pfxPath)),
      passphrase: pfxPassphrase
    };
    return { server: https.createServer(httpsOptions, appInstance), protocol: 'https' };
  }

  if (keyPath && certPath) {
    const httpsOptions = {
      key: fs.readFileSync(path.resolve(keyPath)),
      cert: fs.readFileSync(path.resolve(certPath))
    };
    return { server: https.createServer(httpsOptions, appInstance), protocol: 'https' };
  }

  return { server: http.createServer(appInstance), protocol: 'http' };
}

const { server, protocol } = createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST']
  }
});

// Store active connections
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with authentication token
  socket.on('join', async (data) => {
    try {
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'secret_key');
      const user = await User.findById(decoded.userId);

      if (user) {
        socket.userId = decoded.userId;
        socket.username = user.username;
        socket.userAvatar = user.avatar;

        onlineUsers.set(socket.id, {
          userId: decoded.userId,
          username: user.username,
          avatar: user.avatar,
          status: 'online'
        });

        user.status = 'online';
        await user.save();

        // Broadcast updated users list
        io.emit('users update', Array.from(onlineUsers.values()));
      }
    } catch (error) {
      socket.emit('error', 'Authentication failed');
    }
  });

  // Join a DM room with a friend
  socket.on('join dm', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.join(roomId);
    socket.currentDmRoom = roomId;
  });

  // Leave a DM room
  socket.on('leave dm', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.leave(roomId);
    socket.currentDmRoom = null;
  });

  // Send DM
  socket.on('send dm', async (data) => {
    try {
      const { toUserId, content, mediaType, mediaUrl } = data;
      const fromUser = await User.findById(socket.userId);
      const toUser = await User.findById(toUserId);

      if (!toUser) {
        socket.emit('error', 'User not found');
        return;
      }

      // Check they are friends
      if (!fromUser.friends.includes(toUserId)) {
        socket.emit('error', 'Can only DM friends');
        return;
      }

      const dm = new DirectMessage({
        messageId: uuidv4(),
        from: socket.userId,
        to: toUserId,
        fromUsername: socket.username,
        toUsername: toUser.username,
        content,
        mediaType: mediaType || 'text',
        mediaUrl: mediaUrl || null
      });

      await dm.save();

      // Send to DM room
      const roomId = [socket.userId, toUserId].sort().join('_');
      io.to(roomId).emit('dm message', {
        messageId: dm.messageId,
        from: socket.userId,
        fromUsername: socket.username,
        fromAvatar: socket.userAvatar,
        to: toUserId,
        toUsername: toUser.username,
        content: dm.content,
        mediaType: dm.mediaType,
        mediaUrl: dm.mediaUrl,
        timestamp: dm.timestamp
      });
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  // Typing indicator for DMs
  socket.on('dm typing', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.broadcast.to(roomId).emit('dm user typing', {
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('dm stop typing', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.broadcast.to(roomId).emit('dm user stop typing', {
      userId: socket.userId,
      username: socket.username
    });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    try {
      const userData = onlineUsers.get(socket.id);
      if (userData) {
        const user = await User.findById(socket.userId);
        if (user) {
          user.status = 'offline';
          await user.save();
        }
        onlineUsers.delete(socket.id);
        io.emit('users update', Array.from(onlineUsers.values()));
      }
    } catch (error) {
      console.error(error);
    }
  });
});

// ======================== STARTUP ========================

function getLocalNetworkAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  const networkAddress = getLocalNetworkAddress();
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 Discord-Like Server Running     ║
║                                       ║
║   📡 Local: ${protocol}://localhost:${PORT}     ║
║   🌐 LAN:   ${protocol}://${networkAddress}:${PORT}     ║
║   ✨ Status: Online & Ready          ║
║                                       ║
║   Features:                           ║
║   ✓ User Authentication              ║
║   ✓ Profiles & Friends               ║
║   ✓ Text & Voice Channels            ║
║   ✓ Media Sharing                    ║
║   ✓ Shop System                      ║
║   ✓ Real-time Messaging              ║
║                                       ║
╚═══════════════════════════════════════╝
  `);
});      