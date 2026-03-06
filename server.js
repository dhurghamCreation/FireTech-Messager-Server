const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { Sequelize, DataTypes, Op } = require('sequelize');
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

app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

app.use(express.static(__dirname));

// ======================== DATABASE CONNECTION ========================

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/discord-app',
  {
    dialect: 'postgres',
    logging: false,
    protocol: process.env.DATABASE_URL ? 'postgres' : undefined,
    dialectOptions: process.env.DATABASE_URL ? { ssl: { require: true, rejectUnauthorized: false } } : undefined
  }
);

// ======================== MODELS ========================

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  avatar: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  bio: {
    type: DataTypes.STRING,
    defaultValue: 'No bio yet'
  },
  phoneNumber: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'away'),
    defaultValue: 'offline'
  },
  coins: {
    type: DataTypes.INTEGER,
    defaultValue: 1000
  }
});

const Channel = sequelize.define('Channel', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  channelId: DataTypes.STRING,
  name: DataTypes.STRING,
  type: {
    type: DataTypes.ENUM('text', 'voice'),
    defaultValue: 'text'
  },
  description: DataTypes.STRING,
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
});

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  messageId: DataTypes.STRING,
  channelId: DataTypes.STRING,
  senderUsername: DataTypes.STRING,
  content: DataTypes.TEXT,
  mediaType: {
    type: DataTypes.ENUM('text', 'image', 'video', 'emoji', 'sticker', 'gif', 'voice'),
    defaultValue: 'text'
  },
  mediaUrl: DataTypes.TEXT
});

const ShopItem = sequelize.define('ShopItem', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  itemId: DataTypes.STRING,
  name: DataTypes.STRING,
  description: DataTypes.STRING,
  price: DataTypes.INTEGER,
  category: DataTypes.STRING,
  image: DataTypes.TEXT
});

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  itemId: DataTypes.STRING,
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
});

const FriendRequest = sequelize.define('FriendRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    defaultValue: 'pending'
  }
});

const DirectMessage = sequelize.define('DirectMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  messageId: DataTypes.STRING,
  fromUsername: DataTypes.STRING,
  toUsername: DataTypes.STRING,
  content: DataTypes.TEXT,
  mediaType: {
    type: DataTypes.ENUM('text', 'image', 'video', 'emoji', 'sticker', 'gif', 'voice'),
    defaultValue: 'text'
  },
  mediaUrl: DataTypes.TEXT
});

// ======================== ASSOCIATIONS ========================

User.belongsToMany(User, {
  as: 'friends',
  through: 'UserFriends',
  foreignKey: 'UserId',
  otherKey: 'FriendId'
});

User.hasMany(Channel, { foreignKey: 'createdById', as: 'channels' });
Channel.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });

Channel.belongsToMany(User, { through: 'ChannelMembers', foreignKey: 'ChannelId', otherKey: 'UserId' });
User.belongsToMany(Channel, { through: 'ChannelMembers', foreignKey: 'UserId', otherKey: 'ChannelId' });

User.hasMany(Message, { foreignKey: 'senderId' });
Message.belongsTo(User, { foreignKey: 'senderId' });

User.hasMany(Inventory, { foreignKey: 'userId' });
Inventory.belongsTo(User, { foreignKey: 'userId' });

ShopItem.hasMany(Inventory, { foreignKey: 'shopItemId' });
Inventory.belongsTo(ShopItem, { foreignKey: 'shopItemId' });

FriendRequest.belongsTo(User, { as: 'from', foreignKey: 'fromId' });
FriendRequest.belongsTo(User, { as: 'to', foreignKey: 'toId' });

DirectMessage.belongsTo(User, { as: 'sender', foreignKey: 'fromId' });
DirectMessage.belongsTo(User, { as: 'recipient', foreignKey: 'toId' });

