// ==================== GLOBAL STATE ====================
let socket;
let currentUser = null;
let currentToken = null;
let isRegistering = false;
let currentChatFriendId = null;
let currentChatFriendName = null;
let currentChatContext = { type: 'none', id: null, name: null };
let pendingMediaDraft = null;
let pendingMediaDrafts = [];
let roomMessages = JSON.parse(localStorage.getItem('roomMessages') || '{}');
let pinnedChats = [];
let joinedCommunities = [];
let joinedGroups = [];
let chatSettings = {
    disappearTime: 0,
    enterToSend: true,
    showTypingIndicator: true,
    autoplayGifs: true,
    compactMode: false,
    fontSize: 'medium',
    notificationMode: 'all',
    notifyOnSent: false,
    notifyOnReceived: true,
    messageSound: true,
    desktopNotifications: false
};
let audioSettings = {
    microphoneId: 'default',
    speakerId: 'default'
};
let themeSettings = {
    mode: 'dark',
    customColors: {
        primary: '#5865F2',
        accent: '#57F287',
        background: '#1e1f22',
        sidebar: '#2b2d31',
        textPrimary: '#ffffff',
        textSecondary: '#b5bac1',
        iconColor: '#ffffff',
        borderColor: '#3f4147'
    }
};

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
    const forgotWrap = document.getElementById('forgotPasswordWrap');
    const resetPanel = document.getElementById('resetPasswordPanel');
    if (forgotWrap) forgotWrap.style.display = isRegistering ? 'none' : 'block';
    if (resetPanel) resetPanel.classList.remove('show');
}

function toggleForgotPasswordPanel() {
    const panel = document.getElementById('resetPasswordPanel');
    if (!panel) return;
    panel.classList.toggle('show');
}

async function resetForgottenPassword() {
    const email = document.getElementById('resetEmail')?.value.trim();
    const newPassword = document.getElementById('resetNewPassword')?.value.trim();

    if (!email || !newPassword) {
        showToast('Enter your email and new password', 'warning');
        return;
    }

    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, newPassword })
        });

        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to reset password', 'error');
            return;
        }

        showToast('Password reset successful. You can now login.', 'success');
        document.getElementById('resetPasswordPanel')?.classList.remove('show');
        if (document.getElementById('password')) {
            document.getElementById('password').value = '';
        }
    } catch (error) {
        console.error(error);
        showToast('Error resetting password', 'error');
    }
}

async function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const username = document.getElementById('username').value.trim();

    if (!email || !password) {
        showToast('Please fill in all fields', 'warning');
        return;
    }

    try {
        let response;
        if (isRegistering) {
            if (!username) {
                showToast('Username is required', 'warning');
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
            showToast(data.error || 'Authentication failed', 'error');
            return;
        }

        currentToken = data.token;
        currentUser = data.user;
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        saveAccountSession();

        showMainApp();
        connectSocket();
    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
    }
}

