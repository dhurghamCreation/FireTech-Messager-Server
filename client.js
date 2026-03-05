// ==================== GLOBAL STATE ====================
let socket;
let currentUser = null;
let currentToken = null;
let isRegistering = false;
let currentChatFriendId = null;
let currentChatFriendName = null;

const API_BASE = '/api';

// ==================== AUTH FUNCTIONS ====================

function toggleAuthMode() {
    isRegistering = !isRegistering;
    const usernameFields = document.getElementById('registerFields');
    const authTitle = document.getElementById('authTitle');
    const authButton = document.getElementById('authButton');
    const authToggle = document.querySelector('.auth-toggle span');

    if (isRegistering) {
        usernameFields.style.display = 'block';
        authTitle.textContent = 'Register';
        authButton.textContent = 'Create Account';
        authToggle.innerHTML = 'Already have an account? <button type="button">Login</button>';
    } else {
        usernameFields.style.display = 'none';
        authTitle.textContent = 'Login';
        authButton.textContent = 'Login';
        authToggle.innerHTML = `Don't have an account? <button type="button">Register</button>`;
    }

    document.querySelector('.auth-toggle button').onclick = toggleAuthMode;
}

async function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const username = document.getElementById('username').value.trim();

    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }

    try {
        let response;
        if (isRegistering) {
            if (!username) {
                alert('Username is required');
                return;
            }
            response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
        } else {
            response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
        }

        const data = await response.json();
        if (!response.ok) {
            alert(data.error || 'Authentication failed');
            return;
        }

        currentToken = data.token;
        currentUser = data.user;
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(currentUser));

        showMainApp();
        connectSocket();
    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    currentToken = null;
    if (socket) socket.disconnect();
    location.reload();
}

// ==================== SOCKET.IO CONNECTION ====================

function connectSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('join', { token: currentToken });
    });

    socket.on('users update', (users) => {
        updateMembersList(users);
    });

    socket.on('dm message', (data) => {
        addMessageToChat(data);
    });

    socket.on('dm user typing', (data) => {
        // Display typing indicator for DM
        showTypingIndicator(data.username);
    });

    socket.on('dm user stop typing', (data) => {
        // Hide typing indicator for DM
        hideTypingIndicator(data.username);
    });

    socket.on('error', (msg) => {
        console.error('Socket error:', msg);
    });
}

function showTypingIndicator(username) {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) {
        typingDiv.textContent = `${username} is typing...`;
        typingDiv.style.display = 'block';
    }
}

function hideTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) {
        typingDiv.style.display = 'none';
    }
}

// ==================== UI FUNCTIONS ====================

function showMainApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainApp').classList.remove('hidden');
    loadUserProfile();
    loadShopItems();
}

function showSection(section) {
    if (section === 'chat') {
        document.querySelector('.chat-area').style.display = 'flex';
        document.getElementById('friendsModal').classList.add('hidden');
        document.getElementById('shopModal').classList.add('hidden');
        loadFriendsForDM();
    } else if (section === 'friends') {
        document.querySelector('.chat-area').style.display = 'none';
        loadFriends();
        document.getElementById('friendsModal').classList.remove('hidden');
    } else if (section === 'shop') {
        document.querySelector('.chat-area').style.display = 'none';
        loadShopItems();
        document.getElementById('shopModal').classList.remove('hidden');
    }
}

function openDM(friendId, friendName) {
    currentChatFriendId = friendId;
    currentChatFriendName = friendName;
    
    // Update UI
    document.getElementById('chatTitle').textContent = `💬 ${friendName}`;
    document.getElementById('messages-container').innerHTML = '';
    
    // Load previous messages
    loadDMMessages(friendId);
    
    // Join DM room
    if (socket && socket.connected) {
        socket.emit('join dm', friendId);
    }
    
    showSection('chat');
}

