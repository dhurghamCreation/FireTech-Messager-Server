# Discord-Like Chat App - Features

## 🎯 Core Features Implemented

### 1. User Authentication & Profiles
- ✅ **Registration System** - Create new account with email/password/username
- ✅ **Login System** - Persistent login with JWT tokens
- ✅ **Profile Management** - Edit username, bio, and avatar
- ✅ **Profile Viewing** - View other users' profiles
- ✅ **Online Status** - Real-time online/offline status tracking
- ✅ **Permanent Accounts** - All data saved to MongoDB

### 2. Real-Time Messaging
- ✅ **Text Channels** - #general and more
- ✅ **Voice Channels** - Voice Chat support
- ✅ **Real-Time Messages** - Socket.IO powered messaging
- ✅ **Message History** - Persisted in database
- ✅ **Typing Indicators** - See who's typing
- ✅ **Timestamps** - Auto-formatted message times
- ✅ **Online Members List** - See who's online in sidebar

### 3. Media Sharing
- ✅ **Image Upload** - Share PNG, JPG, GIF, WebP
- ✅ **Video Upload** - Share MP4, WebM, etc
- ✅ **Media Preview** - Inline image/video display
- ✅ **Max File Size** - 50MB limit
- ✅ **Base64 Encoding** - Direct message attachment

### 4. Friends System
- ✅ **Add Friends** - Send friend requests
- ✅ **Friend Requests** - Accept/reject requests
- ✅ **Friends List** - View all friends with status
- ✅ **Online Indicators** - Green dot for online
- ✅ **Persistent Storage** - Friends saved to database

### 5. Shop & Economy System
- ✅ **Virtual Currency** - 1000 starting coins
- ✅ **Shop Items** - Browse purchasable items
- ✅ **Purchase Items** - Spend coins to buy
- ✅ **Inventory** - View purchased items
- ✅ **Item Categories** - Badges, profiles, themes, etc
- ✅ **Price Display** - Shows cost and balance

### 6. UI/UX Features
- ✅ **Discord-Inspired Theme** - Dark mode with purple accents
- ✅ **Responsive Design** - Works on all devices
- ✅ **Sidebar Navigation** - Easy channel switching
- ✅ **Profile Panel** - Slide-in profile editor
- ✅ **Modal Windows** - Friends and shop modals
- ✅ **Animations** - Smooth transitions
- ✅ **Scrollbars** - Custom styled scrollbars
- ✅ **Mobile Responsive** - Mobile-friendly layout

### 7. Backend Architecture
- ✅ **Express.js Server** - RESTful API
- ✅ **Socket.IO** - Real-time communication
- ✅ **MongoDB** - Document database
- ✅ **Mongoose** - Database ORM
- ✅ **JWT Authentication** - Secure tokens
- ✅ **BCrypt** - Password hashing
- ✅ **CORS** - Cross-origin support
- ✅ **Environment Variables** - Configuration management

## 📊 Data Models

### User Model
```javascript
{
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  avatar: String,
  bio: String,
  status: 'online' | 'offline' | 'away',
  friends: [User],
  blockedUsers: [User],
  coins: Number,
  createdAt: Date
}
```

### Channel Model
```javascript
{
  channelId: String,
  name: String,
  type: 'text' | 'voice',
  description: String,
  isPrivate: Boolean,
  members: [User],
  createdBy: User,
  createdAt: Date
}
```

### Message Model
```javascript
{
  messageId: String,
  channelId: String,
  sender: User,
  senderUsername: String,
  content: String,
  mediaType: 'text' | 'image' | 'video' | 'emoji',
  mediaUrl: String,
  timestamp: Date,
  reactions: [{ emoji, users }]
}
```

### Shop Item Model
```javascript
{
  itemId: String,
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  createdAt: Date
}
```

### Friend Request Model
```javascript
{
  from: User,
  to: User,
  status: 'pending' | 'accepted' | 'rejected',
  createdAt: Date
}
```