function logout(preserveAccounts = true) {
    if (!preserveAccounts) {
        localStorage.removeItem('rememberedAccounts');
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    currentToken = null;
    if (socket) socket.disconnect();
    location.reload();
}

function saveAccountSession() {
    if (!currentUser || !currentToken) return;
    const accounts = JSON.parse(localStorage.getItem('rememberedAccounts') || '[]');
    const filtered = accounts.filter(account => account.id !== currentUser.id);
    filtered.unshift({
        id: currentUser.id,
        username: currentUser.username,
        email: currentUser.email,
        token: currentToken,
        user: currentUser
    });
    localStorage.setItem('rememberedAccounts', JSON.stringify(filtered.slice(0, 5)));
}

function populateAccountSwitcher() {
    const switcher = document.getElementById('accountSwitcher');
    if (!switcher) return;
    const accounts = JSON.parse(localStorage.getItem('rememberedAccounts') || '[]');
    switcher.innerHTML = '';

    if (accounts.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No saved accounts';
        switcher.appendChild(option);
        return;
    }

    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.username} (${account.email})`;
        if (currentUser && account.id === currentUser.id) {
            option.textContent += ' - Current';
        }
        switcher.appendChild(option);
    });
}

function switchAccount() {
    const switcher = document.getElementById('accountSwitcher');
    if (!switcher) return;

    const selectedId = switcher.value;
    const accounts = JSON.parse(localStorage.getItem('rememberedAccounts') || '[]');
    const selected = accounts.find(account => account.id === selectedId);

    if (!selected) {
        showToast('Please select an account', 'warning');
        return;
    }

    localStorage.setItem('token', selected.token);
    localStorage.setItem('user', JSON.stringify(selected.user));
    showToast(`Switched to ${selected.username}`);
    setTimeout(() => location.reload(), 400);
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
        const fromId = String(data.from);
        const toId = String(data.to);
        const myId = String(currentUser.id);
        const isSender = fromId === myId;
        const otherUserId = isSender ? toId : fromId;
        const isCurrentChat = currentChatFriendId && String(currentChatFriendId) === String(otherUserId);

        if (isCurrentChat) {
            addMessageToChat(data);
        }

        if (isSender && chatSettings.notifyOnSent) {
            showToast('Message sent', 'success');
        }

        if (!isSender && chatSettings.notifyOnReceived) {
            const messagePreview = data.mediaType === 'text' ? data.content : `${data.mediaType} message`;
            showToast(`New message from ${data.fromUsername}: ${messagePreview}`, 'warning');
            showDesktopNotification(`New message from ${data.fromUsername}`, messagePreview, false);
            playNotificationSound();
        }
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
        showToast(msg || 'Realtime error', 'error');
    });
}

function showTypingIndicator(username) {
    if (!chatSettings.showTypingIndicator) return;
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
    
    // Check if there's a friend request in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const addFriendId = urlParams.get('addFriend');
    if (addFriendId && addFriendId !== currentUser.id) {
        sendFriendRequestFromLink(addFriendId);
        // Clean up the URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
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
    currentChatContext = { type: 'dm', id: friendId, name: friendName };
    clearPendingMediaDraft();
    
    // Check if chatting with self
    const isSelfChat = friendId === currentUser.id;
    const displayName = isSelfChat ? `📝 ${currentUser.username} (Notes)` : `💬 ${friendName}`;
    
    // Update UI
    document.getElementById('chatTitle').textContent = displayName;
    document.getElementById('messages-container').innerHTML = '';
    refreshChatScrollbar();
    
    // Show close chat button
    document.getElementById('closeChatBtn').style.display = 'block';
    
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
                fromAvatar: msg.fromAvatar || null,
                content: msg.content,
                mediaType: msg.mediaType,
                mediaUrl: msg.mediaUrl,
                timestamp: msg.timestamp
            });
        });
        refreshChatScrollbar();
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

function shareProfileLink() {
    const profileUrl = `${window.location.origin}?addFriend=${currentUser.id}`;
    
    navigator.clipboard.writeText(profileUrl).then(() => {
        showToast('Profile link copied to clipboard! Share with friends to connect.');
    }).catch(() => {
        const tempInput = document.createElement('input');
        tempInput.value = profileUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        showToast('Profile link copied!');
    });
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

        const profileAvatar = document.getElementById('profileAvatar');
        if (user.avatar) {
            profileAvatar.style.backgroundImage = `url(${user.avatar})`;
            profileAvatar.style.backgroundSize = 'cover';
            profileAvatar.style.backgroundPosition = 'center';
            profileAvatar.textContent = '';
        } else {
            profileAvatar.style.backgroundImage = 'none';
            profileAvatar.textContent = user.username.charAt(0).toUpperCase();
        }

        document.getElementById('profileName').textContent = user.username;
        document.getElementById('profileBio').textContent = user.bio || 'No bio yet';
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editBio').value = user.bio;
        const phoneInput = document.getElementById('editPhoneNumber');
        if (phoneInput) {
            phoneInput.value = user.phoneNumber || '';
        }
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
        const phoneNumber = document.getElementById('editPhoneNumber')?.value || '';

        const response = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ username, bio, phoneNumber, avatar: currentUser.avatar || '' })
        });

        const data = await response.json();
        if (response.ok) {
            showToast('Profile updated successfully!');
            loadUserProfile();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error saving profile', 'error');
    }
}

// ==================== MESSAGING FUNCTIONS ====================

function handleMessageKeypress(event) {
    if (event.key === 'Enter' && chatSettings.enterToSend) {
        sendMessage();
    }
}

function renderPendingMediaDraft() {
    const panel = document.getElementById('mediaDraftPreview');
    if (!panel) return;

    if (pendingMediaDrafts.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';
    const leftDiv = panel.querySelector('.draft-preview-left') || document.createElement('div');
    leftDiv.className = 'draft-preview-left';
    leftDiv.style.display = 'flex';
    leftDiv.style.gap = '10px';
    leftDiv.style.flexWrap = 'wrap';
    leftDiv.style.flex = '1';
    leftDiv.innerHTML = '';

    pendingMediaDrafts.forEach((draft, idx) => {
        const itemWrapper = document.createElement('div');
        itemWrapper.style.position = 'relative';
        itemWrapper.style.display = 'inline-block';

        if (draft.mediaType === 'image' || draft.mediaType === 'gif') {
            const img = document.createElement('img');
            img.src = draft.mediaUrl;
            img.style.maxWidth = '70px';
            img.style.maxHeight = '70px';
            img.style.borderRadius = '6px';
            img.style.border = '2px solid var(--primary-color)';
            itemWrapper.appendChild(img);
        } else if (draft.mediaType === 'sticker') {
            const emoji = document.createElement('span');
            emoji.textContent = draft.content || '😀';
            emoji.style.fontSize = '48px';
            emoji.style.display = 'flex';
            emoji.style.alignItems = 'center';
            emoji.style.justifyContent = 'center';
            emoji.style.width = '70px';
            emoji.style.height = '70px';
            emoji.style.borderRadius = '6px';
            emoji.style.background = 'var(--chat-bg)';
            emoji.style.border = '2px solid var(--primary-color)';
            itemWrapper.appendChild(emoji);
        } else if (draft.mediaType === 'video') {
            const vid = document.createElement('div');
            vid.textContent = '▶️ Video';
            vid.style.width = '70px';
            vid.style.height = '70px';
            vid.style.borderRadius = '6px';
            vid.style.background = 'var(--chat-bg)';
            vid.style.border = '2px solid var(--primary-color)';
            vid.style.display = 'flex';
            vid.style.alignItems = 'center';
            vid.style.justifyContent = 'center';
            vid.style.fontSize = '24px';
            itemWrapper.appendChild(vid);
        } else {
            const file = document.createElement('div');
            file.textContent = '📎 File';
            file.style.width = '70px';
            file.style.height = '70px';
            file.style.borderRadius = '6px';
            file.style.background = 'var(--chat-bg)';
            file.style.border = '2px solid var(--primary-color)';
            file.style.display = 'flex';
            file.style.alignItems = 'center';
            file.style.justifyContent = 'center';
            file.style.fontSize = '20px';
            itemWrapper.appendChild(file);
        }

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '✕';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-8px';
        removeBtn.style.right = '-8px';
        removeBtn.style.width = '28px';
        removeBtn.style.height = '28px';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.background = 'var(--primary-color)';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontSize = '16px';
        removeBtn.style.fontWeight = 'bold';
        removeBtn.style.display = 'flex';
        removeBtn.style.alignItems = 'center';
        removeBtn.style.justifyContent = 'center';
        removeBtn.style.transition = 'transform 0.1s';
        removeBtn.onclick = () => removeMediaDraft(idx);
        removeBtn.onmouseover = () => removeBtn.style.transform = 'scale(1.2)';
        removeBtn.onmouseout = () => removeBtn.style.transform = 'scale(1)';
        itemWrapper.appendChild(removeBtn);

        leftDiv.appendChild(itemWrapper);
    });

    if (!panel.querySelector('.draft-preview-left')) {
        const existingLeft = panel.querySelector('.draft-preview-left');
        if (existingLeft) existingLeft.remove();
        panel.insertBefore(leftDiv, panel.firstChild);
    } else {
        panel.querySelector('.draft-preview-left').innerHTML = leftDiv.innerHTML;
    }
}

function removeMediaDraft(index) {
    pendingMediaDrafts.splice(index, 1);
    pendingMediaDraft = pendingMediaDrafts[0] || null;
    if (pendingMediaDrafts.length === 0) {
        document.getElementById('mediaDraftPreview').style.display = 'none';
    }
    renderPendingMediaDraft();
    showToast('Media item removed', 'info');
}

function setPendingMediaDraft(draft) {
    pendingMediaDrafts.push(draft);
    pendingMediaDraft = pendingMediaDrafts[0] || null;
    renderPendingMediaDraft();
}

function clearPendingMediaDraft() {
    pendingMediaDrafts = [];
    pendingMediaDraft = null;
    renderPendingMediaDraft();
}

function scrollChatUp() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.scrollBy({ top: -220, behavior: 'smooth' });
}

function scrollChatDown() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    container.scrollBy({ top: 220, behavior: 'smooth' });
}

let isDraggingChatThumb = false;
let chatThumbDragOffset = 0;

function refreshChatScrollbar() {
    const container = document.getElementById('messages-container');
    const rail = document.getElementById('chatScrollRail');
    const thumb = document.getElementById('chatScrollThumb');
    if (!container || !rail || !thumb) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) {
        rail.classList.add('hidden');
        return;
    }

    rail.classList.remove('hidden');
    const trackHeight = rail.clientHeight;
    const thumbHeight = Math.max(56, Math.round((container.clientHeight / container.scrollHeight) * trackHeight));
    thumb.style.height = `${Math.min(trackHeight, thumbHeight)}px`;
    syncChatScrollbarPosition();
}

function syncChatScrollbarPosition() {
    const container = document.getElementById('messages-container');
    const rail = document.getElementById('chatScrollRail');
    const thumb = document.getElementById('chatScrollThumb');
    if (!container || !rail || !thumb || rail.classList.contains('hidden')) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    const maxThumbTravel = rail.clientHeight - thumb.offsetHeight;
    if (maxScroll <= 0 || maxThumbTravel <= 0) {
        thumb.style.transform = 'translateY(0px)';
        return;
    }

    const nextTop = (container.scrollTop / maxScroll) * maxThumbTravel;
    thumb.style.transform = `translateY(${nextTop}px)`;
}

function startChatScrollbarDrag(event) {
    const thumb = document.getElementById('chatScrollThumb');
    if (!thumb) return;
    isDraggingChatThumb = true;
    chatThumbDragOffset = event.clientY - thumb.getBoundingClientRect().top;
    event.preventDefault();
}

function stopChatScrollbarDrag() {
    isDraggingChatThumb = false;
}

function handleChatScrollbarDrag(event) {
    if (!isDraggingChatThumb) return;

    const container = document.getElementById('messages-container');
    const rail = document.getElementById('chatScrollRail');
    const thumb = document.getElementById('chatScrollThumb');
    if (!container || !rail || !thumb) return;

    const maxThumbTravel = rail.clientHeight - thumb.offsetHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxThumbTravel <= 0 || maxScroll <= 0) return;

    const railTop = rail.getBoundingClientRect().top;
    const rawTop = event.clientY - railTop - chatThumbDragOffset;
    const clampedTop = Math.max(0, Math.min(maxThumbTravel, rawTop));
    container.scrollTop = (clampedTop / maxThumbTravel) * maxScroll;
    syncChatScrollbarPosition();
}

function jumpChatScrollbar(event) {
    if (event.target && event.target.id === 'chatScrollThumb') return;

    const container = document.getElementById('messages-container');
    const rail = document.getElementById('chatScrollRail');
    const thumb = document.getElementById('chatScrollThumb');
    if (!container || !rail || !thumb) return;

    const maxThumbTravel = rail.clientHeight - thumb.offsetHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxThumbTravel <= 0 || maxScroll <= 0) return;

    const clickY = event.clientY - rail.getBoundingClientRect().top;
    const desiredTop = Math.max(0, Math.min(maxThumbTravel, clickY - (thumb.offsetHeight / 2)));
    container.scrollTop = (desiredTop / maxThumbTravel) * maxScroll;
    syncChatScrollbarPosition();
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    const hasDrafts = pendingMediaDrafts.length > 0;

    if (!content && !hasDrafts) {
        showToast('Type a message or pick media first', 'warning');
        return;
    }

    try {
        // Track message statistics
        if (content) {
            updateUserStats('messagesCount', 1);
            updateUserStats('totalChars', content.length);
        }
        if (currentChatContext.type === 'community' || currentChatContext.type === 'group') {
            if (hasDrafts) {
                pendingMediaDrafts.forEach((draft, index) => {
                    sendRoomMessage({
                        content: index === 0 && content ? content : (draft.content || (draft.mediaType === 'image' ? 'Photo' : 'Media')),
                        mediaType: draft.mediaType,
                        mediaUrl: draft.mediaUrl || null
                    });
                });
            } else {
                sendRoomMessage({ content, mediaType: 'text', mediaUrl: null });
            }

            clearPendingMediaDraft();
            input.value = '';
            hideTypingIndicator();
            return;
        }

        const targetId = ensureChatTarget();
        if (!targetId) {
            showToast('Unable to find chat target', 'warning');
            return;
        }

        if (hasDrafts) {
            for (let index = 0; index < pendingMediaDrafts.length; index++) {
                const draft = pendingMediaDrafts[index];
                await sendStagedDm(targetId, {
                    content: index === 0 && content ? content : (draft.content || (draft.mediaType === 'image' ? 'Photo' : 'Media')),
                    mediaType: draft.mediaType,
                    mediaUrl: draft.mediaUrl || null
                });
            }
            clearPendingMediaDraft();
        } else {
            if (!socket || !socket.connected) {
                showToast('Connection lost. Reconnecting...', 'warning');
                connectSocket();
                return;
            }
            socket.emit('send dm', {
                toUserId: targetId,
                content: content,
                mediaType: 'text'
            });
        }

        input.value = '';
        hideTypingIndicator();
    } catch (error) {
        console.error(error);
    }
}

function addMessageToChat(data) {
    console.log('📨 Adding message to chat:', { mediaType: data.mediaType, hasMediaUrl: !!data.mediaUrl, content: data.content?.substring(0, 20) });
    const container = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';messageDiv.dataset.messageId = data.id || Date.now();
    messageDiv.dataset.sender = data.from || currentUser?.id;

    if (chatSettings.compactMode) {
        messageDiv.style.gap = '8px';
    }

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const fallbackInitial = (data.fromUsername || data.sender || 'U').charAt(0).toUpperCase();
    const shouldUseCurrentUserAvatar = String(data.from) === String(currentUser?.id) && currentUser?.avatar;
    const avatarSource = data.fromAvatar || (shouldUseCurrentUserAvatar ? currentUser.avatar : null);
    if (avatarSource && (String(avatarSource).startsWith('data:') || String(avatarSource).startsWith('http'))) {
        avatar.style.backgroundImage = `url(${avatarSource})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
        avatar.textContent = '';
    } else {
        avatar.style.backgroundImage = 'none';
        avatar.textContent = fallbackInitial;
    }

    const content = document.createElement('div');
    content.className = 'message-content';

    const header = document.createElement('div');
    header.className = 'message-header';

    const username = document.createElement('span');
    username.className = 'message-username';
    username.textContent = data.fromUsername || data.sender;

    header.appendChild(username);

    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

    const text = document.createElement('div');
    text.className = 'message-text';
    if (chatSettings.fontSize === 'small') {
        text.style.fontSize = '12px';
    } else if (chatSettings.fontSize === 'large') {
        text.style.fontSize = '16px';
    }
    
    // Handle stickers
    if (data.mediaType === 'sticker') {
        text.style.fontSize = '96px';
        text.style.lineHeight = '1';
        text.textContent = data.content;
    } else {
        // Check if message is only emojis
        const emojiRegex = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;
        const isOnlyEmojis = data.content && emojiRegex.test(data.content.trim());
        
        if (isOnlyEmojis && data.content.trim().length <= 20) {
            // Enlarge emoji-only messages
            text.style.fontSize = '64px';
            text.style.lineHeight = '1.2';
        }
        
        text.textContent = data.content;
    }

    content.appendChild(header);
    content.appendChild(text);
    content.appendChild(time);

    // Add right-click context menu support
    messageDiv.oncontextmenu = (e) => {
        e.preventDefault();
        showMessageContextMenu(e, messageDiv, data);
        return false;
    };

    // Add message actions (edit, delete, react)
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    const reactBtn = document.createElement('button');
    reactBtn.className = 'message-action-btn';
    reactBtn.innerHTML = '👍';
    reactBtn.title = 'React';
    reactBtn.onclick = (e) => {
        e.stopPropagation();
        showQuickReactions(messageDiv.dataset.messageId, messageDiv);
    };
    
    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit';
    editBtn.onclick = () => editMessage(messageDiv.dataset.messageId, text);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'message-action-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete';
    deleteBtn.onclick = () => deleteMessage(messageDiv.dataset.messageId, messageDiv);
    
    actions.appendChild(reactBtn);
    if (String(data.from) === String(currentUser?.id)) {
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
    }
    
    content.appendChild(actions);
    
    // Reactions container
    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';
    reactionsDiv.dataset.messageId = messageDiv.dataset.messageId;
    content.appendChild(reactionsDiv);

    if (data.mediaType !== 'text' && data.mediaType !== 'sticker' && data.mediaUrl) {
        const media = document.createElement('div');
        media.className = 'message-media';

        if (data.mediaType === 'image') {
            const img = document.createElement('img');
            img.src = data.mediaUrl;
            img.alt = 'Image';
            img.onerror = function() {
                console.error('Failed to load image:', data.mediaUrl);
                this.alt = '❌ Image failed to load';
                this.style.display = 'none';
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '❌ Image failed to load';
                errorMsg.style.color = '#ff6b6b';
                errorMsg.style.fontSize = '12px';
                media.appendChild(errorMsg);
            };
            img.onload = function() {
                console.log('✅ Image loaded successfully');
            };
            media.appendChild(img);
        } else if (data.mediaType === 'video') {
            const video = document.createElement('video');
            video.src = data.mediaUrl;
            video.controls = true;
            video.preload = 'metadata';
            video.onerror = function() {
                console.error('Failed to load video:', data.mediaUrl);
                const errorMsg = document.createElement('div');
                errorMsg.textContent = '❌ Video failed to load';
                errorMsg.style.color = '#ff6b6b';
                errorMsg.style.fontSize = '12px';
                media.appendChild(errorMsg);
            };
            video.onloadedmetadata = function() {
                console.log('✅ Video loaded successfully');
            };
            media.appendChild(video);
        } else if (data.mediaType === 'gif') {
            const img = document.createElement('img');
            img.src = data.mediaUrl;
            img.style.maxWidth = '300px';
            img.style.borderRadius = '8px';
            img.alt = 'GIF';
            media.appendChild(img);
        } else if (data.mediaType === 'voice') {
            const audio = document.createElement('audio');
            audio.src = data.mediaUrl;
            audio.controls = true;
            audio.style.maxWidth = '300px';
            // Apply speaker output device
            if (audioSettings.speakerId && audioSettings.speakerId !== 'default' && audio.setSinkId) {
                audio.setSinkId(audioSettings.speakerId).catch(err => {
                    console.warn('Could not set audio output device:', err);
                });
            }
            media.appendChild(audio);
        }
        content.appendChild(media);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    container.appendChild(messageDiv);
    
    // Scroll to the latest message smoothly
    setTimeout(() => {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
        refreshChatScrollbar();
    }, 10);

    if (chatSettings.disappearTime > 0) {
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, chatSettings.disappearTime * 1000);
    }
}

