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


const cors = require('cors');
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean) : ['*'];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes('*')) return true;

  return allowedOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (allowed.endsWith(':*')) {
      const prefix = allowed.slice(0, -2);
      return origin.startsWith(prefix + ':');
    }
    return false;
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

app.get('/api/version', (req, res) => {
  try {
    const packageJson = require('./package.json');
    res.json({ version: packageJson.version || 'unknown' });
  } catch (error) {
    res.status(500).json({ version: 'unknown' });
  }
});

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/discord-app';
const isLocalConnection = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  logging: false,
  protocol: 'postgres',
  dialectOptions: isLocalConnection ? {} : { ssl: { require: true, rejectUnauthorized: false } }
});



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



app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { toUserId } = req.body;

    if (!toUserId) return res.status(400).json({ error: 'toUserId is required' });
    if (String(toUserId) === String(req.user.userId)) return res.status(400).json({ error: 'Cannot send request to yourself' });

    const targetUser = await User.findByPk(toUserId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const fromUser = await User.findByPk(req.user.userId);
    const existingFriend = await fromUser.getFriends({ where: { id: toUserId } });
    if (existingFriend.length > 0) return res.status(400).json({ error: 'Already friends' });

    const existingPending = await FriendRequest.findOne({
      where: {
        status: 'pending',
        [Op.or]: [
          { fromId: req.user.userId, toId: toUserId },
          { fromId: toUserId, toId: req.user.userId }
        ]
      }
    });

    if (existingPending) return res.status(400).json({ error: 'Friend request already pending' });

    await FriendRequest.create({ fromId: req.user.userId, toId: toUserId });

    io.emit('friend request update', { toUserId });
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
    if (String(request.toId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Not allowed to accept this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${request.status}` });
    }

    request.status = 'accepted';
    await request.save();

    const fromUser = await User.findByPk(request.fromId);
    const toUser = await User.findByPk(request.toId);

    await fromUser.addFriend(toUser);
    await toUser.addFriend(fromUser);

    io.emit('friend request accepted', {
      requestId: request.id,
      fromId: request.fromId,
      toId: request.toId
    });

    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/friends/reject', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FriendRequest.findByPk(requestId);

    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (String(request.toId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Not allowed to reject this request' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${request.status}` });
    }

    request.status = 'rejected';
    await request.save();

    io.emit('friend request rejected', {
      requestId: request.id,
      fromId: request.fromId,
      toId: request.toId
    });

    res.json({ message: 'Friend request rejected' });
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