// ======================== AUTH MIDDLEWARE ========================

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

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existingUser = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (existingUser) {
      return res.status(400).json({ error: existingUser.username === username ? 'Username already taken' : 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashedPassword });

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'secret_key'
    );

    res.status(201).json({ token, user: { id: user.id, username, email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'secret_key'
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        phoneNumber: user.phoneNumber,
        coins: user.coins
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== PROFILE ROUTES ========================

app.get('/api/profile/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId, { include: ['friends'] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      bio: user.bio,
      phoneNumber: user.phoneNumber,
      status: user.status,
      coins: user.coins,
      friends: user.friends,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
  try {
    const { username, bio, avatar, phoneNumber } = req.body;
    const user = await User.findByPk(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (username && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      user.username = username;
    }

    if (bio) user.bio = bio;
    if (avatar) user.avatar = avatar;
    if (typeof phoneNumber === 'string') user.phoneNumber = phoneNumber;

    await user.save();

    for (const [socketId, onlineUser] of onlineUsers.entries()) {
      if (onlineUser.userId === user.id) {
        onlineUsers.set(socketId, {
          ...onlineUser,
          username: user.username,
          avatar: user.avatar
        });
      }
    }
    io.emit('users update', Array.from(onlineUsers.values()));

    res.json({
      message: 'Profile updated',
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        phoneNumber: user.phoneNumber
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profile/upload', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;
    const user = await User.findByPk(req.user.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (avatar) {
      user.avatar = avatar;
      await user.save();

      for (const [socketId, onlineUser] of onlineUsers.entries()) {
        if (onlineUser.userId === user.id) {
          onlineUsers.set(socketId, {
            ...onlineUser,
            avatar: user.avatar
          });
        }
      }
      io.emit('users update', Array.from(onlineUsers.values()));
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

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;
    await FriendRequest.create({ fromId: req.user.userId, toId: toUserId });
    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const requests = await FriendRequest.findAll({
      where: { toId: req.user.userId, status: 'pending' },
      include: [{ model: User, as: 'from', attributes: ['id', 'username', 'avatar'] }]
    });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findByPk(requestId);

    if (!request) return res.status(404).json({ error: 'Request not found' });

    request.status = 'accepted';
    await request.save();

    const fromUser = await User.findByPk(request.fromId);
    const toUser = await User.findByPk(request.toId);

    await fromUser.addFriend(toUser);
    await toUser.addFriend(fromUser);

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      include: {
        association: 'friends',
        attributes: ['id', 'username', 'avatar', 'status', 'bio'],
        through: { attributes: [] }
      }
    });
    res.json(user.friends || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== DIRECT MESSAGES ROUTES ========================

app.get('/api/dms/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    const messages = await DirectMessage.findAll({
      where: {
        [Op.or]: [
          { fromId: req.user.userId, toId: friendId },
          { fromId: friendId, toId: req.user.userId }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    const userIds = [...new Set(messages.map(msg => msg.fromId))];
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'avatar', 'username']
    });
    const userMap = new Map(users.map(user => [String(user.id), user]));

    const enriched = messages.map(msg => {
      const sender = userMap.get(String(msg.fromId));
      return {
        ...msg.toJSON(),
        fromAvatar: sender?.avatar || null,
        fromUsername: sender?.username || msg.fromUsername,
        timestamp: msg.createdAt
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dms', authenticateToken, async (req, res) => {
  try {
    const { toUserId, content, mediaType, mediaUrl } = req.body;
    const fromUser = await User.findByPk(req.user.userId);
    const toUser = await User.findByPk(toUserId);

    if (!toUser) return res.status(404).json({ error: 'User not found' });

    const friends = await fromUser.getFriends({ where: { id: toUserId } });
    if (friends.length === 0) {
      return res.status(403).json({ error: 'Can only DM friends' });
    }

    const dm = await DirectMessage.create({
      messageId: uuidv4(),
      fromId: req.user.userId,
      toId: toUserId,
      fromUsername: fromUser.username,
      toUsername: toUser.username,
      content,
      mediaType: mediaType || 'text',
      mediaUrl: mediaUrl || null
    });

    res.status(201).json(dm);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================== SHOP ROUTES ========================

app.get('/api/shop', authenticateToken, async (req, res) => {
  try {
    const items = await ShopItem.findAll();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shop/buy', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    const item = await ShopItem.findByPk(itemId);
    const user = await User.findByPk(req.user.userId);

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (user.coins < item.price) return res.status(400).json({ error: 'Not enough coins' });

    user.coins -= item.price;
    await user.save();

    await Inventory.create({ userId: user.id, shopItemId: item.id });

    res.json({ message: 'Item purchased', coins: user.coins });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory', authenticateToken, async (req, res) => {
  try {
    const inventory = await Inventory.findAll({
      where: { userId: req.user.userId },
      include: [{ model: ShopItem }]
    });
    res.json(inventory);
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
  maxHttpBufferSize: 40 * 1024 * 1024,
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', async (data) => {
    try {
      const decoded = jwt.verify(data.token, process.env.JWT_SECRET || 'secret_key');
      const user = await User.findByPk(decoded.userId);

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

        io.emit('users update', Array.from(onlineUsers.values()));
      }
    } catch (error) {
      socket.emit('error', 'Authentication failed');
    }
  });

  socket.on('join dm', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.join(roomId);
    socket.currentDmRoom = roomId;
  });

  socket.on('leave dm', (friendId) => {
    const roomId = [socket.userId, friendId].sort().join('_');
    socket.leave(roomId);
    socket.currentDmRoom = null;
  });

  socket.on('send dm', async (data) => {
    try {
      const { toUserId, content, mediaType, mediaUrl } = data;
      const fromUser = await User.findByPk(socket.userId);
      const toUser = await User.findByPk(toUserId);

      if (!toUser) {
        socket.emit('error', 'User not found');
        return;
      }

      const isSelfChat = String(toUserId) === String(socket.userId);
      const friends = isSelfChat ? [] : await fromUser.getFriends({ where: { id: toUserId } });
      if (!isSelfChat && friends.length === 0) {
        socket.emit('error', 'Can only DM friends');
        return;
      }

      const dm = await DirectMessage.create({
        messageId: uuidv4(),
        fromId: socket.userId,
        toId: toUserId,
        fromUsername: fromUser.username,
        toUsername: toUser.username,
        content,
        mediaType: mediaType || 'text',
        mediaUrl: mediaUrl || null
      });

      const roomId = [socket.userId, toUserId].sort().join('_');
      io.to(roomId).emit('dm message', {
        messageId: dm.messageId,
        from: socket.userId,
        fromUsername: fromUser.username,
        fromAvatar: fromUser.avatar,
        to: toUserId,
        toUsername: toUser.username,
        content: dm.content,
        mediaType: dm.mediaType,
        mediaUrl: dm.mediaUrl,
        timestamp: dm.createdAt
      });
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

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

  socket.on('disconnect', async () => {
    try {
      const userData = onlineUsers.get(socket.id);
      if (userData) {
        const user = await User.findByPk(socket.userId);
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

// ======================== INITIALIZATION ========================

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

// Migrate ENUM types for media support
async function migrateMediaTypeEnum() {
  try {
    // Check if we need to update the ENUM type
    const [results] = await sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typname = 'enum_DirectMessages_mediaType' 
        AND e.enumlabel = 'voice'
      ) as has_voice;
    `);
    
    if (!results[0].has_voice) {
      console.log('📦 Migrating mediaType ENUM to include sticker, gif, voice...');
      
      // PostgreSQL requires special handling for ENUM changes
      await sequelize.query(`
        ALTER TYPE "enum_DirectMessages_mediaType" ADD VALUE IF NOT EXISTS 'sticker';
        ALTER TYPE "enum_DirectMessages_mediaType" ADD VALUE IF NOT EXISTS 'gif';
        ALTER TYPE "enum_DirectMessages_mediaType" ADD VALUE IF NOT EXISTS 'voice';
      `);
      
      await sequelize.query(`
        ALTER TYPE "enum_Messages_mediaType" ADD VALUE IF NOT EXISTS 'sticker';
        ALTER TYPE "enum_Messages_mediaType" ADD VALUE IF NOT EXISTS 'gif';
        ALTER TYPE "enum_Messages_mediaType" ADD VALUE IF NOT EXISTS 'voice';
      `);
      
      console.log('✅ ENUM migration complete!');
    } else {
      console.log('✅ mediaType ENUM already up to date');
    }
  } catch (error) {
    console.log('ℹ️  ENUM migration skipped (likely first run or different DB)');
  }
}

sequelize.sync({ alter: true }).then(async () => {
  await migrateMediaTypeEnum();
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
║   ✓ PostgreSQL Database              ║
║                                       ║
╚═══════════════════════════════════════╝
    `);
  });
}).catch(err => {
  console.error('Database sync error:', err);
  process.exit(1);
});