function addCurrentChatToList() {
    if (!currentChatFriendId || !currentChatFriendName) {
        showToast('Open a chat first', 'warning');
        return;
    }

    const existing = pinnedChats.find(chat => String(chat.id) === String(currentChatFriendId));
    if (existing) {
        showToast('Chat already in your list', 'warning');
        return;
    }

    pinnedChats.push({ id: currentChatFriendId, name: currentChatFriendName });
    localStorage.setItem('pinnedChats', JSON.stringify(pinnedChats));
    loadFriendsForDM();
    showToast('Chat added to list');
}

function updateMembersList(users) {
    const membersList = document.getElementById('membersList');
    membersList.innerHTML = '';

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'member-item';

        // Create avatar
        const avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        if (user.avatar) {
            avatar.style.backgroundImage = `url(${user.avatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = user.username.charAt(0).toUpperCase();
        }

        const status = document.createElement('div');
        status.className = 'status-indicator';

        const name = document.createElement('span');
        name.textContent = user.username;

        item.appendChild(avatar);
        item.appendChild(status);
        item.appendChild(name);
        membersList.appendChild(item);
    });
}

// ==================== FILE UPLOAD ====================

async function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
        return;
    }

    const hasActiveChat = currentChatContext.type === 'dm' || currentChatContext.type === 'community' || currentChatContext.type === 'group';
    if (!hasActiveChat) {
        showToast('Open a DM, group, or community first, then select media', 'warning');
        event.target.value = '';
        return;
    }

    for (const file of files) {
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target.result;
                const mediaType = file.type.startsWith('image') ? 'image' : 'video';
                setPendingMediaDraft({
                    mediaType,
                    mediaUrl: data,
                    content: file.name || (mediaType === 'image' ? 'Photo' : 'Video')
                });
                resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
        });
    }

    const targetName = currentChatContext.name || currentChatFriendName || 'this chat';
    showToast(`${files.length} media file(s) selected for ${targetName}. Press Send to post.`, 'success');

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
                showToast('Profile image updated!');
            } else {
                showToast(data.error, 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Error uploading profile image', 'error');
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
        channelsList.innerHTML = '';

        if (pinnedChats.length > 0) {
            const pinnedTitle = document.createElement('div');
            pinnedTitle.className = 'channel-section-title';
            pinnedTitle.textContent = 'PINNED CHATS';
            channelsList.appendChild(pinnedTitle);

            pinnedChats.forEach(chat => {
                const pinnedItem = document.createElement('div');
                pinnedItem.className = 'channel-item';
                pinnedItem.innerHTML = `
                    <div class="channel-avatar">📌</div>
                    <span>${chat.name}</span>
                `;
                pinnedItem.onclick = () => openDM(chat.id, chat.name);
                channelsList.appendChild(pinnedItem);
            });
        }

        if (joinedCommunities.length > 0) {
            const communitiesTitle = document.createElement('div');
            communitiesTitle.className = 'channel-section-title';
            communitiesTitle.textContent = 'COMMUNITIES';
            channelsList.appendChild(communitiesTitle);

            joinedCommunities.forEach(community => {
                const item = document.createElement('div');
                item.className = 'channel-item';
                item.innerHTML = `
                    <div class="channel-avatar">🌐</div>
                    <span>${community}</span>
                `;
                item.style.cursor = 'pointer';
                item.onclick = () => openCommunityChat(community);
                channelsList.appendChild(item);
            });
        }

        if (joinedGroups.length > 0) {
            const groupsTitle = document.createElement('div');
            groupsTitle.className = 'channel-section-title';
            groupsTitle.textContent = 'GROUPS';
            channelsList.appendChild(groupsTitle);

            joinedGroups.forEach(group => {
                const item = document.createElement('div');
                item.className = 'channel-item';
                item.innerHTML = `
                    <div class="channel-avatar">👥</div>
                    <span>${group}</span>
                `;
                item.style.cursor = 'pointer';
                item.onclick = () => openGroupChat(group);
                channelsList.appendChild(item);
            });
        }

        const directTitle = document.createElement('div');
        directTitle.className = 'channel-section-title';
        directTitle.textContent = 'DIRECT MESSAGES';
        channelsList.appendChild(directTitle);
        
        // Add self-chat option with avatar
        const selfItem = document.createElement('div');
        selfItem.className = 'channel-item';
        
        const selfAvatar = document.createElement('div');
        selfAvatar.className = 'channel-avatar';
        if (currentUser.avatar) {
            selfAvatar.style.backgroundImage = `url(${currentUser.avatar})`;
            selfAvatar.style.backgroundSize = 'cover';
            selfAvatar.style.backgroundPosition = 'center';
        } else {
            selfAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
        }
        
        const selfText = document.createElement('span');
        selfText.textContent = `${currentUser.username} (You)`;
        
        selfItem.appendChild(selfAvatar);
        selfItem.appendChild(selfText);
        selfItem.onclick = () => openDM(currentUser.id, `${currentUser.username} (Notes)`);
        channelsList.appendChild(selfItem);
        
        if (friends.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '10px';
            empty.style.color = 'var(--text-secondary)';
            empty.style.fontSize = '12px';
            empty.textContent = 'No friends yet';
            channelsList.appendChild(empty);
        } else {
            friends.forEach(friend => {
                const item = document.createElement('div');
                item.className = 'channel-item';
                item.dataset.friendId = friend._id;
                
                // Create avatar
                const avatar = document.createElement('div');
                avatar.className = 'channel-avatar';
                if (friend.avatar) {
                    avatar.style.backgroundImage = `url(${friend.avatar})`;
                    avatar.style.backgroundSize = 'cover';
                    avatar.style.backgroundPosition = 'center';
                } else {
                    avatar.textContent = friend.username.charAt(0).toUpperCase();
                }
                
                // Create text with status
                const text = document.createElement('span');
                const status = friend.status === 'online' ? '🟢' : '⚫';
                text.textContent = `${status} ${friend.username}`;
                
                item.appendChild(avatar);
                item.appendChild(text);
                item.style.cursor = 'pointer';
                item.onclick = () => openDM(friend._id, friend.username);
                
                // Add right-click context menu for profile
                item.oncontextmenu = (e) => {
                    e.preventDefault();
                    showFriendContextMenu(e, friend._id, friend.username);
                };
                
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
            showToast('Friend request accepted!');
            loadFriends();
        }
    } catch (error) {
        console.error(error);
    }
}

async function sendFriendRequestFromLink(friendId) {
    try {
        const response = await fetch(`${API_BASE}/friends/request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ toUserId: friendId })
        });

        if (response.ok) {
            showToast('Friend request sent successfully!');
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to send friend request', 'error');
        }
    } catch (error) {
        console.error('Error sending friend request:', error);
        showToast('Could not send friend request', 'error');
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
            showToast('Item purchased!');
            loadShopItems();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error purchasing item', 'error');
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

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Warning';
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==================== SETTINGS PANEL ====================

function openSettings() {
    document.getElementById('settingsPanel').classList.add('show');
    if (currentUser) {
        document.getElementById('settingsEmail').value = currentUser.email || '';
        document.getElementById('settingsUsername').value = '';
    }
    populateAccountSwitcher();
    applySettingsToUI();
}

function closeSettings() {
    document.getElementById('settingsPanel').classList.remove('show');
    const simpleTheme = localStorage.getItem('simpleTheme');
    if (simpleTheme) {
        showToast('✅ Settings saved!', 'success');
    }
}

function switchSettingsTab(tab) {
    // Update nav items
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update sections
    document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(tab + 'Settings').classList.add('active');
}

async function updateUsername() {
    const newUsername = document.getElementById('settingsUsername').value.trim();
    if (!newUsername) {
        showToast('Please enter a new username', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ username: newUsername })
        });
        
        const data = await response.json();
        if (response.ok) {
            currentUser.username = newUsername;
            localStorage.setItem('user', JSON.stringify(currentUser));
            showToast('Username updated successfully!');
            loadUserProfile();
            document.getElementById('settingsUsername').value = '';
        } else {
            showToast(data.error || 'Failed to update username', 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error updating username', 'error');
    }
}

// ==================== THEME SWITCHING ====================

function changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    showToast(`Switched to ${theme} theme`, 'success');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.value = savedTheme;
    }
}

// ==================== CLOSE CHAT ====================

function closeCurrentChat() {
    currentChatFriendId = null;
    currentChatFriendName = null;
    currentChatContext = { type: 'none', id: null, name: null };
    clearPendingMediaDraft();
    document.getElementById('chatTitle').textContent = '💬 Select a friend to chat';
    document.getElementById('messages-container').innerHTML = '';
    document.getElementById('closeChatBtn').style.display = 'none';
    refreshChatScrollbar();
    showToast('Chat closed');
}

function getCurrentRoomKey() {
    if (currentChatContext.type === 'community') return `community:${currentChatContext.name}`;
    if (currentChatContext.type === 'group') return `group:${currentChatContext.name}`;
    return null;
}

function saveRoomMessages() {
    localStorage.setItem('roomMessages', JSON.stringify(roomMessages));
}

function addRoomMessage(roomKey, message) {
    if (!roomMessages[roomKey]) roomMessages[roomKey] = [];
    roomMessages[roomKey].push(message);
    saveRoomMessages();
}

function renderRoomMessages(roomKey, roomName, roomType) {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    const messages = roomMessages[roomKey] || [];
    if (messages.length === 0) {
        const welcome = document.createElement('div');
        welcome.className = 'message';
        welcome.innerHTML = `
            <div class="message-avatar">${roomType === 'community' ? '🌐' : '👥'}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${roomName}</span>
                    <span class="message-time">Now</span>
                </div>
                <div class="message-text">Welcome to ${roomName}. Messages sent here stay in this ${roomType}.</div>
            </div>
        `;
        container.appendChild(welcome);
        refreshChatScrollbar();
        return;
    }

    messages.forEach(msg => addMessageToChat(msg));
    refreshChatScrollbar();
}

async function sendStagedDm(targetId, payload) {
    if (!socket || !socket.connected) {
        showToast('Connection lost. Reconnecting...', 'warning');
        connectSocket();
        throw new Error('Socket not connected');
    }

    socket.emit('send dm', {
        toUserId: targetId,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl || null
    });
}