app.delete('/api/dms/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    await DirectMessage.destroy({
      where: {
        [Op.or]: [
          { fromId: req.user.userId, toId: friendId },
          { fromId: friendId, toId: req.user.userId }
        ]
      }
    });

    
    emitToUser(friendId, 'dm history cleared', {
      fromUserId: req.user.userId,
      clearedAt: new Date().toISOString()
    });

    res.json({ message: 'DM history cleared for both users' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



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
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by Socket.IO CORS'));
    },
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Map();
const roomMessages = new Map();

function normalizeRoomKey(roomType, roomName) {
  return String(roomType || 'community') + ':' + String(roomName || '').trim().toLowerCase();
}

function getRoomMessages(roomType, roomName) {
  const key = normalizeRoomKey(roomType, roomName);
  return roomMessages.get(key) || [];
}

function appendRoomMessage(roomType, roomName, payload) {
  const key = normalizeRoomKey(roomType, roomName);
  const messages = roomMessages.get(key) || [];
  messages.push(payload);
  if (messages.length > 300) {
    messages.splice(0, messages.length - 300);
  }
  roomMessages.set(key, messages);
}

function emitToUser(userId, eventName, payload) {
  let delivered = 0;
  for (const [socketId, userData] of onlineUsers.entries()) {
    if (String(userData.userId) === String(userId)) {
      io.to(socketId).emit(eventName, payload);
      delivered += 1;
    }
  }

  return delivered;
}
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

      const dmPayload = {
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
      };

      
      emitToUser(socket.userId, 'dm message', dmPayload);
      const deliveredToRecipient = emitToUser(toUserId, 'dm message', dmPayload);

      if (deliveredToRecipient === 0) {
        socket.emit('dm delivery status', {
          messageId: dm.messageId,
          toUserId,
          delivered: false
        });
      }
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

  socket.on('community typing', (data) => {
    const roomName = data?.community;
    if (!roomName) return;
    const roomKey = normalizeRoomKey('community', roomName);
    socket.broadcast.to(roomKey).emit('community user typing', {
      community: roomName,
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('community stop typing', (data) => {
    const roomName = data?.community;
    if (!roomName) return;
    const roomKey = normalizeRoomKey('community', roomName);
    socket.broadcast.to(roomKey).emit('community user stop typing', {
      community: roomName,
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('room typing', (data) => {
    const roomName = data?.roomName || data?.roomId;
    if (!roomName) return;
    const roomType = data?.roomType || 'group';
    const roomKey = normalizeRoomKey(roomType, roomName);
    socket.broadcast.to(roomKey).emit('room user typing', {
      roomType,
      roomId: roomName,
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('room stop typing', (data) => {
    const roomName = data?.roomName || data?.roomId;
    if (!roomName) return;
    const roomType = data?.roomType || 'group';
    const roomKey = normalizeRoomKey(roomType, roomName);
    socket.broadcast.to(roomKey).emit('room user stop typing', {
      roomType,
      roomId: roomName,
      userId: socket.userId,
      username: socket.username
    });
  });

  socket.on('join room chat', (data) => {
    const roomType = data?.roomType;
    const roomName = data?.roomName;
    if (!roomType || !roomName) return;

    const roomKey = normalizeRoomKey(roomType, roomName);

    if (socket.currentRoomKey && socket.currentRoomKey !== roomKey) {
      socket.leave(socket.currentRoomKey);
    }

    socket.join(roomKey);
    socket.currentRoomKey = roomKey;

    socket.emit('room chat history', {
      roomType,
      roomName,
      messages: getRoomMessages(roomType, roomName)
    });
  });

  socket.on('leave room chat', (data) => {
    const roomType = data?.roomType;
    const roomName = data?.roomName;
    if (!roomType || !roomName) return;

    const roomKey = normalizeRoomKey(roomType, roomName);
    socket.leave(roomKey);

    if (socket.currentRoomKey === roomKey) {
      socket.currentRoomKey = null;
    }
  });

  socket.on('send room message', (data) => {
    const roomType = data?.roomType;
    const roomName = data?.roomName;
    if (!roomType || !roomName) return;

    const messagePayload = {
      messageId: uuidv4(),
      from: socket.userId,
      fromUsername: socket.username,
      fromAvatar: socket.userAvatar || null,
      content: data?.content || '',
      mediaType: data?.mediaType || 'text',
      mediaUrl: data?.mediaUrl || null,
      roomType,
      roomName,
      timestamp: new Date().toISOString()
    };

    appendRoomMessage(roomType, roomName, messagePayload);
    const roomKey = normalizeRoomKey(roomType, roomName);
    io.to(roomKey).emit('room message', messagePayload);
  });

  socket.on('clear room chat', (data) => {
    const roomType = data?.roomType;
    const roomName = data?.roomName;
    if (!roomType || !roomName) return;

    const roomKey = normalizeRoomKey(roomType, roomName);
    roomMessages.set(roomKey, []);
    io.to(roomKey).emit('room chat cleared', { roomType, roomName, clearedBy: socket.userId });
  });
  socket.on('send friend request', async (data) => {
    try {
      const toUserId = data?.toUserId;
      if (!toUserId) {
        socket.emit('error', 'Target user is required');
        return;
      }

      if (String(toUserId) === String(socket.userId)) {
        socket.emit('error', 'Cannot send request to yourself');
        return;
      }

      const targetUser = await User.findByPk(toUserId);
      if (!targetUser) {
        socket.emit('error', 'User not found');
        return;
      }

      const fromUser = await User.findByPk(socket.userId);
      const existingFriend = await fromUser.getFriends({ where: { id: toUserId } });
      if (existingFriend.length > 0) {
        socket.emit('error', 'Already friends');
        return;
      }

      const existingPending = await FriendRequest.findOne({
        where: {
          status: 'pending',
          [Op.or]: [
            { fromId: socket.userId, toId: toUserId },
            { fromId: toUserId, toId: socket.userId }
          ]
        }
      });

      if (existingPending) {
        socket.emit('error', 'Friend request already pending');
        return;
      }

      const newRequest = await FriendRequest.create({ fromId: socket.userId, toId: toUserId });

      socket.emit('friend request sent', { requestId: newRequest.id, toUserId });
      emitToUser(toUserId, 'friend request received', {
        requestId: newRequest.id,
        fromId: socket.userId,
        fromUsername: socket.username,
        fromAvatar: socket.userAvatar || null
      });
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('start video call', async (data) => {
    try {
      const targetId = data?.targetId;
      if (!targetId) {
        socket.emit('error', 'Call target is required');
        return;
      }

      const targetUser = await User.findByPk(targetId);
      if (!targetUser) {
        socket.emit('error', 'User not found');
        return;
      }

      const callId = uuidv4();
      const payload = {
        callId,
        fromId: socket.userId,
        fromUsername: socket.username,
        fromAvatar: socket.userAvatar || null,
        toId: targetId,
        type: data?.type || 'dm',
        startedAt: new Date().toISOString()
      };

      const deliveredToTarget = emitToUser(targetId, 'incoming video call', payload);
      socket.emit('video call ringing', {
        ...payload,
        deliveredToTarget: deliveredToTarget > 0
      });

      if (deliveredToTarget === 0) {
        socket.emit('video call unavailable', {
          callId,
          targetId,
          message: 'User is currently offline or not connected.'
        });
      }
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('accept video call', (data) => {
    const callId = data?.callId;
    const targetCallerId = data?.toId;
    if (!callId || !targetCallerId) return;

    emitToUser(targetCallerId, 'video call accepted', {
      callId,
      byUserId: socket.userId,
      byUsername: socket.username,
      acceptedAt: new Date().toISOString()
    });
  });

  socket.on('reject video call', (data) => {
    const callId = data?.callId;
    const targetCallerId = data?.toId;
    if (!callId || !targetCallerId) return;

    emitToUser(targetCallerId, 'video call rejected', {
      callId,
      byUserId: socket.userId,
      byUsername: socket.username,
      rejectedAt: new Date().toISOString()
    });
  });

  socket.on('end video call', (data) => {
    const callId = data?.callId;
    const peerUserId = data?.toId;
    if (!callId || !peerUserId) return;

    emitToUser(peerUserId, 'video call ended', {
      callId,
      byUserId: socket.userId,
      byUsername: socket.username,
      endedAt: new Date().toISOString()
    });
  });

  socket.on('video signal', (data) => {
    const toId = data?.toId;
    const signal = data?.signal;
    if (!toId || !signal) return;

    emitToUser(toId, 'video signal', {
      fromId: socket.userId,
      fromUsername: socket.username,
      callId: data?.callId || null,
      signal
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


async function migrateMediaTypeEnum() {
  try {
    
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

async function seedShopItems() {
  const existingCount = await ShopItem.count();
  if (existingCount > 0) return;

  const items = [
    { itemId: 'banner_neon', name: 'Neon Banner Effect', description: 'Animated neon gradient banner for your profile.', price: 450, category: 'Banners', image: '' },
    { itemId: 'badge_founder', name: 'Founder Badge', description: 'Exclusive badge shown next to your username.', price: 320, category: 'Badges', image: '' },
    { itemId: 'color_pack_burst', name: 'Color Burst Pack', description: 'Unlock vibrant accent color themes.', price: 380, category: 'Themes', image: '' },
    { itemId: 'chat_fx_glow', name: 'Message Glow FX', description: 'Subtle glow animation for sent messages.', price: 260, category: 'Effects', image: '' },
    { itemId: 'avatar_ring_aura', name: 'Aura Avatar Ring', description: 'Premium animated ring around your avatar.', price: 520, category: 'Avatar', image: '' },
    { itemId: 'nameplate_crystal', name: 'Crystal Nameplate', description: 'Polished nameplate style in member list.', price: 410, category: 'Nameplates', image: '' },
    { itemId: 'theme_midnight', name: 'Midnight Theme Pack', description: 'Elegant dark gradients and UI accents.', price: 290, category: 'Themes', image: '' },
    { itemId: 'emoji_pack_pro', name: 'Pro Emoji Pack', description: 'Premium emoji reactions collection.', price: 210, category: 'Emotes', image: '' }
  ];

  await ShopItem.bulkCreate(items);
}

sequelize.sync({ alter: true }).then(async () => {
  await migrateMediaTypeEnum();
  await seedShopItems();
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