async function loadDMMessages(friendId) {
    try {
        const response = await fetch(`${API_BASE}/dms/${friendId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const messages = await response.json();
        
        // Clear and load messages
        document.getElementById('messages-container').innerHTML = '';
        messages.forEach(msg => {
            addMessageToChat({
                from: msg.from,
                fromUsername: msg.fromUsername,
                fromAvatar: msg.senderAvatar || msg.fromUsername.charAt(0).toUpperCase(),
                content: msg.content,
                mediaType: msg.mediaType,
                mediaUrl: msg.mediaUrl,
                timestamp: msg.timestamp
            });
        });
    } catch (error) {
        console.error('Failed to load DM messages:', error);
    }
}

function toggleChannelSidebar() {
    document.getElementById('channelSidebar').classList.toggle('show');
}

function openProfile() {
    document.getElementById('profilePanel').classList.add('show');
    loadUserProfile();
}

function closeProfile() {
    document.getElementById('profilePanel').classList.remove('show');
}

function switchProfileTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tab + 'Tab').classList.add('active');

    if (tab === 'inventory') {
        loadInventory();
    }
}

function closeFriendsModal() {
    document.getElementById('friendsModal').classList.add('hidden');
    showSection('chat');
}

function closeShopModal() {
    document.getElementById('shopModal').classList.add('hidden');
    showSection('chat');
}

// ==================== PROFILE FUNCTIONS ====================

async function loadUserProfile() {
    try {
        const response = await fetch(`${API_BASE}/profile/${currentUser.id}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const user = await response.json();

        document.getElementById('profileAvatar').textContent = user.username.charAt(0).toUpperCase();
        document.getElementById('profileName').textContent = user.username;
        document.getElementById('profileBio').textContent = user.bio || 'No bio yet';
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editBio').value = user.bio;
        document.getElementById('coinsDisplay').textContent = `💰 Coins: ${user.coins}`;

        currentUser = user;
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

async function saveProfile() {
    try {
        const username = document.getElementById('editUsername').value;
        const bio = document.getElementById('editBio').value;

        const response = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ username, bio, avatar: currentUser.avatar || '' })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Profile updated successfully!');
            loadUserProfile();
        } else {
            alert(data.error);
        }
    } catch (error) {
        console.error(error);
        alert('Error saving profile');
    }
}

// ==================== MESSAGING FUNCTIONS ====================

function handleMessageKeypress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content || !currentChatFriendId) {
        alert('Please select a friend to chat with');
        return;
    }

    try {
        socket.emit('send dm', {
            toUserId: currentChatFriendId,
            content: content,
            mediaType: 'text'
        });
        input.value = '';
        hideTypingIndicator();
    } catch (error) {
        console.error(error);
    }
}

function addMessageToChat(data) {
    const container = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = (data.fromUsername || data.sender || 'U').charAt(0).toUpperCase();

    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    const username = document.createElement('span');
    username.className = 'message-username';
    username.textContent = data.fromUsername || data.sender;

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = new Date(data.timestamp).toLocaleTimeString();

    header.appendChild(username);
    header.appendChild(time);

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = data.content;

    content.appendChild(header);
    content.appendChild(text);

    if (data.mediaType !== 'text' && data.mediaUrl) {
        const media = document.createElement('div');
        media.className = 'message-media';

        if (data.mediaType === 'image') {
            const img = document.createElement('img');
            img.src = data.mediaUrl;
            media.appendChild(img);
        } else if (data.mediaType === 'video') {
            const video = document.createElement('video');
            video.src = data.mediaUrl;
            video.controls = true;
            media.appendChild(video);
        }
        content.appendChild(media);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    container.appendChild(messageDiv);
    
    // Scroll to the latest message smoothly
    setTimeout(() => {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 10);
}

function updateMembersList(users) {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'member-item';

        const status = document.createElement('div');
        status.className = 'status-indicator';

        const name = document.createElement('span');
        name.textContent = user.username;

        item.appendChild(status);
        item.appendChild(name);
        membersList.appendChild(item);
    });
}

// ==================== FILE UPLOAD ====================

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentChatFriendId) {
        alert('Please select a friend to chat with');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = e.target.result;
        const mediaType = file.type.startsWith('image') ? 'image' : 'video';

        socket.emit('send dm', {
            toUserId: currentChatFriendId,
            content: file.name,
            mediaType: mediaType,
            mediaUrl: data
        });
    };
    reader.readAsDataURL(file);

    // Reset the input
    event.target.value = '';
}