function sendRoomMessage(payload) {
    const roomKey = getCurrentRoomKey();
    if (!roomKey) {
        showToast('Open a community/group chat first', 'warning');
        return;
    }

    console.log('📤 Sending room message:', payload);

    const roomMessage = {
        from: currentUser.id,
        fromUsername: currentUser.username,
        fromAvatar: currentUser.avatar || null,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl || null,
        timestamp: new Date().toISOString()
    };

    console.log('📨 Room message to add:', roomMessage);
    addRoomMessage(roomKey, roomMessage);
    addMessageToChat(roomMessage);
}

function ensureChatTarget() {
    if (currentChatContext.type === 'community' || currentChatContext.type === 'group') {
        return null;
    }

    if (currentChatFriendId) {
        return currentChatFriendId;
    }

    if (currentUser && currentUser.id) {
        openDM(currentUser.id, `${currentUser.username} (Notes)`);
        return currentUser.id;
    }

    return null;
}

// ==================== DESKTOP NOTIFICATIONS ====================

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('Desktop notifications enabled!');
                document.getElementById('desktopNotifications').checked = true;
            }
        });
    }
}

function showDesktopNotification(title, message, isSender = false) {
    const desktopNotifEnabled = document.getElementById('desktopNotifications')?.checked;
    if (!desktopNotifEnabled || isSender) return;
    
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico'
        });
    }
}

function playNotificationSound() {
    if (!chatSettings.messageSound) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.08);
    } catch (error) {
        console.error('Sound notification failed:', error);
    }
}

function saveNotificationSettings() {
    chatSettings.notificationMode = document.getElementById('notificationMode')?.value || 'all';
    chatSettings.notifyOnSent = document.getElementById('notifyOnSent')?.checked || false;
    chatSettings.notifyOnReceived = document.getElementById('notifyOnReceived')?.checked ?? true;
    chatSettings.desktopNotifications = document.getElementById('desktopNotifications')?.checked || false;
    chatSettings.messageSound = document.getElementById('messageSound')?.checked ?? true;
    localStorage.setItem('chatSettings', JSON.stringify(chatSettings));

    if (chatSettings.desktopNotifications) {
        requestNotificationPermission();
    }
}

function saveChatSettings() {
    chatSettings.disappearTime = Number(document.getElementById('disappearTime')?.value || 0);
    chatSettings.enterToSend = document.getElementById('enterToSend')?.checked ?? true;
    chatSettings.showTypingIndicator = document.getElementById('showTypingIndicator')?.checked ?? true;
    chatSettings.autoplayGifs = document.getElementById('autoplayGifs')?.checked ?? true;
    localStorage.setItem('chatSettings', JSON.stringify(chatSettings));
}

function saveAppearanceSettings() {
    chatSettings.compactMode = document.getElementById('compactMode')?.checked || false;
    chatSettings.fontSize = document.getElementById('fontSizeSelector')?.value || 'medium';
    localStorage.setItem('chatSettings', JSON.stringify(chatSettings));
}

function applySettingsToUI() {
    const savedSettings = JSON.parse(localStorage.getItem('chatSettings') || '{}');
    chatSettings = { ...chatSettings, ...savedSettings };

    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!value;
    };
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };

    setValue('disappearTime', String(chatSettings.disappearTime));
    setChecked('enterToSend', chatSettings.enterToSend);
    setChecked('showTypingIndicator', chatSettings.showTypingIndicator);
    setChecked('autoplayGifs', chatSettings.autoplayGifs);
    setChecked('desktopNotifications', chatSettings.desktopNotifications);
    setChecked('messageSound', chatSettings.messageSound);
    setChecked('notifyOnSent', chatSettings.notifyOnSent);
    setChecked('notifyOnReceived', chatSettings.notifyOnReceived);
    setChecked('compactMode', chatSettings.compactMode);
    setValue('fontSizeSelector', chatSettings.fontSize);
    setValue('notificationMode', chatSettings.notificationMode);
}

function openCommunitiesModal() {
    const modal = document.getElementById('communitiesModal');
    const list = document.getElementById('communitiesList');
    list.innerHTML = `
        <div class="friend-item"><span class="friend-name">🎮 Gaming</span><button class="buy-btn" onclick="joinCommunity('Gaming')">Join</button></div>
        <div class="friend-item"><span class="friend-name">💻 Coding</span><button class="buy-btn" onclick="joinCommunity('Coding')">Join</button></div>
        <div class="friend-item"><span class="friend-name">🎵 Music</span><button class="buy-btn" onclick="joinCommunity('Music')">Join</button></div>
    `;
    modal.classList.remove('hidden');
}

function closeCommunitiesModal() {
    document.getElementById('communitiesModal').classList.add('hidden');
}

function openGroupsModal() {
    const modal = document.getElementById('groupsModal');
    const list = document.getElementById('groupsList');
    list.innerHTML = `
        <div class="friend-item"><span class="friend-name">Study Group</span><button class="buy-btn" onclick="joinGroup('Study Group')">Join</button></div>
        <div class="friend-item"><span class="friend-name">Project Team</span><button class="buy-btn" onclick="joinGroup('Project Team')">Join</button></div>
        <div class="friend-item"><span class="friend-name">Family</span><button class="buy-btn" onclick="joinGroup('Family')">Join</button></div>
    `;
    modal.classList.remove('hidden');
}

function closeGroupsModal() {
    document.getElementById('groupsModal').classList.add('hidden');
}

function openCommunityChat(name) {
    console.log('🌐 Opening community chat:', name);
    currentChatFriendId = null;
    currentChatFriendName = `Community: ${name}`;
    currentChatContext = { type: 'community', id: name, name };
    clearPendingMediaDraft();
    document.getElementById('chatTitle').textContent = `🌐 Community: ${name}`;
    renderRoomMessages(`community:${name}`, name, 'community');
    document.getElementById('closeChatBtn').style.display = 'block';
    showSection('chat');
}

function openGroupChat(name) {
    console.log('👥 Opening group chat:', name);
    currentChatFriendId = null;
    currentChatFriendName = `Group: ${name}`;
    currentChatContext = { type: 'group', id: name, name };
    clearPendingMediaDraft();
    document.getElementById('chatTitle').textContent = `👥 Group: ${name}`;
    renderRoomMessages(`group:${name}`, name, 'group');
    document.getElementById('closeChatBtn').style.display = 'block';
    showSection('chat');
}

function joinCommunity(name) {
    if (joinedCommunities.includes(name)) {
        showToast('Already joined this community', 'warning');
        return;
    }
    joinedCommunities.push(name);
    localStorage.setItem('joinedCommunities', JSON.stringify(joinedCommunities));
    loadFriendsForDM();
    showToast(`Joined ${name} community!`);
}

function joinGroup(name) {
    if (joinedGroups.includes(name)) {
        showToast('Already joined this group', 'warning');
        return;
    }
    joinedGroups.push(name);
    localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
    loadFriendsForDM();
    showToast(`Joined ${name} group!`);
}

// ==================== STICKER & GIF PICKER ====================

const stickers = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
    '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '🤧', '🥵', '🥶', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '👇', '☝️', '✋', '🤚', '🖐', '🖖', '👋', '🤙', '💪',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
    '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '⚙️',
    '🔥', '💯', '✨', '🌟', '⭐', '💫', '🌈', '☀️', '🌙', '⚡',
    '☁️', '🌊', '🌺', '🌸', '🌼', '🌻', '🌷', '🌹', '🥀', '🌴'
];

let currentPickerTab = 'stickers';

function togglePicker() {
    const picker = document.getElementById('pickerPanel');
    picker.classList.toggle('show');
    if (picker.classList.contains('show')) {
        loadPickerContent();
    }
}

function switchPickerTab(tab) {
    currentPickerTab = tab;
    document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    loadPickerContent();
}

function loadPickerContent() {
    const content = document.getElementById('pickerContent');
    content.innerHTML = '';
    
    if (currentPickerTab === 'stickers') {
        stickers.forEach(sticker => {
            const item = document.createElement('div');
            item.className = 'sticker-item';
            item.textContent = sticker;
            item.onclick = () => sendSticker(sticker);
            content.appendChild(item);
        });
    } else if (currentPickerTab === 'gifs') {
        // Expanded GIF library with popular reactions and animations
        const gifs = [
            'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif',
            'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
            'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
            'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif',
            'https://media.giphy.com/media/3o7527pa7qs9kCG78A/giphy.gif',
            'https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif',
            'https://media.giphy.com/media/l0HlNQ03J5JxX6lva/giphy.gif',
            'https://media.giphy.com/media/26tknCqiJrBQG6bxC/giphy.gif',
            'https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif',
            'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
            'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
            'https://media.giphy.com/media/VbnUQpnihPSIgIXuZv/giphy.gif',
            'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
            'https://media.giphy.com/media/H3nnOlR7yiCXXQ8e2I/giphy.gif',
            'https://media.giphy.com/media/LSKVmdIwZFeNEBKBxZ/giphy.gif',
            'https://media.giphy.com/media/aWPGuTlDqq2yc/giphy.gif',
            'https://media.giphy.com/media/3oz8xZvvOZRmKay4xy/giphy.gif',
            'https://media.giphy.com/media/YRuFixSNWFVcXaxpmX/giphy.gif',
            'https://media.giphy.com/media/3o7qDEq2bMbcbPRQ2c/giphy.gif',
            'https://media.giphy.com/media/kyLYXonQYYfwYDIeZl/giphy.gif',
            'https://media.giphy.com/media/l1J3CbFgn5o7DGRuE/giphy.gif',
            'https://media.giphy.com/media/TdfyKrN7HGTIY/giphy.gif',
            'https://media.giphy.com/media/3o7aCRloybJlXpNjSU/giphy.gif',
            'https://media.giphy.com/media/8lQyyys3SGBoUUxrUp/giphy.gif'
        ];
        
        gifs.forEach(gifUrl => {
            const img = document.createElement('img');
            img.className = 'gif-item';
            img.src = gifUrl;
            img.onclick = () => sendGif(gifUrl);
            content.appendChild(img);
        });
    }
}

function sendSticker(sticker) {
    // Insert emoji into text input instead of staging
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        const currentText = messageInput.value;
        messageInput.value = currentText + sticker;
        messageInput.focus();
    }
    
    document.getElementById('pickerPanel').classList.remove('show');
}

function sendGif(gifUrl) {
    setPendingMediaDraft({
        mediaType: 'gif',
        mediaUrl: gifUrl,
        content: 'GIF'
    });
    showToast('GIF selected. Press Send to post.', 'success');
    
    document.getElementById('pickerPanel').classList.remove('show');
}

// ==================== VOICE RECORDING ====================

let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let recordingSeconds = 0;
let recordedAudioMimeType = 'audio/webm';

function getSupportedAudioMimeType() {
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const type of candidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }
    return '';
}

function toggleVoiceRecorder() {
    const recorder = document.getElementById('voiceRecorder');
    recorder.classList.toggle('show');
    if (!recorder.classList.contains('show')) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            cancelRecording();
        }
    }
}