## 🔌 Socket.IO Events

### Emit (Client → Server)
- `join` - User joins with authentication
- `join channel` - User joins a specific channel
- `leave channel` - User leaves a channel
- `send message` - Send text/media message
- `typing` - User is typing
- `stop typing` - User stopped typing
- `start voice call` - Initiate voice call

### Listen (Server → Client)
- `users update` - Online users list
- `message` - New message received
- `user typing` - Someone is typing
- `user stop typing` - Someone stopped typing
- `voice call started` - Voice call initiated

## 📡 API Endpoints

### Authentication
- `POST /api/register` - Create new account
- `POST /api/login` - Login with email/password

### Profile
- `GET /api/profile/:userId` - Get user profile
- `PUT /api/profile` - Update own profile

### Friends
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests` - Get pending requests
- `POST /api/friends/accept` - Accept request
- `GET /api/friends` - Get friends list

### Shop
- `GET /api/shop` - Get all shop items
- `POST /api/shop/buy` - Purchase item
- `GET /api/inventory` - Get user inventory

### Channels
- `POST /api/channels` - Create new channel
- `GET /api/channels` - Get accessible channels

## 🎨 UI Sections

### 1. Authentication Page
- Login form with email/password
- Registration toggle
- Form validation
- Error messages

### 2. Main Chat Interface
- **Left Guild Sidebar** (72px)
  - Chat button
  - Friends button
  - Shop button

- **Channel Sidebar** (240px)
  - Channel list
  - Channel indicator
  - Channel icons

- **Main Chat Area**
  - Chat header with title
  - Messages display
  - Online members indicator
  - Message input

- **Right Members Sidebar** (240px)
  - Online members list
  - Status indicators

- **Profile Panel** (Slide-in)
  - Profile info
  - Edit buttons
  - Bio editor
  - Tabs: Profile, Inventory

- **Friends Modal**
  - Friend requests
  - Friends list
  - Status indicators

- **Shop Modal**
  - Item list
  - Coin display
  - Purchase buttons
  - Item categories

## 🛡️ Security Features

### Password Security
- BCrypt hashing with salt rounds
- Minimum password requirements
- Secure password comparison

### Authentication
- JWT tokens with expiration
- Token stored in localStorage
- Authorization headers on API calls

### Database
- MongoDB connection with credentials
- Query parameterization
- Input validation

### API
- CORS configuration
- Request body size limits
- Rate limiting ready

## 🚀 Performance Optimizations

- Socket.IO namespaces for scalability
- Message batching in channel history
- Lazy loading of user profiles
- Image optimization with base64
- Efficient database queries with indexes
- Client-side caching

## 🔄 Workflow Examples

### User Registration
1. User fills in registration form
2. Submit → API /register
3. Password hashed with BCrypt
4. User saved to MongoDB
5. JWT token generated
6. Token stored in localStorage
7. Auto-login and connect to Socket.IO

### Sending a Message
1. User types message
2. Click send or press Enter
3. Message emitted via Socket.IO
4. Server saves to database
5. Message broadcast to channel
6. All connected users receive
7. Message rendered in chat

### Purchasing Item
1. User browses shop
2. Click "Buy" button
3. Server checks coins
4. Deduct coins from account
5. Add item to inventory
6. Update user in database
7. Refresh UI with new balance

## 📱 Responsive Breakpoints

- **Desktop**: 1200px+ (4 columns)
- **Tablet**: 768px - 1199px (3 columns)
- **Mobile**: < 768px (2 columns, sidebar toggles)

## 🎯 Summary

This Discord-like application provides a complete real-time communication platform with:
- Persistent user accounts
- Real-time messaging
- Media sharing capabilities
- Social features (friends, status)
- Economy system (shop, coins, inventory)
- Professional UI/UX
- Scalable backend architecture

All data is persisted in MongoDB, making accounts permanent across sessions!