async function uploadProfileImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const avatar = e.target.result;
        try {
            const response = await fetch(`${API_BASE}/profile/upload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ avatar })
            });

            const data = await response.json();
            if (response.ok) {
                currentUser.avatar = data.avatar;
                loadUserProfile();
                alert('Profile image updated!');
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error uploading profile image');
        }
    };
    reader.readAsDataURL(file);

    // Reset the input
    event.target.value = '';
}

// ==================== FRIENDS FUNCTIONS ====================

async function loadFriendsForDM() {
    try {
        const response = await fetch(`${API_BASE}/friends`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const friends = await response.json();

        const channelsList = document.getElementById('channelsList');
        channelsList.innerHTML = '<div style="padding: 10px; color: var(--text-secondary); font-size: 12px; font-weight: bold;">DIRECT MESSAGES</div>';
        
        if (friends.length === 0) {
            channelsList.innerHTML += '<div style="padding: 10px; color: var(--text-secondary); font-size: 12px;">No friends yet</div>';
        } else {
            friends.forEach(friend => {
                const item = document.createElement('div');
                item.className = 'channel-item';
                item.dataset.friendId = friend._id;
                
                const status = friend.status === 'online' ? '🟢' : '⚫';
                item.textContent = `${status} ${friend.username}`;
                
                item.style.cursor = 'pointer';
                item.onclick = () => openDM(friend._id, friend.username);
                
                channelsList.appendChild(item);
            });
        }
    } catch (error) {
        console.error('Failed to load friends for DM:', error);
    }
}

async function loadFriends() {
    try {
        const [requests, friends] = await Promise.all([
            fetch(`${API_BASE}/friends/requests`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            }).then(r => r.json()),
            fetch(`${API_BASE}/friends`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            }).then(r => r.json())
        ]);

        const requestsDiv = document.getElementById('friendRequests');
        requestsDiv.innerHTML = '';
        if (requests.length === 0) {
            requestsDiv.innerHTML = '<p style="color: var(--text-secondary);">No pending requests</p>';
        }
        requests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div>
                    <div class="friend-name">${req.from.username}</div>
                    <div class="friend-status">pending</div>
                </div>
                <div>
                    <button onclick="acceptFriendRequest('${req._id}')" class="buy-btn">Accept</button>
                </div>
            `;
            requestsDiv.appendChild(item);
        });

        const friendsList = document.getElementById('friendsList');
        friendsList.innerHTML = '';
        if (friends.length === 0) {
            friendsList.innerHTML = '<p style="color: var(--text-secondary);">No friends yet</p>';
        }
        friends.forEach(friend => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.style.cursor = 'pointer';
            const status = friend.status === 'online' ? '🟢 Online' : '⚫ Offline';
            item.innerHTML = `
                <div onclick="openDM('${friend._id}', '${friend.username}')">
                    <div class="friend-name">${friend.username}</div>
                    <div class="friend-status">${status}</div>
                </div>
            `;
            friendsList.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load friends:', error);
    }
}

async function acceptFriendRequest(requestId) {
    try {
        const response = await fetch(`${API_BASE}/friends/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ requestId })
        });

        if (response.ok) {
            alert('Friend request accepted!');
            loadFriends();
        }
    } catch (error) {
        console.error(error);
    }
}

// ==================== SHOP FUNCTIONS ====================

async function loadShopItems() {
    try {
        const response = await fetch(`${API_BASE}/shop`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const items = await response.json();

        const shopList = document.getElementById('shopList');
        shopList.innerHTML = '';

        if (items.length === 0) {
            shopList.innerHTML = '<p style="color: var(--text-secondary);">No shop items available</p>';
        } else {
            items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'shop-item';
                itemDiv.innerHTML = `
                    <div>
                        <div class="shop-item-name">${item.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${item.description}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="shop-item-price">${item.price} 💰</span>
                        <button onclick="buyItem('${item._id}')" class="buy-btn">Buy</button>
                    </div>
                `;
                shopList.appendChild(itemDiv);
            });
        }

        loadUserProfile();
    } catch (error) {
        console.error('Failed to load shop:', error);
    }
}

async function buyItem(itemId) {
    try {
        const response = await fetch(`${API_BASE}/shop/buy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ itemId })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Item purchased!');
            loadShopItems();
        } else {
            alert(data.error);
        }
    } catch (error) {
        console.error(error);
        alert('Error purchasing item');
    }
}

// ==================== INVENTORY FUNCTIONS ====================

async function loadInventory() {
    try {
        const response = await fetch(`${API_BASE}/inventory`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const inventory = await response.json();

        const inventoryList = document.getElementById('inventoryList');
        inventoryList.innerHTML = '';

        if (inventory.length === 0) {
            inventoryList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No items yet</p>';
            return;
        }

        inventory.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            itemDiv.innerHTML = `
                <div>
                    <div class="shop-item-name">${item.itemId.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">Qty: ${item.quantity}</div>
                </div>
            `;
            inventoryList.appendChild(itemDiv);
        });
    } catch (error) {
        console.error('Failed to load inventory:', error);
    }
}

// ==================== INITIALIZATION ====================

window.addEventListener('DOMContentLoaded', () => {
    // Check for existing token
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');

    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        showMainApp();
        connectSocket();
    } else {
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('mainApp').classList.add('hidden');
    }
});