async function toggleRecording() {
    const button = document.getElementById('recordButton');
    const sendBtn = document.querySelector('#voiceRecorder .save-btn');
    const previewAudio = document.getElementById('voicePreview');
    const previewContainer = document.getElementById('voicePreviewContainer');

    if (!window.MediaRecorder) {
        showToast('Voice recording is not supported on this browser', 'error');
        return;
    }
    
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        try {
            // Use selected microphone
            const stream = await getSelectedMicrophone();
            const mimeType = getSupportedAudioMimeType();
            recordedAudioMimeType = mimeType || 'audio/webm';
            mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            audioChunks = [];
            
            // Hide preview when starting new recording
            if (previewContainer) previewContainer.style.display = 'none';
            if (previewAudio) {
                previewAudio.pause();
                previewAudio.removeAttribute('src');
                previewAudio.load();
            }
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: recordedAudioMimeType });
                const reader = new FileReader();
                reader.onloadend = () => {
                    window.recordedAudio = reader.result;
                    showToast('🎧 Recording ready! CLICK PLAY BUTTON to hear it before sending!', 'success');
                    if (sendBtn) sendBtn.disabled = false;
                    
                    // Show preview container and load audio
                    if (previewContainer) previewContainer.style.display = 'block';
                    if (previewAudio) {
                        previewAudio.src = reader.result;
                        previewAudio.load();
                        // Set volume to max for better audibility
                        previewAudio.volume = 1.0;
                        
                        // Apply speaker output device
                        if (audioSettings.speakerId && audioSettings.speakerId !== 'default' && previewAudio.setSinkId) {
                            previewAudio.setSinkId(audioSettings.speakerId).catch(err => {
                                console.warn('Could not set preview audio output:', err);
                            });
                        }
                        
                        // Try to play automatically (may be blocked by browser)
                        previewAudio.play().catch(err => {
                            console.log('Autoplay blocked, user must click play:', err);
                            showToast('⚠️ Click the PLAY button ▶️ below to hear your recording!', 'warning');
                        });
                    }
                };
                reader.readAsDataURL(audioBlob);
                if (mediaRecorder.stream) {
                    mediaRecorder.stream.getTracks().forEach(track => track.stop());
                }
            };
            
            mediaRecorder.start();
            button.classList.add('recording');
            recordingSeconds = 0;
            updateRecordTimer();
            recordingInterval = setInterval(updateRecordTimer, 1000);
            if (sendBtn) sendBtn.disabled = true;
            showToast('Recording started...', 'success');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            showToast('Could not access microphone', 'error');
        }
    } else {
        mediaRecorder.stop();
        button.classList.remove('recording');
        clearInterval(recordingInterval);
    }
}

function updateRecordTimer() {
    recordingSeconds++;
    const minutes = Math.floor(recordingSeconds / 60);
    const seconds = recordingSeconds % 60;
    document.getElementById('recordTimer').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function sendVoiceMessage() {
    if (!window.recordedAudio) {
        showToast('No recording found', 'warning');
        return;
    }

    if (currentChatContext.type === 'community' || currentChatContext.type === 'group') {
        sendRoomMessage({
            content: 'Voice message',
            mediaType: 'voice',
            mediaUrl: window.recordedAudio
        });
        cancelRecording();
        showToast('Voice message posted!');
        return;
    }

    const targetId = ensureChatTarget();

    if (!targetId) {
        showToast('Unable to find chat target', 'warning');
        return;
    }

    if (!socket || !socket.connected) {
        showToast('Connection lost. Cannot send voice message.', 'error');
        connectSocket();
        return;
    }

    console.log('🎤 Sending voice message to:', targetId, 'audioSize:', window.recordedAudio?.length);
    socket.emit('send dm', {
        toUserId: targetId,
        content: 'Voice message',
        mediaType: 'voice',
        mediaUrl: window.recordedAudio
    });
    
    cancelRecording();
    showToast('Voice message sent!', 'success');
}

function cancelRecording() {
    const sendBtn = document.querySelector('#voiceRecorder .save-btn');
    const previewAudio = document.getElementById('voicePreview');
    const previewContainer = document.getElementById('voicePreviewContainer');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('recordButton').classList.remove('recording');
    clearInterval(recordingInterval);
    document.getElementById('recordTimer').textContent = '00:00';
    document.getElementById('voiceRecorder').classList.remove('show');
    audioChunks = [];
    window.recordedAudio = null;
    recordingSeconds = 0;
    
    // Hide preview container
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.removeAttribute('src');
        previewAudio.load();
    }
    if (sendBtn) sendBtn.disabled = true;
}

// ==================== SMOOTH SCROLLBAR WHEEL ====================

function handleChatWheel(event) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    // Allow smooth wheel scrolling with accelerated movement
    event.preventDefault();
    const delta = event.deltaY;
    container.scrollBy({ top: delta * 0.8, behavior: 'auto' });
}

// ==================== AUDIO DEVICE SETTINGS ====================

async function refreshAudioDevices() {
    try {
        // Request permissions first
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(stream => stream.getTracks().forEach(track => track.stop()))
            .catch(() => console.log('Microphone permission needed'));

        const devices = await navigator.mediaDevices.enumerateDevices();
        const micSelect = document.getElementById('microphoneSelector');
        const speakerSelect = document.getElementById('speakerSelector');
        
        if (micSelect) {
            micSelect.innerHTML = '<option value="default">Default Microphone</option>';
            devices.filter(d => d.kind === 'audioinput').forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${micSelect.options.length}`;
                micSelect.appendChild(option);
            });
            if (audioSettings.microphoneId && audioSettings.microphoneId !== 'default') {
                micSelect.value = audioSettings.microphoneId;
            }
        }

        if (speakerSelect) {
            speakerSelect.innerHTML = '<option value="default">Default Speaker</option>';
            devices.filter(d => d.kind === 'audiooutput').forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Speaker ${speakerSelect.options.length}`;
                speakerSelect.appendChild(option);
            });
            if (audioSettings.speakerId && audioSettings.speakerId !== 'default') {
                speakerSelect.value = audioSettings.speakerId;
            }
        }

        showToast('Audio devices refreshed', 'success');
    } catch (error) {
        console.error('Error enumerating devices:', error);
        showToast('Could not load audio devices', 'warning');
    }
}

function saveAudioSettings() {
    const micSelect = document.getElementById('microphoneSelector');
    const speakerSelect = document.getElementById('speakerSelector');
    
    if (micSelect) audioSettings.microphoneId = micSelect.value;
    if (speakerSelect) audioSettings.speakerId = speakerSelect.value;
    
    localStorage.setItem('audioSettings', JSON.stringify(audioSettings));
    
    // Apply speaker to all existing audio elements
    applySpeakerToAudioElements();
    
    showToast('Audio settings saved', 'success');
}

function applySpeakerToAudioElements() {
    const speakerId = audioSettings.speakerId;
    if (!speakerId || speakerId === 'default') return;
    
    // Apply to all audio elements
    document.querySelectorAll('audio').forEach(audio => {
        if (audio.setSinkId) {
            audio.setSinkId(speakerId).catch(err => {
                console.warn('Could not set audio output:', err);
            });
        }
    });
    
    // Also apply to voice preview
    const voicePreview = document.getElementById('voicePreview');
    if (voicePreview && voicePreview.setSinkId) {
        voicePreview.setSinkId(speakerId).catch(err => {
            console.warn('Could not set voice preview output:', err);
        });
    }
}

function loadAudioSettings() {
    const saved = localStorage.getItem('audioSettings');
    if (saved) {
        try {
            audioSettings = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to load audio settings:', e);
        }
    }
}

async function getSelectedMicrophone() {
    const deviceId = audioSettings.microphoneId;
    if (!deviceId || deviceId === 'default') {
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    return navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
    });
}

// ==================== THEME & COLOR CUSTOMIZATION ====================

function changeTheme(theme) {
    themeSettings.mode = theme;
    const customSection = document.getElementById('customColorSection');
    
    if (theme === 'custom') {
        if (customSection) customSection.style.display = 'block';
        applyCustomColors();
    } else {
        if (customSection) customSection.style.display = 'none';
        
        const root = document.documentElement;
        if (theme === 'dark') {
            root.style.setProperty('--primary-color', '#5865F2');
            root.style.setProperty('--secondary-color', '#4e5058');
            root.style.setProperty('--bg-color', '#1e1f22');
            root.style.setProperty('--sidebar-color', '#2b2d31');
            root.style.setProperty('--text-primary', '#ffffff');
            root.style.setProperty('--text-secondary', '#b5bac1');
            root.style.setProperty('--border-color', '#3f4147');
        } else if (theme === 'light') {
            root.style.setProperty('--primary-color', '#5865F2');
            root.style.setProperty('--secondary-color', '#d4d7dc');
            root.style.setProperty('--bg-color', '#ffffff');
            root.style.setProperty('--sidebar-color', '#f2f3f5');
            root.style.setProperty('--text-primary', '#060607');
            root.style.setProperty('--text-secondary', '#4e5058');
            root.style.setProperty('--border-color', '#e3e5e8');
        }
    }
    
    localStorage.setItem('themeSettings', JSON.stringify(themeSettings));
    showToast(`Theme changed to ${theme}`, 'success');
}

function applySimpleCustomColors() {
    const root = document.documentElement;
    const bg = document.getElementById('bgColorPicker')?.value || '#1e1f22';
    const text = document.getElementById('textColorPicker')?.value || '#ffffff';
    const icon = document.getElementById('accentColorPicker')?.value || '#5865F2';
    
    root.style.setProperty('--bg-color', bg);
    root.style.setProperty('--chat-bg', bg);
    root.style.setProperty('--sidebar-color', bg);
    root.style.setProperty('--text-primary', text);
    root.style.setProperty('--primary-color', icon);
    root.style.setProperty('--secondary-color', icon);
    root.style.setProperty('--icon-color', icon);
    // Keep UI text color fixed (don't change with custom colors)
    root.style.setProperty('--ui-text-color', '#ffffff');
    
    // Save simple colors to localStorage
    const simpleTheme = { bg, text, icon, mode: 'custom' };
    localStorage.setItem('simpleTheme', JSON.stringify(simpleTheme));
}

function resetSimpleCustomColors() {
    document.getElementById('bgColorPicker').value = '#1e1f22';
    document.getElementById('textColorPicker').value = '#ffffff';
    document.getElementById('accentColorPicker').value = '#5865F2';
    
    const root = document.documentElement;
    root.style.setProperty('--bg-color', '#1e1f22');
    root.style.setProperty('--chat-bg', '#1e1f22');
    root.style.setProperty('--sidebar-color', '#2b2d31');
    root.style.setProperty('--text-primary', '#ffffff');
    root.style.setProperty('--primary-color', '#5865F2');
    root.style.setProperty('--secondary-color', '#5865F2');
    root.style.setProperty('--icon-color', '#5865F2');
    root.style.setProperty('--ui-text-color', '#ffffff');
    
    localStorage.removeItem('simpleTheme');
    showToast('✅ Colors reset to default', 'success');
}

function getBrightness(hexColor) {
    const rgb = parseInt(hexColor.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    return (r * 299 + g * 587 + b * 114) / 1000;
}

function getBrightnessAdjusted(hexColor, factor = 0.85) {
    const rgb = parseInt(hexColor.replace('#', ''), 16);
    let r = (rgb >> 16) & 0xff;
    let g = (rgb >> 8) & 0xff;
    let b = (rgb >> 0) & 0xff;
    
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function resetCustomColors() {
    themeSettings.customColors = {
        primary: '#5865F2',
        accent: '#57F287',
        background: '#1e1f22',
        sidebar: '#2b2d31',
        textPrimary: '#ffffff',
        textSecondary: '#b5bac1',
        iconColor: '#ffffff',
        borderColor: '#3f4147'
    };
    
    document.getElementById('primaryColorPicker').value = '#5865F2';
    document.getElementById('accentColorPicker').value = '#57F287';
    document.getElementById('bgColorPicker').value = '#1e1f22';
    document.getElementById('sidebarColorPicker').value = '#2b2d31';
    document.getElementById('textColorPicker').value = '#ffffff';
    document.getElementById('textSecondaryColorPicker').value = '#b5bac1';
    document.getElementById('iconColorPicker').value = '#ffffff';
    
    applyCustomColors();
    showToast('Colors reset to default', 'success');
}

function loadThemeSettings() {
    const saved = localStorage.getItem('themeSettings');
    if (saved) {
        try {
            themeSettings = JSON.parse(saved);
            const themeSelector = document.getElementById('themeSelector');
            if (themeSelector) themeSelector.value = themeSettings.mode;
            
            if (themeSettings.mode === 'custom') {
                const customSection = document.getElementById('customColorSection');
                if (customSection) customSection.style.display = 'block';
                
                document.getElementById('primaryColorPicker').value = themeSettings.customColors.primary;
                document.getElementById('accentColorPicker').value = themeSettings.customColors.accent;
                document.getElementById('bgColorPicker').value = themeSettings.customColors.background;
                document.getElementById('sidebarColorPicker').value = themeSettings.customColors.sidebar;
                
                applyCustomColors();
            } else {
                changeTheme(themeSettings.mode);
            }
        } catch (e) {
            console.error('Failed to load theme settings:', e);
        }
    }
}

// ==================== MESSAGE ACTIONS (EDIT, DELETE, REACT) ====================

let messageReactions = {}; // Store reactions: { messageId: { emoji: [userIds] } }

function showQuickReactions(messageId, messageDiv) {
    const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    
    // Remove any existing picker
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    // Create quick reaction picker
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.position = 'fixed';
    picker.style.background = 'var(--chat-bg)';
    picker.style.border = '2px solid var(--primary-color)';
    picker.style.borderRadius = '12px';
    picker.style.padding = '12px';
    picker.style.display = 'flex';
    picker.style.gap = '8px';
    picker.style.zIndex = '9999';
    picker.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    
    // Position near the message (center of screen)
    const rect = messageDiv.getBoundingClientRect();
    picker.style.left = Math.max(20, rect.left) + 'px';
    picker.style.top = Math.max(20, rect.top - 60) + 'px';
    
    quickReactions.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.border = '1px solid var(--border-color)';
        btn.style.background = 'var(--bg-color)';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '28px';
        btn.style.padding = '8px 12px';
        btn.style.borderRadius = '8px';
        btn.style.transition = 'all 0.15s';
        btn.onmouseover = () => {
            btn.style.transform = 'scale(1.25)';
            btn.style.background = 'var(--primary-color)';
        };
        btn.onmouseout = () => {
            btn.style.transform = 'scale(1)';
            btn.style.background = 'var(--bg-color)';
        };
        btn.onclick = (e) => {
            e.stopPropagation();
            addReaction(messageId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });
    
    document.body.appendChild(picker);
    
    // Remove picker when clicking outside
    const closePickerHandler = (e) => {
        if (!picker.contains(e.target)) {
            picker.remove();
            document.removeEventListener('click', closePickerHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closePickerHandler), 100);
}

function showReactionPicker(messageId) {
    showQuickReactions(messageId, document.querySelector(`[data-message-id="${messageId}"]`));
}

function addReaction(messageId, emoji) {
    if (!messageReactions[messageId]) {
        messageReactions[messageId] = {};
    }
    if (!messageReactions[messageId][emoji]) {
        messageReactions[messageId][emoji] = [];
    }
    
    const userId = currentUser?.id || 'anonymous';
    const userIndex = messageReactions[messageId][emoji].indexOf(userId);
    
    if (userIndex > -1) {
        // Remove reaction if already added
        messageReactions[messageId][emoji].splice(userIndex, 1);
        if (messageReactions[messageId][emoji].length === 0) {
            delete messageReactions[messageId][emoji];
        }
    } else {
        // Add reaction
        messageReactions[messageId][emoji].push(userId);
        updateUserStats('reactionsGiven', 1);
    }
    
    renderMessageReactions(messageId);
    updateStatsDisplay();
    showToast(`Reacted with ${emoji}`, 'success');
}

function showMessageContextMenu(e, messageDiv, data) {
    // Remove any existing context menu
    document.querySelectorAll('.message-context-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.background = 'var(--chat-bg)';
    menu.style.border = '2px solid var(--primary-color)';
    menu.style.borderRadius = '8px';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '200px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    menu.style.overflow = 'hidden';
    
    const menuItems = [
        { label: '👍 React', action: () => showQuickReactions(messageDiv.dataset.messageId, messageDiv), hoverClass: 'primary-hover' },
        { label: '↩️ Reply', action: () => replyToMessage(messageDiv.dataset.messageId, data), hoverClass: 'primary-hover' },
        { label: '📋 Copy', action: () => copyMessageText(messageDiv.dataset.messageId), hoverClass: 'success-hover' },
        { label: '📦 Archive', action: () => archiveSingleMessage(messageDiv.dataset.messageId, messageDiv), hoverClass: 'primary-hover' },
    ];
    
    if (String(data.from) === String(currentUser?.id)) {
        menuItems.push({ label: '✏️ Edit', action: () => editMessage(messageDiv.dataset.messageId, messageDiv.querySelector('.message-text')), hoverClass: 'primary-hover' });
        menuItems.push({ label: '🗑️ Delete', action: () => deleteMessage(messageDiv.dataset.messageId, messageDiv), hoverClass: 'danger-hover' });
    }
    
    menuItems.forEach(item => {
        const btn = document.createElement('div');
        btn.textContent = item.label;
        btn.style.padding = '12px 16px';
        btn.style.cursor = 'pointer';
        btn.style.color = 'var(--text-primary)';
        btn.style.transition = 'all 0.2s';
        btn.style.fontWeight = '500';
        btn.style.borderBottom = '1px solid var(--border-color)';
        
        // Add hover class for color coding
        btn.onmouseover = () => {
            if (item.hoverClass === 'danger-hover') {
                btn.style.background = 'var(--danger)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            } else if (item.hoverClass === 'success-hover') {
                btn.style.background = 'var(--success)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            } else {
                btn.style.background = 'var(--primary-color)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            }
        };
        btn.onmouseout = () => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-primary)';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = () => {
            item.action();
            menu.remove();
        };
        menu.appendChild(btn);
    });
    
    // Remove border from last item
    const lastBtn = menu.lastElementChild;
    if (lastBtn) lastBtn.style.borderBottom = 'none';
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    document.addEventListener('click', () => menu.remove(), { once: true });
}

function showFriendContextMenu(e, friendId, friendName) {
    // Remove any existing context menu
    document.querySelectorAll('.message-context-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'message-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.background = 'var(--chat-bg)';
    menu.style.border = '2px solid var(--primary-color)';
    menu.style.borderRadius = '8px';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '200px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    menu.style.overflow = 'hidden';
    
    const menuItems = [
        { label: '👤 View Profile', action: () => visitUserProfile(friendId, friendName), hoverClass: 'primary-hover' },
        { label: '💬 Send Message', action: () => openDM(friendId, friendName), hoverClass: 'success-hover' },
        { label: '📞 Video Call', action: () => { currentChatContext = { id: friendId, name: friendName, type: 'dm' }; openVideoCallModal(); }, hoverClass: 'primary-hover' },
    ];
    
    menuItems.forEach(item => {
        const btn = document.createElement('div');
        btn.textContent = item.label;
        btn.style.padding = '12px 16px';
        btn.style.cursor = 'pointer';
        btn.style.color = 'var(--text-primary)';
        btn.style.transition = 'all 0.2s';
        btn.style.fontWeight = '500';
        btn.style.borderBottom = '1px solid var(--border-color)';
        
        // Add hover class for color coding
        btn.onmouseover = () => {
            if (item.hoverClass === 'danger-hover') {
                btn.style.background = 'var(--danger)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            } else if (item.hoverClass === 'success-hover') {
                btn.style.background = 'var(--success)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            } else {
                btn.style.background = 'var(--primary-color)';
                btn.style.color = 'white';
                btn.style.transform = 'scale(1.02)';
            }
        };
        btn.onmouseout = () => {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-primary)';
            btn.style.transform = 'scale(1)';
        };
        btn.onclick = () => {
            item.action();
            menu.remove();
        };
        menu.appendChild(btn);
    });
    
    // Remove border from last item
    const lastBtn = menu.lastElementChild;
    if (lastBtn) lastBtn.style.borderBottom = 'none';
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    document.addEventListener('click', () => menu.remove(), { once: true });
}

function renderMessageReactions(messageId) {
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageDiv) return;
    
    const reactionsDiv = messageDiv.querySelector('.message-reactions');
    if (!reactionsDiv) return;
    
    reactionsDiv.innerHTML = '';
    const reactions = messageReactions[messageId] || {};
    
    Object.entries(reactions).forEach(([emoji, users]) => {
        if (!users || users.length === 0) return;
        
        const reactionItem = document.createElement('div');
        reactionItem.className = 'reaction-item';
        reactionItem.innerHTML = `${emoji} <span class="reaction-count">${users.length}</span>`;
        reactionItem.style.cursor = 'pointer';
        reactionItem.onclick = () => addReaction(messageId, emoji);
        reactionsDiv.appendChild(reactionItem);
    });
}

function replyToMessage(messageId, data) {
    const input = document.getElementById('messageInput');
    if (input) {
        input.value = `> ${data.fromUsername}: ${data.content}\n`;
        input.focus();
        showToast('Replying to message...', 'success');
    }
}

function copyMessageText(messageId) {
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageDiv) {
        showToast('❌ Message not found', 'error');
        return;
    }
    
    const textElement = messageDiv.querySelector('.message-text');
    const imgElement = messageDiv.querySelector('img');
    const vidElement = messageDiv.querySelector('video');
    const audioElement = messageDiv.querySelector('audio');
    
    if (textElement && textElement.textContent && textElement.textContent.trim()) {
        navigator.clipboard.writeText(textElement.textContent).then(() => {
            showToast('✅ Text copied!', 'success');
        }).catch(() => {
            showToast('❌ Failed to copy', 'error');
        });
    } else if (imgElement || vidElement || audioElement) {
        const url = imgElement?.src || vidElement?.src || audioElement?.src || '';
        if (url) {
            // Add to media preview panel
            if (imgElement) {
                addToMediaPreview('image', url);
            } else if (vidElement) {
                addToMediaPreview('video', url);
            }
            
            // Copy to clipboard
            navigator.clipboard.writeText(url).then(() => {
                const mediaType = imgElement ? 'Image' : vidElement ? 'Video' : 'Audio';
                showToast(`✅ ${mediaType} copied! View in preview panel.`, 'success');
                
                // Show preview panel if it has items
                if (copiedMediaItems.length > 0) {
                    setTimeout(() => openMediaPreview(), 500);
                }
            }).catch(() => {
                showToast('❌ Failed to copy', 'error');
            });
        } else {
            showToast('❌ No media URL found', 'warning');
        }
    } else {
        showToast('❌ No content to copy', 'warning');
    }
}

function editMessage(messageId, textElement) {
    const currentText = textElement.textContent;
    
    customPrompt('Edit your message:', '✏️ Edit Message', 'Enter new text...', currentText, '✏️').then(newText => {
        if (newText && newText.trim() !== '' && newText !== currentText) {
            textElement.textContent = newText;
            textElement.style.fontStyle = 'italic';
            textElement.title = 'Edited';
            
            const editedLabel = document.createElement('span');
            editedLabel.textContent = ' (edited)';
            editedLabel.style.fontSize = '10px';
            editedLabel.style.color = 'var(--text-secondary)';
            textElement.appendChild(editedLabel);
            
            showToast('✅ Message edited', 'success');
            
            // TODO: Emit to server if needed
            // socket.emit('edit message', { messageId, newText });
        }
    });
}

function deleteMessage(messageId, messageDiv) {
    customConfirm(
        'This message will be permanently deleted. This action cannot be undone.',
        '🗑️ Delete Message',
        '🗑️',
        true
    ).then(confirmed => {
        if (confirmed) {
            // Add fade-out animation
            messageDiv.style.transition = 'all 0.3s ease-out';
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateX(-100%)';
            
            // Remove from DOM after animation
            setTimeout(() => {
                messageDiv.remove();
                showToast('✅ Message deleted', 'success');
            }, 300);
            
            // TODO: Emit to server to delete from database
            // socket.emit('delete message', { messageId });
        }
    });
}

// ==================== GROUP CREATION & MANAGEMENT ====================

function createNewGroup() {
    customPrompt('Enter a name for your new group:', '👥 Create Group', 'My Awesome Group', '', '👥').then(groupName => {
        if (!groupName || !groupName.trim()) {
            showToast('Group name is required', 'warning');
            return;
        }
        
        customPrompt(
            'Enter friend IDs to invite (comma-separated):',
            '📧 Invite Friends',
            'e.g., 123, 456, 789',
            '',
            '📧'
        ).then(memberIds => {
            if (!memberIds || !memberIds.trim()) {
                showToast('At least one member is required', 'warning');
                return;
            }
            
            const ids = memberIds.split(',').map(id => id.trim()).filter(Boolean);
            showToast(`✅ Group "${groupName}" created with ${ids.length} members!`, 'success');
            // TODO: socket.emit('create group', { groupName, memberIds: ids });
        });
    });
}

function changeGroupPhoto() {
    if (currentChatContext.type !== 'group') {
        showToast('Open a group chat first', 'warning');
        return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onloadend = () => {
            const groupIndex = joinedGroups.findIndex(g => g.id === currentChatContext.id);
            if (groupIndex > -1) {
                joinedGroups[groupIndex].avatar = reader.result;
                localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
                showToast('Group photo updated!', 'success');
                loadFriendsForDM();
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ==================== VIDEO CALLS ====================

function startVideoCall() {
    if (currentChatContext.type === 'none') {
        showToast('Open a chat or group first', 'warning');
        return;
    }
    
    const targetName = currentChatContext.name || 'Unknown';
    const callType = currentChatContext.type === 'group' ? 'Group' : '1-on-1';
    
    showToast(`📞 Starting ${callType} video call with ${targetName}...`, 'success');
    
    // TODO: Implement WebRTC video call
    setTimeout(() => {
        openVideoCallModal();
    }, 500);
}

// ==================== ARCHIVE CHATS ====================

let archivedChats = JSON.parse(localStorage.getItem('archivedChats') || '[]');

function toggleArchiveChat() {
    if (currentChatContext.type === 'none' || !currentChatContext.id) {
        showToast('Open a chat first', 'warning');
        return;
    }
    
    const chatId = currentChatContext.id;
    const chatName = currentChatContext.name || 'Unknown';
    const chatType = currentChatContext.type;
    
    const archiveIndex = archivedChats.findIndex(c => c.id === chatId && c.type === chatType);
    
    if (archiveIndex > -1) {
        // Unarchive
        archivedChats.splice(archiveIndex, 1);
        showToast(`${chatName} unarchived`, 'success');
    } else {
        // Archive
        archivedChats.push({ id: chatId, name: chatName, type: chatType });
        showToast(`${chatName} archived`, 'success');
        closeCurrentChat();
    }
    
    localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
    loadFriendsForDM(); // Refresh list to hide/show archived chats
}

function showArchivedChats() {
    if (archivedChats.length === 0) {
        showToast('No archived chats', 'warning');
        return;
    }
    
    let message = 'Archived Chats:<br><br>';
    archivedChats.forEach((chat, idx) => {
        message += `${idx + 1}. <strong>${chat.name}</strong> (${chat.type})<br>`;
    });
    
    customAlert(message, '📦 Archived Chats', '📦');
}

// ==================== STATISTICS & QUIZZES ====================

let userStats = JSON.parse(localStorage.getItem('userStats') || '{"messagesCount": 0, "totalChars": 0, "reactionsGiven": 0, "archiveCount": 0, "quizCorrect": 0}');

function updateUserStats(type, value = 1) {
    if (!userStats[type]) userStats[type] = 0;
    userStats[type] += value;
    localStorage.setItem('userStats', JSON.stringify(userStats));
}

function showUserStats() {
    const stats = userStats;
    const statsHtml = `
    <div style="background: var(--chat-bg); padding: 20px; border-radius: 8px; max-width: 400px;">
        <h3 style="color: var(--primary-color); margin-bottom: 16px;">📊 Your Statistics</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="background: var(--bg-color); padding: 12px; border-radius: 6px;">
                <div style="font-size: 12px; color: var(--text-secondary);">Messages Sent</div>
                <div style="font-size: 24px; color: var(--primary-color); font-weight: bold;">${stats.messagesCount || 0}</div>
            </div>
            <div style="background: var(--bg-color); padding: 12px; border-radius: 6px;">
                <div style="font-size: 12px; color: var(--text-secondary);">Characters Typed</div>
                <div style="font-size: 24px; color: var(--primary-color); font-weight: bold;">${stats.totalChars || 0}</div>
            </div>
            <div style="background: var(--bg-color); padding: 12px; border-radius: 6px;">
                <div style="font-size: 12px; color: var(--text-secondary);">Reactions Given</div>
                <div style="font-size: 24px; color: var(--primary-color); font-weight: bold;">${stats.reactionsGiven || 0}</div>
            </div>
            <div style="background: var(--bg-color); padding: 12px; border-radius: 6px;">
                <div style="font-size: 12px; color: var(--text-secondary);">Quiz Correct</div>
                <div style="font-size: 24px; color: var(--primary-color); font-weight: bold;">${stats.quizCorrect || 0}</div>
            </div>
        </div>
    </div>
    `;
    
    const modal = document.createElement('div');
    modal.innerHTML = statsHtml;
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.zIndex = '5000';
    
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.background = 'rgba(0,0,0,0.6)';
    backdrop.style.zIndex = '4999';
    backdrop.onclick = () => { backdrop.remove(); modal.remove(); };
    
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
}

function startQuiz() {
    const quizzes = [
        { q: 'What year is it?', a: '2026', type: 'year' },
        { q: 'How many reaction types exist?', a: '6', type: 'reactions' },
        { q: 'Can you archive chats?', a: 'yes', type: 'features' },
        { q: 'What is the max emoji size for stickers?', a: '96', type: 'size' },
    ];
    
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    
    customPrompt(quiz.q, '🎯 Quiz Time!', 'Your answer...', '', '🎯').then(answer => {
        if (answer && answer.toLowerCase().trim() === quiz.a.toLowerCase()) {
            showToast('✅ Correct! +1 point!', 'success');
            updateUserStats('quizCorrect', 1);
            updateStatsDisplay();
        } else if (answer !== null) {
            showToast(`❌ Wrong! Answer was: ${quiz.a}`, 'error');
        }
    });
}

function updateStatsDisplay() {
    const stats = JSON.parse(localStorage.getItem('userStats') || '{"messagesCount": 0, "totalChars": 0, "reactionsGiven": 0, "archiveCount": 0, "quizCorrect": 0}');
    userStats = stats;
    const messagesCountEl = document.getElementById('statMessagesCount');
    const totalCharsEl = document.getElementById('statTotalChars');
    const reactionsGivenEl = document.getElementById('statReactionsGiven');
    const quizCorrectEl = document.getElementById('statQuizCorrect');
    
    if (messagesCountEl) messagesCountEl.textContent = stats.messagesCount || 0;
    if (totalCharsEl) totalCharsEl.textContent = stats.totalChars || 0;
    if (reactionsGivenEl) reactionsGivenEl.textContent = stats.reactionsGiven || 0;
    if (quizCorrectEl) quizCorrectEl.textContent = stats.quizCorrect || 0;
}

function resetUserStats() {
    customConfirm(
        'This will reset all your statistics including messages sent, reactions given, and quiz scores. This action cannot be undone.',
        '⚠️ Reset Statistics',
        '⚠️',
        true
    ).then(confirmed => {
        if (confirmed) {
            localStorage.setItem('userStats', JSON.stringify({messagesCount: 0, totalChars: 0, reactionsGiven: 0, archiveCount: 0, quizCorrect: 0}));
            updateStatsDisplay();
            showToast('Statistics reset successfully', 'success');
        }
    });
}

// ==================== INITIALIZATION ====================

window.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    applySettingsToUI();
    pinnedChats = JSON.parse(localStorage.getItem('pinnedChats') || '[]');
    joinedCommunities = JSON.parse(localStorage.getItem('joinedCommunities') || '[]');
    joinedGroups = JSON.parse(localStorage.getItem('joinedGroups') || '[]');

    document.getElementById('desktopNotifications')?.addEventListener('change', saveNotificationSettings);
    document.getElementById('messageSound')?.addEventListener('change', saveNotificationSettings);
    document.getElementById('enterToSend')?.addEventListener('change', saveChatSettings);
    document.getElementById('showTypingIndicator')?.addEventListener('change', saveChatSettings);
    document.getElementById('autoplayGifs')?.addEventListener('change', saveChatSettings);
    document.getElementById('compactMode')?.addEventListener('change', saveAppearanceSettings);

    const messagesContainer = document.getElementById('messages-container');
    const scrollRail = document.getElementById('chatScrollRail');
    const scrollThumb = document.getElementById('chatScrollThumb');
    messagesContainer?.addEventListener('scroll', syncChatScrollbarPosition);
    messagesContainer?.addEventListener('wheel', handleChatWheel, { passive: false });
    scrollRail?.addEventListener('mousedown', jumpChatScrollbar);
    scrollThumb?.addEventListener('mousedown', startChatScrollbarDrag);
    document.addEventListener('mousemove', handleChatScrollbarDrag);
    document.addEventListener('mouseup', stopChatScrollbarDrag);
    window.addEventListener('resize', refreshChatScrollbar);
    setTimeout(refreshChatScrollbar, 120);

    // Load audio and theme settings
    loadAudioSettings();
    loadThemeSettings();
    refreshAudioDevices();
    updateStatsDisplay();

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
// ==================== CUSTOM DIALOG SYSTEM ====================

function customAlert(message, title = 'Notice', icon = 'ℹ️') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('customDialog');
        dialog.innerHTML = `
            <div class="custom-dialog">
                <div class="custom-dialog-content">
                    <div class="custom-dialog-header">
                        <div class="custom-dialog-icon">${icon}</div>
                        <div class="custom-dialog-title">${title}</div>
                    </div>
                    <div class="custom-dialog-message">${message}</div>
                    <div class="custom-dialog-buttons">
                        <button class="custom-dialog-btn custom-dialog-btn-primary primary-hover" onclick="closeCustomDialog()">OK</button>
                    </div>
                </div>
            </div>
        `;
        dialog.style.display = 'block';
        window.customDialogResolve = resolve;
    });
}

function customConfirm(message, title = 'Confirm', icon = '❓', isDanger = false) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('customDialog');
        const btnClass = isDanger ? 'custom-dialog-btn-danger danger-hover' : 'custom-dialog-btn-primary primary-hover';
        const confirmText = isDanger ? 'Delete' : 'Confirm';
        
        dialog.innerHTML = `
            <div class="custom-dialog">
                <div class="custom-dialog-content">
                    <div class="custom-dialog-header">
                        <div class="custom-dialog-icon">${icon}</div>
                        <div class="custom-dialog-title">${title}</div>
                    </div>
                    <div class="custom-dialog-message">${message}</div>
                    <div class="custom-dialog-buttons">
                        <button class="custom-dialog-btn custom-dialog-btn-secondary" onclick="resolveCustomDialog(false)">Cancel</button>
                        <button class="custom-dialog-btn ${btnClass}" onclick="resolveCustomDialog(true)">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;
        dialog.style.display = 'block';
        window.customDialogResolve = resolve;
    });
}

function customPrompt(message, title = 'Input', placeholder = '', defaultValue = '', icon = '✏️') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('customDialog');
        dialog.innerHTML = `
            <div class="custom-dialog">
                <div class="custom-dialog-content">
                    <div class="custom-dialog-header">
                        <div class="custom-dialog-icon">${icon}</div>
                        <div class="custom-dialog-title">${title}</div>
                    </div>
                    <div class="custom-dialog-message">${message}</div>
                    <input type="text" class="custom-dialog-input" id="customDialogInput" placeholder="${placeholder}" value="${defaultValue}">
                    <div class="custom-dialog-buttons">
                        <button class="custom-dialog-btn custom-dialog-btn-secondary" onclick="resolveCustomDialog(null)">Cancel</button>
                        <button class="custom-dialog-btn custom-dialog-btn-primary primary-hover" onclick="resolveCustomDialog(document.getElementById('customDialogInput').value)">Submit</button>
                    </div>
                </div>
            </div>
        `;
        dialog.style.display = 'block';
        setTimeout(() => document.getElementById('customDialogInput')?.focus(), 100);
        window.customDialogResolve = resolve;
    });
}

function closeCustomDialog() {
    document.getElementById('customDialog').style.display = 'none';
    if (window.customDialogResolve) window.customDialogResolve(true);
}

function resolveCustomDialog(value) {
    document.getElementById('customDialog').style.display = 'none';
    if (window.customDialogResolve) window.customDialogResolve(value);
}

// ==================== QR CODE FUNCTIONALITY ====================

function showQRCodeModal() {
    const modal = document.getElementById('qrModal');
    const canvas = document.getElementById('qrCodeCanvas');
    const userIdSpan = document.getElementById('qrUserId');
    
    if (!currentUser || !currentUser.id) {
        showToast('❌ User not logged in', 'error');
        return;
    }
    
    // Clear previous QR code by removing old canvas
    const qrContainer = canvas.parentElement;
    const oldCanvas = qrContainer.querySelector('canvas');
    if (oldCanvas) {
        oldCanvas.remove();
    }
    
    // Create new canvas
    const newCanvas = document.createElement('canvas');
    newCanvas.id = 'qrCodeCanvas';
    qrContainer.appendChild(newCanvas);
    
    // Display user ID
    userIdSpan.textContent = currentUser.id;
    
    // Generate QR code with friend request data
    const friendRequestData = `FRIEND_REQUEST:${currentUser.id}:${currentUser.username || 'User'}`;
    
    // Use QRCode library if available, otherwise use API
    if (typeof QRCode !== 'undefined') {
        try {
            new QRCode(newCanvas, {
                text: friendRequestData,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (error) {
            console.error('QRCode error:', error);
            generateQRCodeFallback(newCanvas, friendRequestData);
        }
    } else {
        // Use API fallback
        generateQRCodeFallback(newCanvas, friendRequestData);
    }
    
    modal.classList.add('show');
}

function generateQRCodeFallback(canvas, data) {
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 200;
    
    // Use QR Code API
    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, 200, 200);
    };
    img.onerror = () => {
        // Final fallback - draw text
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 200, 200);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Scan QR Code', 100, 80);
        ctx.fillText('User ID:', 100, 110);
        ctx.fillText(currentUser.id.toString(), 100, 130);
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data)}`;
}

function closeQRCodeModal() {
    document.getElementById('qrModal').classList.remove('show');
}

function scanQRCodeForFriend() {
    customPrompt(
        'Enter the QR code data or User ID to send a friend request:',
        '📷 Scan QR Code',
        'FRIEND_REQUEST:123:Username or just 123',
        '',
        '📷'
    ).then(qrData => {
        if (!qrData) return;
        
        let friendId = null;
        let friendName = 'User';
        
        // Parse QR data
        if (qrData.startsWith('FRIEND_REQUEST:')) {
            const parts = qrData.split(':');
            friendId = parts[1];
            friendName = parts[2] || 'User';
        } else {
            // Just ID provided
            friendId = qrData.trim();
        }
        
        if (!friendId) {
            showToast('❌ Invalid QR code data', 'error');
            return;
        }
        
        // Send friend request
        customConfirm(
            `Send friend request to <strong>${friendName}</strong> (ID: ${friendId})?`,
            '👤 Friend Request',
            '👤',
            false
        ).then(confirmed => {
            if (confirmed) {
                if (socket && socket.connected) {
                    socket.emit('send friend request', { toUserId: friendId });
                    showToast(`✅ Friend request sent to ${friendName}!`, 'success');
                } else {
                    showToast('❌ Not connected to server', 'error');
                }
            }
        });
    });
}

// ==================== VIDEO CALL MODAL ====================

function openVideoCallModal() {
    const targetName = currentChatContext.name || 'Unknown';
    
    customAlert(
        `📞 <strong>Video Call Starting...</strong><br><br>` +
        `Calling: <strong>${targetName}</strong><br>` +
        `Type: ${currentChatContext.type === 'group' ? 'Group Call' : '1-on-1 Call'}<br><br>` +
        `<em>Waiting for ${targetName} to answer...</em><br><br>` +
        `<small>⚠️ Video call uses WebRTC (P2P connection)</small>`,
        '📞 Video Call',
        '📞'
    );
    
    // Emit to server
    if (socket && socket.connected && currentChatContext.id) {
        socket.emit('start video call', { 
            targetId: currentChatContext.id, 
            type: currentChatContext.type,
            targetName: targetName
        });
    }
}

function visitUserProfile(userId, userName = 'User') {
    // Create a more detailed profile view
    const html = `
        <div style="text-align: center; padding: 20px 0;">
            <div style="width: 100px; height: 100px; background: var(--primary-color); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">
                👤
            </div>
            <h3 style="margin: 10px 0; color: var(--text-primary);">${userName}</h3>
            <p style="margin: 5px 0; color: var(--text-secondary); font-size: 13px;">User ID: ${userId}</p>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                <button onclick="{ 
                    currentChatContext = { id: '${userId}', name: '${userName}', type: 'dm' }; 
                    openDM('${userId}', '${userName}');
                    closeCustomDialog();
                }" style="padding: 8px 16px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    💬 Message
                </button>
                <button onclick="{ 
                    currentChatContext = { id: '${userId}', name: '${userName}', type: 'dm' }; 
                    openVideoCallModal();
                    closeCustomDialog();
                }" style="padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    📞 Call
                </button>
                <button onclick="{ 
                    sendFriendRequest('${userId}', '${userName}');
                    closeCustomDialog();
                }" style="padding: 8px 16px; background: #8e44ad; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                    👥 Add Friend
                </button>
            </div>
        </div>
    `;
    
    customAlert(html, `👤 ${userName}'s Profile`, '👤');
}

function sendFriendRequest(userId, userName = 'User') {
    customConfirm(
        `Send friend request to <strong>${userName}</strong>?`,
        '👥 Add Friend',
        '👥',
        false
    ).then(async confirmed => {
        if (!confirmed) return;
        
        try {
            const response = await fetch(`${API_BASE}/friends/request`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ toUserId: userId })
            });

            if (response.ok) {
                showToast(`✅ Friend request sent to ${userName}!`, 'success');
            } else {
                const data = await response.json();
                showToast(data.error || 'Failed to send friend request', 'error');
            }
        } catch (error) {
            console.error('Error sending friend request:', error);
            showToast('❌ Could not send friend request', 'error');
        }
    });
}

// ==================== MEDIA PREVIEW FUNCTIONALITY ====================

let copiedMediaItems = [];

function addToMediaPreview(type, url) {
    copiedMediaItems.push({ type, url, timestamp: Date.now() });
    renderMediaPreview();
    showToast('✅ Media added to preview!', 'success');
}

function renderMediaPreview() {
    const content = document.getElementById('mediaPreviewContent');
    content.innerHTML = '';
    
    copiedMediaItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'media-preview-item';
        
        if (item.type === 'image') {
            const img = document.createElement('img');
            img.src = item.url;
            img.alt = 'Copied image';
            div.appendChild(img);
        } else if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.url;
            video.controls = true;
            div.appendChild(video);
        }
        
        content.appendChild(div);
    });
}

function openMediaPreview() {
    document.getElementById('mediaPreviewPanel').classList.add('show');
}

function closeMediaPreview() {
    document.getElementById('mediaPreviewPanel').classList.remove('show');
}

// ==================== FRIEND SEARCH FUNCTIONALITY ====================

function filterFriends(searchText) {
    const channelsList = document.getElementById('channelsList');
    const channels = channelsList.querySelectorAll('.channel-item');
    
    searchText = searchText.toLowerCase().trim();
    
    channels.forEach(channel => {
        const username = channel.textContent.toLowerCase();
        if (username.includes(searchText)) {
            channel.style.display = 'flex';
        } else {
            channel.style.display = 'none';
        }
    });
}

// ==================== ARCHIVE SINGLE MESSAGE ====================

let archivedMessages = JSON.parse(localStorage.getItem('archivedMessages') || '[]');

function archiveSingleMessage(messageId, messageDiv) {
    const textElement = messageDiv.querySelector('.message-text');
    const imgElement = messageDiv.querySelector('img');
    const vidElement = messageDiv.querySelector('video');
    
    const messageData = {
        id: messageId,
        text: textElement?.textContent || '',
        mediaUrl: imgElement?.src || vidElement?.src || null,
        mediaType: imgElement ? 'image' : vidElement ? 'video' : 'text',
        timestamp: Date.now(),
        sender: messageDiv.dataset.sender || 'Unknown'
    };
    
    archivedMessages.push(messageData);
    localStorage.setItem('archivedMessages', JSON.stringify(archivedMessages));
    
    // Add archive animation
    messageDiv.style.transition = 'all 0.4s ease';
    messageDiv.style.opacity = '0.5';
    messageDiv.style.transform = 'translateX(-20px)';
    
    showToast('📦 Message archived!', 'success');
    
    setTimeout(() => {
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateX(0)';
    }, 500);
}

function showArchivedMessages() {
    customAlert(
        `You have ${archivedMessages.length} archived messages.<br><br>Check the Archived tab to view them.`,
        '📦 Archived Messages',
        '📦'
    );
}