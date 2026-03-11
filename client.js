let socket;
let currentUser = null;
let currentToken = null;
let isRegistering = false;
let currentChatFriendId = null;
let currentChatFriendName = null;
let currentChatContext = { type: 'none', id: null, name: null };
let pendingMediaDraft = null;
let pendingMediaDrafts = [];
let activeCallState = null;
let peerConnection = null;
let localCallStream = null;
let remoteCallStream = null;
let remoteIceCandidatesQueue = [];
let lastIceRecoveryAttemptAt = 0;
let lastCallWarningAt = 0;
let currentCallPeerId = null;
let currentCallPeerName = null;
let callTimerInterval = null;
let callStartedAt = null;
let incomingCallAudioContext = null;
let incomingCallInterval = null;
let activeRoomSubscription = null;
let roomMessages = JSON.parse(localStorage.getItem('roomMessages') || '{}');
let pinnedChats = [];
let joinedCommunities = [];
let joinedGroups = [];
let cachedShopItemsById = {};
let equippedShopItems = JSON.parse(localStorage.getItem('equippedShopItems') || '{}');
let communityProfiles = JSON.parse(localStorage.getItem('communityProfiles') || '{}');
let groupProfiles = JSON.parse(localStorage.getItem('groupProfiles') || '{}');
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


const SERVER_URL = window.location.origin;
const API_BASE = SERVER_URL + '/api';

console.log(`🌐 Connected to: ${SERVER_URL}`);

async function syncBuildVersionBadge() {
    try {
        const badge = document.getElementById('buildVersionBadge');
        if (!badge) return;

        const response = await fetch(`${API_BASE}/version`, { cache: 'no-store' });
        if (!response.ok) return;

        const data = await response.json();
        if (data?.version) {
            badge.textContent = `v${data.version}`;
            badge.title = `Running backend version: ${data.version}`;
        }
    } catch (error) {
        
    }
}

function startCallTimer() {
    stopCallTimer();
    callStartedAt = Date.now();
    const timerLabel = document.getElementById('callTimerLabel');
    if (!timerLabel) return;

    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
        const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        timerLabel.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartedAt = null;
}

function startIncomingCallAlert() {
    stopIncomingCallAlert();

    if (navigator.vibrate) {
        navigator.vibrate([300, 200, 300, 200, 300]);
    }

    incomingCallInterval = setInterval(() => {
        try {
            if (!incomingCallAudioContext) {
                incomingCallAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const osc = incomingCallAudioContext.createOscillator();
            const gain = incomingCallAudioContext.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.value = 0.05;
            osc.connect(gain);
            gain.connect(incomingCallAudioContext.destination);
            osc.start();
            osc.stop(incomingCallAudioContext.currentTime + 0.15);
        } catch (error) {
            
        }
    }, 900);
}

function stopIncomingCallAlert() {
    if (incomingCallInterval) {
        clearInterval(incomingCallInterval);
        incomingCallInterval = null;
    }

    if (navigator.vibrate) {
        navigator.vibrate(0);
    }
}



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



function connectSocket() {
    socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('✅ Connected to server:', SERVER_URL);
        socket.emit('join', { token: currentToken });
    });

    socket.on('users update', (users) => {
        updateMembersList(users);
    });

    socket.on('room chat history', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        const roomKey = String(roomType) + ':' + String(roomName);
        roomMessages[roomKey] = Array.isArray(payload?.messages) ? payload.messages : [];
        saveRoomMessages();

        const isCurrentRoom = currentChatContext?.type === roomType && String(currentChatContext?.name) === String(roomName);
        if (isCurrentRoom) {
            renderRoomMessages(roomKey, roomName, roomType);
        }
    });

    socket.on('room message', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        if (!roomType || !roomName) return;

        const roomKey = String(roomType) + ':' + String(roomName);
        if (!roomMessages[roomKey]) {
            roomMessages[roomKey] = [];
        }
        roomMessages[roomKey].push(payload);
        saveRoomMessages();

        const isCurrentRoom = currentChatContext?.type === roomType && String(currentChatContext?.name) === String(roomName);
        if (isCurrentRoom) {
           
            if (String(payload.from) !== String(currentUser.id)) {
                addMessageToChat(payload);
            }
        } else if (payload.from !== currentUser.id && chatSettings.notifyOnReceived) {
            
            const messagePreview = payload.mediaType === 'text' ? payload.content : `${payload.mediaType} message`;
            const roomLabel = roomType === 'community' ? 'Community' : 'Group';
            showToastClickable(
                `New message in ${roomLabel} "${roomName}" from ${payload.fromUsername}: ${messagePreview}`,
                'info',
                { type: roomType, name: roomName }
            );
            playNotificationSound();
        }
    });

    socket.on('room chat cleared', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        if (!roomType || !roomName) return;

        const roomKey = String(roomType) + ':' + String(roomName);
        roomMessages[roomKey] = [];
        saveRoomMessages();

        const isCurrentRoom = currentChatContext?.type === roomType && String(currentChatContext?.name) === String(roomName);
        if (isCurrentRoom) {
            document.getElementById('messages-container').innerHTML = '';
            refreshChatScrollbar();
        }
    });

    socket.on('dm history cleared', (payload) => {
        const fromUserId = payload?.fromUserId;
        if (!fromUserId) return;

       
        if (currentChatContext?.type === 'dm' && String(currentChatContext?.id) === String(fromUserId)) {
            document.getElementById('messages-container').innerHTML = '';
            refreshChatScrollbar();
            showToast('Chat history was cleared', 'info');
        }
    });
    socket.on('dm message', (data) => {
        const fromId = String(data.from);
        const toId = String(data.to);
        const myId = String(currentUser.id);
        const isSender = fromId === myId;
        const otherUserId = isSender ? toId : fromId;
        const isCurrentChat = (
            currentChatContext.type === 'dm' &&
            currentChatContext.id &&
            String(currentChatContext.id) === String(otherUserId)
        );

        if (isCurrentChat) {
            
            if (!isSender) {
                addMessageToChat(data);
            }
        }

        if (isSender && chatSettings.notifyOnSent) {
            
        }

        if (!isSender && chatSettings.notifyOnReceived) {
            const messagePreview = data.mediaType === 'text' ? data.content : `${data.mediaType} message`;
            showToastClickable(
                `New message from ${data.fromUsername}: ${messagePreview}`, 
                'info',
                { type: 'dm', friendId: otherUserId, friendName: data.fromUsername }
            );
            showDesktopNotification(`New message from ${data.fromUsername}`, messagePreview, false);
            playNotificationSound();
        }
    });

    socket.on('dm delivery status', (data) => {
        if (data && data.delivered === false) {
            showToast('Message sent, but recipient is currently offline', 'warning');
        }
    });

    socket.on('dm user typing', (data) => {
        
        showTypingIndicator(data.username);
    });

    socket.on('dm user stop typing', (data) => {
        
        hideTypingIndicator(data.username);
    });

    socket.on('community user typing', (data) => {
        
        if (currentChatContext.type === 'community' && currentChatContext.name === data.community) {
            showTypingIndicator(data.username);
        }
    });

    socket.on('community user stop typing', (data) => {
        if (currentChatContext.type === 'community' && currentChatContext.name === data.community) {
            hideTypingIndicator();
        }
    });

    socket.on('room user typing', (data) => {
        
        if ((currentChatContext.type === 'group' || currentChatContext.type === 'room') && String(currentChatContext.id) === String(data.roomId)) {
            showTypingIndicator(data.username);
        }
    });

    socket.on('room user stop typing', (data) => {
        if ((currentChatContext.type === 'group' || currentChatContext.type === 'room') && String(currentChatContext.id) === String(data.roomId)) {
            hideTypingIndicator();
        }
    });

    socket.on('error', (msg) => {
        console.error('Socket error:', msg);
        showToast(msg || 'Realtime error', 'error');
    });

    socket.on('friend request received', (payload) => {
        const senderName = payload?.fromUsername || 'Someone';
        showToast(`New friend request from ${senderName}`, 'warning');
        if (document.getElementById('friendsModal') && !document.getElementById('friendsModal').classList.contains('hidden')) {
            loadFriends();
        }
    });

    socket.on('friend request accepted', (payload) => {
        if (!currentUser) return;
        if (String(payload?.fromId) === String(currentUser.id) || String(payload?.toId) === String(currentUser.id)) {
            loadFriendsForDM();
            if (document.getElementById('friendsModal') && !document.getElementById('friendsModal').classList.contains('hidden')) {
                loadFriends();
            }
        }
    });

    socket.on('friend request rejected', (payload) => {
        if (!currentUser) return;
        if (String(payload?.fromId) === String(currentUser.id) || String(payload?.toId) === String(currentUser.id)) {
            if (document.getElementById('friendsModal') && !document.getElementById('friendsModal').classList.contains('hidden')) {
                loadFriends();
            }
        }
    });

    socket.on('incoming video call', (payload) => {
        handleIncomingVideoCall(payload);
    });

    socket.on('video call ringing', (payload) => {
        const targetName = currentChatContext?.name || 'user';
        activeCallState = { callId: payload.callId, peerId: payload.toId, direction: 'outgoing' };
        showToast(`Calling ${targetName}...`, 'success');
    });

    socket.on('video call accepted', (payload) => {
        const byName = payload?.byUsername || 'User';
        stopIncomingCallAlert();
        showToast(`${byName} accepted the call`, 'success');
        const peerId = activeCallState?.peerId || payload?.byUserId;
        if (peerId) {
            startCallSession(byName, peerId, true);
        }
    });

    socket.on('video call rejected', (payload) => {
        const byName = payload?.byUsername || 'User';
        stopIncomingCallAlert();
        showToast(`${byName} declined the call`, 'warning');
        activeCallState = null;
        closeCustomDialog();
    });

    socket.on('video call unavailable', () => {
        stopIncomingCallAlert();
        showToast('User is currently unavailable for calls', 'warning');
        cleanupCallSession(false);
    });

    socket.on('video call ended', (payload) => {
        const byName = payload?.byUsername || 'User';
        stopIncomingCallAlert();
        showToast(`Call ended by ${byName}`, 'warning');
        cleanupCallSession(false);
    });

    socket.on('video signal', async (payload) => {
        const signal = payload?.signal;
        const fromId = payload?.fromId;
        const fromName = payload?.fromUsername || 'User';

        if (!signal || !fromId) return;

        try {
            if (signal.type === 'offer') {
                if (!activeCallState) {
                    activeCallState = { callId: payload?.callId || null, peerId: fromId, direction: 'incoming' };
                }
                if (!peerConnection) {
                    await startCallSession(fromName, fromId, false);
                }
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.offer));
                await flushQueuedIceCandidates();
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                socket.emit('video signal', {
                    toId: fromId,
                    callId: activeCallState?.callId,
                    signal: { type: 'answer', answer }
                });
            }

            if (signal.type === 'answer' && peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                await flushQueuedIceCandidates();
            }

            if (signal.type === 'ice-candidate' && peerConnection && signal.candidate) {
                await addOrQueueIceCandidate(signal.candidate);
            }
        } catch (error) {
            console.error('Video signaling error:', error);
            showToast('Video call signaling failed', 'error');
        }
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



function showMainApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainApp').classList.remove('hidden');
    
    try {
        
        const profilePanel = document.getElementById('profilePanel');
        if (profilePanel) {
            profilePanel.classList.remove('show');
            profilePanel.removeAttribute('style');
        }
        
       
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.classList.remove('show');
            settingsPanel.removeAttribute('style');
        }
        
        
        const mobileMembersPanel = document.getElementById('mobileMembersPanel');
        if (mobileMembersPanel) {
            mobileMembersPanel.classList.remove('show');
        }
        
        
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('show');
        }
        
      
        const channelSidebar = document.getElementById('channelSidebar');
        if (channelSidebar) {
            channelSidebar.classList.remove('show');
        }
    } catch (e) {
        console.log('Error closing panels:', e);
    }
    
    loadUserProfile();
    loadShopItems();
   
    const urlParams = new URLSearchParams(window.location.search);
    const addFriendId = urlParams.get('addFriend');
    if (addFriendId && addFriendId !== currentUser.id) {
        sendFriendRequestFromLink(addFriendId);
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showSection(section) {
    if (section === 'chat') {
        document.querySelector('.chat-area').style.display = 'flex';
        document.getElementById('friendsModal').classList.add('hidden');
        document.getElementById('shopModal').classList.add('hidden');
        if (currentChatContext.type === 'community' || currentChatContext.type === 'group') {
            subscribeToRoomChat(currentChatContext.type, currentChatContext.name);
        }
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
    if (activeRoomSubscription && socket && socket.connected) {
        socket.emit('leave room chat', activeRoomSubscription);
    }
    activeRoomSubscription = null;
    currentChatFriendId = friendId;
    currentChatFriendName = friendName;
    currentChatContext = { type: 'dm', id: friendId, name: friendName };
    clearPendingMediaDraft();
    updatePinButtonState();
    
    
    const isSelfChat = String(friendId) === String(currentUser.id);
    const displayName = isSelfChat ? `📝 ${currentUser.username} (Notes)` : `💬 ${friendName}`;
    
    
    const chatTitleEl = document.getElementById('chatTitle');
    chatTitleEl.textContent = displayName;
    chatTitleEl.onclick = null;
    document.getElementById('messages-container').innerHTML = '';
    refreshChatScrollbar();
    
    
    document.getElementById('closeChatBtn').style.display = 'block';
    
   
    loadDMMessages(friendId);
    
   
    if (socket && socket.connected) {
        socket.emit('join dm', friendId);
    }
    
    showSection('chat');
    
    
    if (window.innerWidth <= 480) {
        closeMobileSidebar();
    }
}

async function loadDMMessages(friendId) {
    try {
        const response = await fetch(`${API_BASE}/dms/${friendId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const messages = await response.json();
        
        
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
    const sidebar = document.getElementById('channelSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar?.classList.toggle('show');
    if (overlay) {
        overlay.classList.toggle('show');
    }
}

function openProfile() {
    const panel = document.getElementById('profilePanel');
    if (!panel) return;
    panel.style.removeProperty('display');
    panel.style.removeProperty('visibility');
    panel.style.removeProperty('pointer-events');
    panel.style.removeProperty('opacity');
    panel.style.removeProperty('transform');
    panel.classList.add('show');
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
    const panel = document.getElementById('profilePanel');
    if (!panel) return;
    panel.classList.remove('show');
}

function switchProfileTab(tab, triggerEl) {
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

    const tabTrigger = triggerEl || (typeof event !== 'undefined' ? event.target : null);
    if (tabTrigger) {
        tabTrigger.classList.add('active');
    }
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
        localStorage.setItem('user', JSON.stringify(user));
        applyPersistedShopEffects();
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
            
           
            const optimisticMessage = {
                id: Date.now(),
                from: currentUser.id,
                fromUsername: currentUser.username,
                fromAvatar: currentUser.avatar,
                to: targetId,
                content: content,
                mediaType: 'text',
                timestamp: new Date().toISOString()
            };
            addMessageToChat(optimisticMessage);
            
            
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
    
    
    if (data.mediaType === 'sticker') {
        text.style.fontSize = '96px';
        text.style.lineHeight = '1';
        text.textContent = data.content;
    } else {
        
        const emojiRegex = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;
        const isOnlyEmojis = data.content && emojiRegex.test(data.content.trim());
        
        if (isOnlyEmojis && data.content.trim().length <= 20) {
            
            text.style.fontSize = '64px';
            text.style.lineHeight = '1.2';
        }
        
        text.textContent = data.content;
    }

    content.appendChild(header);
    content.appendChild(text);
    content.appendChild(time);

    
    messageDiv.oncontextmenu = (e) => {
        e.preventDefault();
        showMessageContextMenu(e, messageDiv, data);
        return false;
    };

   
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

    const replyBtn = document.createElement('button');
    replyBtn.className = 'message-action-btn';
    replyBtn.innerHTML = '↩️';
    replyBtn.title = 'Reply';
    replyBtn.onclick = (e) => {
        e.stopPropagation();
        const input = document.getElementById('messageInput');
        if (!input) return;
        const previewText = (data.content || '').trim().slice(0, 40);
        input.value = `@${data.fromUsername || 'user'} ${previewText ? `(${previewText}) ` : ''}`;
        input.focus();
    };

    const pinChatBtn = document.createElement('button');
    pinChatBtn.className = 'message-action-btn';
    pinChatBtn.innerHTML = '📌';
    pinChatBtn.title = 'Pin this chat';
    pinChatBtn.onclick = (e) => {
        e.stopPropagation();
        togglePinCurrentChat();
    };
    
    actions.appendChild(reactBtn);
    actions.appendChild(replyBtn);
    actions.appendChild(pinChatBtn);
    if (String(data.from) === String(currentUser?.id)) {
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
    }
    
    content.appendChild(actions);
    
    
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
        item.style.cursor = 'pointer';
        item.title = `Click to view ${user.username}'s profile`;

       
        const avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        if (user.avatar) {
            avatar.style.backgroundImage = `url(${user.avatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = user.username ? user.username.charAt(0).toUpperCase() : 'U';
        }

        const status = document.createElement('div');
        status.className = 'status-indicator';

        const name = document.createElement('span');
        name.textContent = user.username || 'Unknown';

        
        const userId = user.id || user._id || user.userId;
        const username = user.username || 'User';

        
        item.onclick = () => {
            if (!userId) {
                showToast('❌ User ID not available', 'error');
                return;
            }
            if (userId === currentUser.id || userId === currentUser._id) {
                openProfile();
            } else {
                visitUserProfile(userId, username);
            }
        };

        item.appendChild(avatar);
        item.appendChild(status);
        item.appendChild(name);
        membersList.appendChild(item);
    });

    
    const mobileMembersList = document.getElementById('mobileMembersList');
    if (mobileMembersList) {
        mobileMembersList.innerHTML = membersList.innerHTML;
    }
}



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

    const targetId = currentChatContext.type === 'dm' ? ensureChatTarget() : null;
    let sentCount = 0;

    for (const file of files) {
        
        const payload = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target.result;
                const mediaType = file.type.startsWith('image') ? 'image' : 'video';
                resolve({
                    content: file.name || (mediaType === 'image' ? 'Photo' : 'Video'),
                    mediaType,
                    mediaUrl: data
                });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });

        if (!payload) continue;

        if (currentChatContext.type === 'community' || currentChatContext.type === 'group') {
            sendRoomMessage(payload);
            sentCount += 1;
        } else if (targetId) {
            await sendStagedDm(targetId, payload);
            sentCount += 1;
        }
    }

    if (sentCount > 0) {
        showToast(`Sent ${sentCount} media file(s)`, 'success');
    }

    
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

    
    event.target.value = '';
}



async function loadFriendsForDM() {
    try {
        const response = await fetch(`${API_BASE}/friends`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const friends = await response.json();

        const channelsList = document.getElementById('channelsList');
        channelsList.innerHTML = '';

       
        const pinnedFriends = [];
        const unpinnedFriends = [];
        
        friends.forEach(friend => {
            const chatId = `dm:${friend.id}`;
            if (pinnedChats.includes(chatId)) {
                pinnedFriends.push(friend);
            } else {
                unpinnedFriends.push(friend);
            }
        });

       
        if (pinnedFriends.length > 0) {
            const pinnedTitle = document.createElement('div');
            pinnedTitle.className = 'channel-section-title';
            pinnedTitle.textContent = '📌 PINNED';
            channelsList.appendChild(pinnedTitle);

            pinnedFriends.forEach(friend => {
                createFriendChannelItem(friend, channelsList, true);
            });
        }

        if (joinedCommunities.length > 0) {
            const communitiesTitle = document.createElement('div');
            communitiesTitle.className = 'channel-section-title';
            communitiesTitle.textContent = 'COMMUNITIES';
            channelsList.appendChild(communitiesTitle);

            joinedCommunities.forEach(community => {
                const profile = getCommunityProfile(community);
                const communityAvatar = profile.image
                    ? `<div class="channel-avatar" style="background-image:url('${profile.image}'); background-size:cover; background-position:center;"></div>`
                    : `<div class="channel-avatar">${profile.icon || '🌐'}</div>`;
                const item = document.createElement('div');
                const chatId = `community:${community}`;
                item.className = 'channel-item';
                if (pinnedChats.includes(chatId)) {
                    item.classList.add('pinned');
                }
                item.innerHTML = `
                    ${communityAvatar}
                    <span>${community}</span>
                    ${pinnedChats.includes(chatId) ? '<span class="pin-indicator"><i class="fas fa-thumbtack"></i></span>' : ''}
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
                const profile = getGroupProfile(group);
                const groupAvatar = profile.image
                    ? `<div class="channel-avatar" style="background-image:url('${profile.image}'); background-size:cover; background-position:center;"></div>`
                    : `<div class="channel-avatar">${profile.icon || '👥'}</div>`;
                const item = document.createElement('div');
                const chatId = `group:${group}`;
                item.className = 'channel-item';
                if (pinnedChats.includes(chatId)) {
                    item.classList.add('pinned');
                }
                item.innerHTML = `
                    ${groupAvatar}
                    <span>${group}</span>
                    ${pinnedChats.includes(chatId) ? '<span class="pin-indicator"><i class="fas fa-thumbtack"></i></span>' : ''}
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
        
        if (unpinnedFriends.length === 0 && pinnedFriends.length === 0) {
            const empty = document.createElement('div');
            empty.style.padding = '10px';
            empty.style.color = 'var(--text-secondary)';
            empty.style.fontSize = '12px';
            empty.textContent = 'No friends yet';
            channelsList.appendChild(empty);
        } else {
            unpinnedFriends.forEach(friend => {
                createFriendChannelItem(friend, channelsList, false);
            });
        }
    } catch (error) {
        console.error('Failed to load friends for DM:', error);
    }
}

function createFriendChannelItem(friend, container, isPinned) {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.dataset.friendId = friend.id;
    
    if (isPinned) {
        item.classList.add('pinned');
    }
    
    
    const avatar = document.createElement('div');
    avatar.className = 'channel-avatar';
    if (friend.avatar) {
        avatar.style.backgroundImage = `url(${friend.avatar})`;
        avatar.style.backgroundSize = 'cover';
        avatar.style.backgroundPosition = 'center';
    } else {
        avatar.textContent = friend.username.charAt(0).toUpperCase();
    }
    
    
    const text = document.createElement('span');
    const status = friend.status === 'online' ? '🟢' : '⚫';
    text.textContent = `${status} ${friend.username}`;
    
    item.appendChild(avatar);
    item.appendChild(text);
    
    if (isPinned) {
        const pinIndicator = document.createElement('span');
        pinIndicator.className = 'pin-indicator';
        pinIndicator.innerHTML = '<i class="fas fa-thumbtack"></i>';
        item.appendChild(pinIndicator);
    }
    
    item.style.cursor = 'pointer';
    item.onclick = () => openDM(friend.id, friend.username);
    
    
    item.oncontextmenu = (e) => {
        e.preventDefault();
        showFriendContextMenu(e, friend.id, friend.username);
    };
    
    container.appendChild(item);
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
        const latestRequestsBySender = new Map();
        requests.forEach((req) => {
            const senderId = req?.from?.id ?? `request-${req?.id}`;
            const prev = latestRequestsBySender.get(senderId);
            if (!prev || Number(req.id) > Number(prev.id)) {
                latestRequestsBySender.set(senderId, req);
            }
        });

        const normalizedRequests = Array.from(latestRequestsBySender.values())
            .sort((a, b) => Number(b.id) - Number(a.id));

        if (normalizedRequests.length === 0) {
            requestsDiv.innerHTML = '<p style="color: var(--text-secondary);">No pending requests</p>';
        }
        normalizedRequests.forEach((req) => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.gap = '10px';
            item.style.padding = '12px';
            item.style.borderRadius = '10px';
            item.style.border = '1px solid var(--border-color)';
            item.style.background = 'rgba(255,255,255,0.02)';
            item.innerHTML = `
                <div style="flex: 1; cursor: pointer;" onclick="visitUserProfile('${req.from.id}', '${req.from.username}')">
                    <div class="friend-name">${req.from.username}</div>
                    <div class="friend-status">Pending request</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="acceptFriendRequest('${req.id}')" class="buy-btn">Accept</button>
                    <button onclick="rejectFriendRequest('${req.id}')" class="buy-btn" style="background: var(--danger);">Decline</button>
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
                <div onclick="openDM('${friend.id}', '${friend.username}')" style="flex: 1;">
                    <div class="friend-name">${friend.username}</div>
                    <div class="friend-status">${status}</div>
                </div>
                <div onclick="event.stopPropagation(); visitUserProfile('${friend.id}', '${friend.username}')" style="padding: 8px 12px; background: var(--primary-color); border: none; border-radius: 6px; cursor: pointer; color: white; font-size: 12px; font-weight: 600;">👤 Profile</div>
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

        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to accept friend request', 'error');
            return;
        }

        showToast('Friend request accepted!');
        loadFriends();
        loadFriendsForDM();
    } catch (error) {
        console.error(error);
        showToast('Could not accept friend request', 'error');
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



async function loadShopItems() {
    try {
        const response = await fetch(`${API_BASE}/shop`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const apiItems = await response.json();
        const items = Array.isArray(apiItems) && apiItems.length > 0 ? apiItems : [
            { id: 'fallback_banner_neon', name: 'Neon Banner Effect', description: 'Animated neon gradient banner for your profile.', price: 450, category: 'Banners' },
            { id: 'fallback_badge_founder', name: 'Founder Badge', description: 'Exclusive badge shown next to your username.', price: 320, category: 'Badges' },
            { id: 'fallback_color_pack', name: 'Color Burst Pack', description: 'Unlock 12 vibrant accent color themes.', price: 380, category: 'Themes' },
            { id: 'fallback_chat_fx', name: 'Message Glow FX', description: 'Subtle glow animation for your sent messages.', price: 260, category: 'Effects' },
            { id: 'fallback_avatar_ring', name: 'Aura Avatar Ring', description: 'Premium animated ring around your avatar.', price: 520, category: 'Avatar' },
            { id: 'fallback_nameplate', name: 'Crystal Nameplate', description: 'Polished nameplate style in member list.', price: 410, category: 'Nameplates' }
        ];

        cachedShopItemsById = {};
        items.forEach((item) => {
            cachedShopItemsById[item.id] = item;
        });

        const shopList = document.getElementById('shopList');
        shopList.innerHTML = '';

        if (items.length === 0) {
            shopList.innerHTML = '<p style="color: var(--text-secondary);">No shop items available</p>';
        } else {
            items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'shop-item';
                itemDiv.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="shop-item-name">${item.name}</div>
                            <span style="font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(88,101,242,0.15); color: var(--primary-color); border: 1px solid rgba(88,101,242,0.4);">${item.category || 'Premium'}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${item.description}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="shop-item-price">${item.price} 💰</span>
                        <button onclick="buyItem('${item.id}')" class="buy-btn">Buy</button>
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
            if (typeof data?.coins === 'number') {
                currentUser.coins = data.coins;
                localStorage.setItem('user', JSON.stringify(currentUser));
                const coinsDisplay = document.getElementById('coinsDisplay');
                if (coinsDisplay) {
                    coinsDisplay.textContent = `💰 Coins: ${data.coins}`;
                }
            }

            const purchasedItem = data?.purchasedItem || cachedShopItemsById[itemId];
            if (purchasedItem?.category) {
                applyShopItem(purchasedItem.id || itemId, purchasedItem.category);
            }

            showToast('Item purchased and applied!');
            loadShopItems();
            loadInventory();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Error purchasing item', 'error');
    }
}



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
            itemDiv.style.cursor = 'pointer';
            itemDiv.innerHTML = `
                <div>
                    <div class="shop-item-name">${item.itemId.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${item.itemId.description}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Qty: ${item.quantity}</div>
                </div>
                <button onclick="applyShopItem('${item.itemId.id}', '${item.itemId.category}')" class="buy-btn" style="background: var(--primary-color);">Use</button>
            `;
            inventoryList.appendChild(itemDiv);
        });
    } catch (error) {
        console.error('Failed to load inventory:', error);
    }
}

function saveEquippedShopItems() {
    localStorage.setItem('equippedShopItems', JSON.stringify(equippedShopItems));
}

function applyPersistedShopEffects() {
    if (!equippedShopItems || typeof equippedShopItems !== 'object') return;

    Object.entries(equippedShopItems).forEach(([category, itemId]) => {
        applyShopItem(itemId, category, { skipPersist: true, silent: true });
    });
}

async function flushQueuedIceCandidates() {
    if (!peerConnection || !remoteIceCandidatesQueue.length) return;

    const queued = [...remoteIceCandidatesQueue];
    remoteIceCandidatesQueue = [];
    for (const candidate of queued) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.warn('Failed to apply queued ICE candidate:', error);
        }
    }
}

async function addOrQueueIceCandidate(candidateData) {
    if (!peerConnection || !candidateData) return;

    const candidate = new RTCIceCandidate(candidateData);
    const hasRemoteDescription = Boolean(peerConnection.remoteDescription && peerConnection.remoteDescription.type);

    if (hasRemoteDescription) {
        await peerConnection.addIceCandidate(candidate);
    } else {
        remoteIceCandidatesQueue.push(candidate);
    }
}

function applyShopItem(itemId, category, options = {}) {
    const { skipPersist = false, silent = false } = options;
    const notify = (message, type = 'success') => {
        if (!silent) showToast(message, type);
    };

    const effectsMap = {
        'Banners': () => {
            document.documentElement.style.setProperty('--primary-color', '#00d4ff');
            document.documentElement.style.setProperty('--primary-hover', '#00b8e6');
            notify('✨ Banner effect applied! Your profile now has a neon glow.', 'success');
        },
        'Badges': () => {
            notify('🏆 Badge equipped! It now appears next to your name.', 'success');
            
        },
        'Themes': () => {
            const colors = ['#ff6b9d', '#c44569', '#4a69bd', '#6a89cc', '#60a3bc', '#78e08f', '#f6b93b', '#e55039'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            document.documentElement.style.setProperty('--primary-color', randomColor);
            document.documentElement.style.setProperty('--primary-hover', randomColor + 'dd');
            notify('🎨 Theme applied! Your accent color has changed.', 'success');
        },
        'Effects': () => {
            
            const style = document.createElement('style');
            style.id = 'message-glow-effect';
            style.textContent = `
                .message[data-sender="${currentUser.id}"] .message-content {
                    animation: messageGlow 2s ease-in-out infinite;
                }
                @keyframes messageGlow {
                    0%, 100% { box-shadow: 0 0 5px rgba(88, 101, 242, 0.3); }
                    50% { box-shadow: 0 0 20px rgba(88, 101, 242, 0.6); }
                }
            `;
            const existing = document.getElementById('message-glow-effect');
            if (existing) existing.remove();
            document.head.appendChild(style);
            notify('✨ Message glow effect activated!', 'success');
        },
        'Avatar': () => {
            const style = document.createElement('style');
            style.id = 'avatar-aura-effect';
            style.textContent = `
                .message-avatar {
                    position: relative;
                    animation: avatarPulse 3s ease-in-out infinite;
                }
                @keyframes avatarPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(88, 101, 242, 0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(88, 101, 242, 0); }
                }
            `;
            const existing = document.getElementById('avatar-aura-effect');
            if (existing) existing.remove();
            document.head.appendChild(style);
            notify('🌟 Avatar aura effect activated!', 'success');
        },
        'Nameplates': () => {
            const style = document.createElement('style');
            style.id = 'nameplate-effect';
            style.textContent = `
                .message-username {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    font-weight: 700;
                }
            `;
            const existing = document.getElementById('nameplate-effect');
            if (existing) existing.remove();
            document.head.appendChild(style);
            notify('💎 Crystal nameplate effect activated!', 'success');
        },
        'Emotes': () => {
            notify('😎 Special emotes unlocked! Use them in your messages.', 'success');
        }
    };

    const applyEffect = effectsMap[category];
    if (applyEffect) {
        applyEffect();
        if (!skipPersist && category) {
            equippedShopItems[category] = itemId;
            saveEquippedShopItems();
        }
    } else {
        notify('Effect applied!', 'success');
    }
}



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



function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.style.removeProperty('right');
    panel.classList.add('show');
    if (currentUser) {
        document.getElementById('settingsEmail').value = currentUser.email || '';
        document.getElementById('settingsUsername').value = '';
    }
    populateAccountSwitcher();
    applySettingsToUI();
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.classList.remove('show');
    const simpleTheme = localStorage.getItem('simpleTheme');
    if (simpleTheme) {
        showToast('✅ Settings saved!', 'success');
    }
}

function switchSettingsTab(tab, triggerEl) {
    
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const navTrigger = triggerEl || (typeof event !== 'undefined' ? event.target : null);
    if (navTrigger) {
        navTrigger.classList.add('active');
    }
    
    
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



function closeCurrentChat() {
    if (activeRoomSubscription && socket && socket.connected) {
        socket.emit('leave room chat', activeRoomSubscription);
    }
    activeRoomSubscription = null;
    currentChatFriendId = null;
    currentChatFriendName = null;
    currentChatContext = { type: 'none', id: null, name: null };
    clearPendingMediaDraft();
    const chatTitleEl = document.getElementById('chatTitle');
    chatTitleEl.textContent = '💬 Select a friend to chat';
    chatTitleEl.onclick = null;
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

    if (!socket || !socket.connected) {
        showToast('Connection lost. Reconnecting...', 'warning');
        connectSocket();
        return;
    }

    
    const optimisticMessage = {
        id: Date.now(),
        from: currentUser.id,
        fromUsername: currentUser.username,
        fromAvatar: currentUser.avatar,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl || null,
        timestamp: new Date().toISOString()
    };
    addMessageToChat(optimisticMessage);

    socket.emit('send room message', {
        roomType: currentChatContext.type,
        roomName: currentChatContext.name,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl || null
    });
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
    
   
    const communities = [
        { name: 'Gaming', iconId: '1F579', description: 'Talk about your favorite games' },
        { name: 'Coding', iconId: '1F4BB', description: 'Share code and learn together' },
        { name: 'Music', iconId: '1F3B5', description: 'Discuss and share music' },
        { name: 'Art', iconId: '1F3A8', description: 'Share your creative works' },
        { name: 'Sports', iconId: '26BD', description: 'Sports fans unite' },
        { name: 'Movies', iconId: '1F3AC', description: 'Film enthusiasts' }
    ];
    
    list.innerHTML = communities.map(c => {
        const isJoined = joinedCommunities.includes(c.name);
        const profile = getCommunityProfile(c.name);
        return `
            <div class="friend-item" style="flex-direction: column; align-items: flex-start; padding: 16px;">
                <div style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                    <div>
                        <span class="friend-name" style="font-size: 16px;">${profile.icon || String.fromCodePoint(parseInt(c.iconId, 16))} ${c.name}</span>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${c.description}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        ${isJoined ? `<button class="buy-btn" onclick="openCommunityDetails('${c.name}')" style="background: var(--secondary-color);">Details</button>` : ''}
                        <button class="buy-btn" 
                            onclick="${isJoined ? `openCommunityChat('${c.name}'); closeCommunitiesModal();` : `joinCommunity('${c.name}')`}" 
                            style="${isJoined ? 'background: var(--success);' : ''}">
                            ${isJoined ? 'Open' : 'Join'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    modal.classList.remove('hidden');
}

function closeCommunitiesModal() {
    document.getElementById('communitiesModal').classList.add('hidden');
}

function openGroupsModal() {
    const modal = document.getElementById('groupsModal');
    const list = document.getElementById('groupsList');
    
   
    const groups = [
        { name: 'Study Group', emoji: '📚', description: 'Study together and share notes' },
        { name: 'Project Team', emoji: '💼', description: 'Collaborate on projects' },
        { name: 'Family', emoji: '👨‍👩‍👧', description: 'Family group chat' },
        { name: 'Friends', emoji: '🎉', description: 'Hang out with friends' },
        { name: 'Work', emoji: '🏢', description: 'Work related discussions' }
    ];
    
    list.innerHTML = groups.map(g => {
        const isJoined = joinedGroups.includes(g.name);
        const profile = getGroupProfile(g.name);
        const avatarHtml = profile.image
            ? `<div class="channel-avatar" style="background-image:url('${profile.image}'); background-size:cover; background-position:center;"></div>`
            : `<div class="channel-avatar">${profile.icon || g.emoji}</div>`;
        return `
            <div class="friend-item" style="flex-direction: column; align-items: flex-start; padding: 16px;">
                <div style="display: flex; width: 100%; justify-content: space-between; align-items: center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        ${avatarHtml}
                        <div>
                        <span class="friend-name" style="font-size: 16px;">${g.name}</span>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${g.description}</div>
                        </div>
                    </div>
                    <button class="buy-btn" 
                        onclick="${isJoined ? `openGroupChat('${g.name}'); closeGroupsModal();` : `joinGroup('${g.name}')`}" 
                        style="${isJoined ? 'background: var(--success);' : ''}">
                        ${isJoined ? 'Open' : 'Join'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    modal.classList.remove('hidden');
}

function closeGroupsModal() {
    document.getElementById('groupsModal').classList.add('hidden');
}

function subscribeToRoomChat(roomType, roomName) {
    if (!socket || !socket.connected) return;

    if (activeRoomSubscription) {
        socket.emit('leave room chat', activeRoomSubscription);
    }

    activeRoomSubscription = { roomType, roomName };
    socket.emit('join room chat', { roomType, roomName });
}

function openCommunityChat(name) {
    console.log('🌐 Opening community chat:', name);
    const profile = getCommunityProfile(name);
    currentChatFriendId = null;
    currentChatFriendName = `Community: ${name}`;
    currentChatContext = { type: 'community', id: name, name };
    clearPendingMediaDraft();
    updatePinButtonState();
    const chatTitleEl = document.getElementById('chatTitle');
    chatTitleEl.textContent = `${profile.icon || '🌐'} Community: ${name}`;
    chatTitleEl.onclick = () => openCommunityDetails(name);
    renderRoomMessages(`community:${name}`, name, 'community');
    subscribeToRoomChat('community', name);
    document.getElementById('closeChatBtn').style.display = 'block';
    showSection('chat');
    
    
    if (window.innerWidth <= 480) {
        closeMobileSidebar();
    }
}

function openGroupChat(name) {
    console.log('👥 Opening group chat:', name);
    const profile = getGroupProfile(name);
    currentChatFriendId = null;
    currentChatFriendName = `Group: ${name}`;
    currentChatContext = { type: 'group', id: name, name };
    clearPendingMediaDraft();
    updatePinButtonState();
    const chatTitleEl = document.getElementById('chatTitle');
    chatTitleEl.textContent = `${profile.icon || '👥'} Group: ${name}`;
    chatTitleEl.onclick = null;
    renderRoomMessages(`group:${name}`, name, 'group');
    subscribeToRoomChat('group', name);
    document.getElementById('closeChatBtn').style.display = 'block';
    showSection('chat');
    
    
    if (window.innerWidth <= 480) {
        closeMobileSidebar();
    }
}

function joinCommunity(name) {
    if (joinedCommunities.includes(name)) {
        showToast('Already joined this community', 'warning');
        return;
    }

    const profile = getCommunityProfile(name);
    const alreadyMember = (profile.members || []).some((m) => String(m.id) === String(currentUser?.id));
    if (!alreadyMember) {
        profile.members = profile.members || [];
        profile.members.push({
            id: currentUser?.id,
            username: currentUser?.username || 'You',
            role: profile.members.length === 0 ? 'leader' : 'member'
        });
        communityProfiles[name] = profile;
        localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
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
    getGroupProfile(name);
    joinedGroups.push(name);
    localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
    loadFriendsForDM();
    showToast(`Joined ${name} group!`);
}



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
            
            const stream = await getSelectedMicrophone();
            const mimeType = getSupportedAudioMimeType();
            recordedAudioMimeType = mimeType || 'audio/webm';
            mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            audioChunks = [];
            
           
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
                    
                    
                    if (previewContainer) previewContainer.style.display = 'block';
                    if (previewAudio) {
                        previewAudio.src = reader.result;
                        previewAudio.load();
                        
                        previewAudio.volume = 1.0;
                        
                        
                        if (audioSettings.speakerId && audioSettings.speakerId !== 'default' && previewAudio.setSinkId) {
                            previewAudio.setSinkId(audioSettings.speakerId).catch(err => {
                                console.warn('Could not set preview audio output:', err);
                            });
                        }
                        
                       
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
    
    
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.removeAttribute('src');
        previewAudio.load();
    }
    if (sendBtn) sendBtn.disabled = true;
}



function handleChatWheel(event) {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    event.preventDefault();
    const delta = event.deltaY;
    container.scrollBy({ top: delta * 0.8, behavior: 'auto' });
}



async function refreshAudioDevices() {
    try {
        
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
    
    
    applySpeakerToAudioElements();
    
    showToast('Audio settings saved', 'success');
}

function applySpeakerToAudioElements() {
    const speakerId = audioSettings.speakerId;
    if (!speakerId || speakerId === 'default') return;
    
    
    document.querySelectorAll('audio').forEach(audio => {
        if (audio.setSinkId) {
            audio.setSinkId(speakerId).catch(err => {
                console.warn('Could not set audio output:', err);
            });
        }
    });
    
    
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
    
    root.style.setProperty('--ui-text-color', '#ffffff');
    
    
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



let messageReactions = {}; 

function showQuickReactions(messageId, messageDiv) {
    const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    
    
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    
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
       
        messageReactions[messageId][emoji].splice(userIndex, 1);
        if (messageReactions[messageId][emoji].length === 0) {
            delete messageReactions[messageId][emoji];
        }
    } else {
      
        messageReactions[messageId][emoji].push(userId);
        updateUserStats('reactionsGiven', 1);
    }
    
    renderMessageReactions(messageId);
    updateStatsDisplay();
    showToast(`Reacted with ${emoji}`, 'success');
}

function showMessageContextMenu(e, messageDiv, data) {
    
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
    
    
    const lastBtn = menu.lastElementChild;
    if (lastBtn) lastBtn.style.borderBottom = 'none';
    
    document.body.appendChild(menu);
    
    
    document.addEventListener('click', () => menu.remove(), { once: true });
}

function showFriendContextMenu(e, friendId, friendName) {
    
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
    
    
    const lastBtn = menu.lastElementChild;
    if (lastBtn) lastBtn.style.borderBottom = 'none';
    
    document.body.appendChild(menu);
    
    
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
            
            if (imgElement) {
                addToMediaPreview('image', url);
            } else if (vidElement) {
                addToMediaPreview('video', url);
            }
            
            
            navigator.clipboard.writeText(url).then(() => {
                const mediaType = imgElement ? 'Image' : vidElement ? 'Video' : 'Audio';
                showToast(`✅ ${mediaType} copied! View in preview panel.`, 'success');
                
                
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
            
            messageDiv.style.transition = 'all 0.3s ease-out';
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateX(-100%)';
            
            
            setTimeout(() => {
                messageDiv.remove();
                showToast('✅ Message deleted', 'success');
            }, 300);
            
            
        }
    });
}



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



function startVideoCall() {
    if (!currentChatContext || currentChatContext.type === 'none' || !currentChatContext.id) {
        showToast('❌ Please open a chat first', 'warning');
        return;
    }

    if (currentChatContext.type !== 'dm') {
        showToast('Video calls are currently available for direct chats only', 'warning');
        return;
    }
    
    const targetName = currentChatContext.name || 'User';
    const targetId = currentChatContext.id;
    const callType = 'Video Call';
    
    
    openVideoCallModal(targetName, targetId, callType);
}



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
        
        archivedChats.splice(archiveIndex, 1);
        showToast(`${chatName} unarchived`, 'success');
    } else {
        
        archivedChats.push({ id: chatId, name: chatName, type: chatType });
        showToast(`${chatName} archived`, 'success');
        
        if (chatType === 'dm') {
            const friendIndex = friends.findIndex(f => f.id === chatId);
            if (friendIndex > -1) {
                friends.splice(friendIndex, 1);
                localStorage.setItem('friends', JSON.stringify(friends));
            }
        }
        closeCurrentChat();
    }
    
    localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
    loadFriendsForDM(); 
}

function showArchivedChats() {
    if (archivedChats.length === 0) {
        showToast('No archived chats yet', 'warning');
        return;
    }
    
    const chatsHtml = archivedChats.map((chat, idx) => {
        const icon = chat.type === 'dm' ? '👤' : chat.type === 'community' ? '🌐' : '👥';
        return `
            <div style="padding: 12px; background: var(--bg-color); border-radius: 8px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; border: 1px solid var(--border-color);" 
                 onclick="openArchivedChat('${chat.type}', '${chat.id}', '${String(chat.name).replace(/'/g, "\\'")}'); closeCustomDialog();"
                 onmouseover="this.style.background='var(--sidebar-bg)'; this.style.borderColor='var(--primary-color)';"
                 onmouseout="this.style.background='var(--bg-color)'; this.style.borderColor='var(--border-color)';">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 24px;">${icon}</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 14px;">${chat.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${chat.type === 'dm' ? 'Direct Message' : chat.type === 'community' ? 'Community' : 'Group Chat'}</div>
                    </div>
                    <button onclick="event.stopPropagation(); unarchiveChat('${chat.type}', '${chat.id}');" style="padding: 6px 12px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Unarchive</button>
                </div>
            </div>
        `;
    }).join('');
    
    const html = `
        <div style="max-width: 500px;">
            <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 13px;">Click on a chat to open it, or unarchive to move it back to your main chat list.</p>
            <div style="max-height: 400px; overflow-y: auto;">
                ${chatsHtml}
            </div>
            <button class="secondary-btn" onclick="closeCustomDialog()" style="width: 100%; margin-top: 12px;">Close</button>
        </div>
    `;
    
    customAlert(html, '📦 Archived Chats', '📦');
}

function openArchivedChat(type, id, name) {
    if (type === 'dm') {
        openDM(id, name);
    } else if (type === 'community') {
        openCommunityChat(name);
    } else if (type === 'group') {
        openGroupChat(name);
    }
}

function unarchiveChat(type, id) {
    const index = archivedChats.findIndex(c => c.type === type && c.id === id);
    if (index > -1) {
        const chat = archivedChats[index];
        archivedChats.splice(index, 1);
        localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
        showToast(`${chat.name} unarchived`, 'success');
        loadFriendsForDM();
        closeCustomDialog();
        showArchivedChats(); 
    }
}



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
        { q: 'What year is it?', a: '2026', type: 'year', coins: 50 },
        { q: 'How many reaction types exist?', a: '6', type: 'reactions', coins: 50 },
        { q: 'Can you archive chats?', a: 'yes', type: 'features', coins: 50 },
        { q: 'What is the max emoji size for stickers?', a: '96', type: 'size', coins: 50 },
    ];
    
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    
    customPrompt(quiz.q, '🎯 Quiz Time!', 'Your answer...', '', '🎯').then(answer => {
        if (answer && answer.toLowerCase().trim() === quiz.a.toLowerCase()) {
            showToast(`✅ Correct! +${quiz.coins} 💰 Coins!`, 'success');
            updateUserStats('quizCorrect', 1);
            addCoins(quiz.coins);
            updateStatsDisplay();
            updateUserProfile();
        } else if (answer !== null) {
            showToast(`❌ Wrong! Answer was: ${quiz.a}`, 'error');
        }
    });
}

function addCoins(amount) {
    const userJSON = localStorage.getItem('user');
    if (!userJSON) return;
    const user = JSON.parse(userJSON);
    user.coins = (user.coins || 0) + amount;
    localStorage.setItem('user', JSON.stringify(user));
    currentUser.coins = user.coins;
    const coinsDisplay = document.getElementById('coinsDisplay');
    if (coinsDisplay) coinsDisplay.textContent = `💰 Coins: ${user.coins}`;
}

function updateUserProfile() {
    if (!currentUser) return;
    const userJSON = localStorage.getItem('user');
    if (userJSON) {
        const user = JSON.parse(userJSON);
        currentUser = user;
        const coinsDisplay = document.getElementById('coinsDisplay');
        if (coinsDisplay) coinsDisplay.textContent = `💰 Coins: ${user.coins || 0}`;
    }
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


function showMobileSection(section) {
   
    if (window.innerWidth <= 768) {
        closeMobileSidebar();
        closeSettings();
        closeProfile();
        closeCommunitiesModal();
        closeGroupsModal();
    }

   
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        if (item.getAttribute('data-section') === section) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    
    switch(section) {
        case 'chats':
            toggleChannelSidebar();
            break;
        case 'communities':
            openCommunitiesModal();
            break;
        case 'groups':
            openGroupsModal();
            break;
        case 'friends':
            showSection('friends');
            break;
        case 'settings':
            openSettings();
            break;
    }
}

function closeMobileSidebar() {
    document.getElementById('channelSidebar')?.classList.remove('show');
    document.getElementById('mobileMembersPanel')?.classList.remove('show');
    document.getElementById('sidebarOverlay')?.classList.remove('show');
}

function openQuickActionsMenu() {
    const extraActions = [];
    if (currentChatContext?.type && currentChatContext.type !== 'none') {
        extraActions.push('<button class="secondary-btn" onclick="clearCurrentChatHistory(); closeCustomDialog();">🧹 Clear Current Chat</button>');
        if (currentChatContext.type === 'group') {
            extraActions.push('<button class="secondary-btn" onclick="changeGroupImagePrompt(currentChatContext.name); closeCustomDialog();">🖼️ Change Group Image</button>');
        }
        if (currentChatContext.type === 'community') {
            extraActions.push('<button class="secondary-btn" onclick="changeCommunityImagePrompt(currentChatContext.name); closeCustomDialog();">🖼️ Change Community Image</button>');
        }
    }

    const html = `
        <div style="display:grid; gap:10px; min-width:260px;">
            <button class="secondary-btn" onclick="showQRCodeModal(); closeCustomDialog();">📱 My QR Code</button>
            <button class="secondary-btn" onclick="scanQRCodeForFriend(); closeCustomDialog();">📷 Scan QR</button>
            <button class="save-btn" onclick="openArchivedChatsFromQuickActions();">📦 Archived Chats</button>
            ${extraActions.join('')}
            <button class="secondary-btn" onclick="openSettings(); closeCustomDialog();">⚙️ Settings</button>
            <button class="secondary-btn" onclick="openProfile(); closeCustomDialog();">👤 Profile</button>
            <button class="secondary-btn" onclick="toggleArchiveChat(); closeCustomDialog();">🗂️ Archive Current Chat</button>
            <button class="save-btn" style="background: var(--danger);" onclick="logout(); closeCustomDialog();">🚪 Logout</button>
        </div>
    `;
    customAlert(html, 'Quick Actions', '📱');
}

function showQuickActionsMenu() {
    openQuickActionsMenu();
}

function openArchivedChatsFromQuickActions() {
    closeCustomDialog();
    setTimeout(() => showArchivedChats(), 40);
}

function toggleMobileMembers() {
    const panel = document.getElementById('mobileMembersPanel');
    const overlay = document.getElementById('sidebarOverlay');
    if (!panel) return;
    
    const isShowing = panel.classList.contains('show');
    
    if (isShowing) {
        panel.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    } else {
        panel.classList.add('show');
        if (overlay) overlay.classList.add('show');
        updateMobileMembersList();
    }
}

function updateMobileMembersList() {
    const mobileList = document.getElementById('mobileMembersList');
    const desktopList = document.getElementById('membersList');
    if (!mobileList || !desktopList) return;
    
    
    mobileList.innerHTML = desktopList.innerHTML;
}

function getCommunityProfile(name) {
    if (!communityProfiles[name]) {
        communityProfiles[name] = {
            name,
            icon: '',
            image: '',
            members: [
                {
                    id: currentUser?.id || `u-${Date.now()}`,
                    username: currentUser?.username || 'You',
                    role: 'leader'
                }
            ]
        };
        localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
    }
    return communityProfiles[name];
}

function getGroupProfile(name) {
    if (!groupProfiles[name]) {
        groupProfiles[name] = {
            name,
            icon: '👥',
            image: ''
        };
        localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
    }
    return groupProfiles[name];
}

function openCommunityDetails(name) {
    const profile = getCommunityProfile(name);
    const modal = document.getElementById('communityDetailsModal');
    const title = document.getElementById('communityDetailsTitle');
    const body = document.getElementById('communityDetailsBody');
    if (!modal || !title || !body) return;

    title.textContent = `${profile.icon} ${profile.name}`;
    const members = Array.isArray(profile.members) ? profile.members : [];
    body.innerHTML = `
        <div style="display:grid; gap:12px; margin-bottom:14px;">
            <button class="secondary-btn" onclick="renameCommunityPrompt('${name}')">✏️ Rename Community</button>
            <button class="secondary-btn" onclick="changeCommunityIconPrompt('${name}')">🖼️ Change Icon</button>
            <button class="secondary-btn" onclick="changeCommunityImagePrompt('${name}')">🖼️ Upload Cover Image</button>
            <div style="font-size:12px; color:var(--text-secondary);">Tap member cards to open profile. Leaders can manage community metadata here.</div>
        </div>
        <div style="font-weight:700; margin-bottom:8px;">Members (${members.length})</div>
        ${members.map((m) => `
            <div class="community-member-card" onclick="visitUserProfile('${m.id}', '${String(m.username).replace(/'/g, "\\'")}')">
                <div class="member-avatar">${String(m.username || 'U').charAt(0).toUpperCase()}</div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span style="font-weight:600;">${m.username}</span>
                    <span style="font-size:12px; color:var(--text-secondary);">View full profile</span>
                </div>
                <span class="community-role-pill ${m.role === 'leader' ? 'leader' : ''}">${m.role === 'leader' ? 'Leader' : 'Member'}</span>
            </div>
        `).join('')}
    `;

    modal.classList.add('show');
}

function closeCommunityDetails() {
    document.getElementById('communityDetailsModal')?.classList.remove('show');
}

function renameCommunityPrompt(name) {
    customPrompt('Enter new community name', 'Rename Community', name, '', '✏️').then((newName) => {
        if (!newName || !newName.trim() || newName.trim() === name) return;
        const trimmed = newName.trim();

        const idx = joinedCommunities.indexOf(name);
        if (idx >= 0) {
            joinedCommunities[idx] = trimmed;
            localStorage.setItem('joinedCommunities', JSON.stringify(joinedCommunities));
        }

        if (communityProfiles[name]) {
            communityProfiles[trimmed] = { ...communityProfiles[name], name: trimmed };
            delete communityProfiles[name];
            localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
        }

        if (currentChatContext.type === 'community' && currentChatContext.name === name) {
            openCommunityChat(trimmed);
        }

        loadFriendsForDM();
        closeCommunityDetails();
        showToast('Community renamed', 'success');
    });
}

function changeCommunityIconPrompt(name) {
    const commonIcons = ['🌐', '💎', '🎮', '🎨', '🎵', '📚', '⚽', '🍕', '🚀', '💻', '🎯', '🏆', '🎬', '🌟', '❤️', '🔥'];
    const iconsHtml = commonIcons.map(icon => 
        `<button onclick="setCommunityIcon('${name}', '${icon}')" style="font-size: 32px; padding: 10px; border: 2px solid var(--border-color); border-radius: 8px; background: var(--bg-color); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.1)'; this.style.borderColor='var(--primary-color)';" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='var(--border-color)';">${icon}</button>`
    ).join('');
    
    const html = `
        <div style="max-width: 400px;">
            <p style="margin-bottom: 16px; color: var(--text-secondary); font-size: 14px;">Choose an icon for your community: "${name}"</p>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
                ${iconsHtml}
            </div>
            <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 6px; margin-bottom: 12px;">
                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">Or paste any emoji:</div>
                <input type="text" id="customIconInput" placeholder="Paste emoji here..." style="width: 100%; padding: 10px; background: var(--chat-bg); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 24px; text-align: center;" maxlength="2">
                <button class="save-btn" onclick="setCommunityIconFromInput('${name}')" style="margin-top: 8px; width: 100%;">Set Custom Icon</button>
            </div>
            <button class="secondary-btn" onclick="closeCustomDialog()" style="width: 100%;">Cancel</button>
        </div>
    `;
    customAlert(html, 'Change Community Icon', '🖼️');
}

function setCommunityIcon(name, icon) {
    const profile = getCommunityProfile(name);
    profile.icon = icon;
    communityProfiles[name] = profile;
    localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
    closeCustomDialog();
    openCommunityDetails(name);
    if (currentChatContext.type === 'community' && currentChatContext.name === name) {
        document.getElementById('chatTitle').textContent = `${profile.icon} Community: ${name}`;
    }
    loadFriendsForDM(); 
    showToast('Community icon updated! 🎉', 'success');
}

function setCommunityIconFromInput(name) {
    const input = document.getElementById('customIconInput');
    if (!input || !input.value.trim()) {
        showToast('Please enter an emoji', 'warning');
        return;
    }
    setCommunityIcon(name, input.value.trim().slice(0, 2));
}

function changeCommunityImagePrompt(name) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const profile = getCommunityProfile(name);
            profile.image = reader.result;
            communityProfiles[name] = profile;
            localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
            
         
            if (currentChatContext?.type === 'community' && currentChatContext?.name === name) {
                const profileAvatar = document.getElementById('profileAvatar');
                if (profileAvatar) {
                    profileAvatar.style.backgroundImage = `url(${reader.result})`;
                    profileAvatar.style.backgroundSize = 'cover';
                    profileAvatar.style.backgroundPosition = 'center';
                    profileAvatar.textContent = '';
                }
                const profileName = document.getElementById('profileName');
                if (profileName) {
                    profileName.textContent = name;
                }
                
                setTimeout(() => {
                    const avatarDiv = document.getElementById('profileAvatar');
                    if (avatarDiv && !avatarDiv.style.backgroundImage) {
                        avatarDiv.style.backgroundImage = `url(${reader.result})`;
                        avatarDiv.style.backgroundSize = 'cover';
                    }
                }, 100);
            }
            
            loadFriendsForDM();
            showToast('Community image updated (Profile updated)', 'success');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function changeGroupImagePrompt(name) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const profile = getGroupProfile(name);
            profile.image = reader.result;
            groupProfiles[name] = profile;
            localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
            
            
            if (currentChatContext?.type === 'group' && currentChatContext?.name === name) {
                const profileAvatar = document.getElementById('profileAvatar');
                if (profileAvatar) {
                    profileAvatar.style.backgroundImage = `url(${reader.result})`;
                    profileAvatar.style.backgroundSize = 'cover';
                    profileAvatar.style.backgroundPosition = 'center';
                    profileAvatar.textContent = '';
                }
                const profileName = document.getElementById('profileName');
                if (profileName) {
                    profileName.textContent = name;
                }
                
                setTimeout(() => {
                    const avatarDiv = document.getElementById('profileAvatar');
                    if (avatarDiv && !avatarDiv.style.backgroundImage) {
                        avatarDiv.style.backgroundImage = `url(${reader.result})`;
                        avatarDiv.style.backgroundSize = 'cover';
                    }
                }, 100);
            }
            
            loadFriendsForDM();
            showToast('Group image updated (Profile updated)', 'success');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}


function toggleChannelSidebarEnhanced() {
    const sidebar = document.getElementById('channelSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar?.classList.toggle('show');
    overlay?.classList.toggle('show');
}


function togglePinCurrentChat() {
    if (!currentChatContext || currentChatContext.type === 'none') {
        showToast('No chat selected', 'warning');
        return;
    }

    const chatId = `${currentChatContext.type}:${currentChatContext.id || currentChatContext.name}`;
    const index = pinnedChats.indexOf(chatId);
    
    if (index > -1) {
        
        pinnedChats.splice(index, 1);
        showToast('Chat unpinned', 'success');
    } else {
        
        pinnedChats.push(chatId);
        showToast('Chat pinned to top', 'success');
    }
    
    localStorage.setItem('pinnedChats', JSON.stringify(pinnedChats));
    updatePinButtonState();
    loadFriendsForDM(); 
}

function updatePinButtonState() {
    const pinBtn = document.getElementById('pinChatBtn');
    if (!pinBtn || !currentChatContext || currentChatContext.type === 'none') return;
    
    const chatId = `${currentChatContext.type}:${currentChatContext.id || currentChatContext.name}`;
    const isPinned = pinnedChats.includes(chatId);
    
    pinBtn.innerHTML = isPinned ? '<i class="fas fa-thumbtack" style="color: var(--primary-color);"></i>' : '<i class="fas fa-thumbtack"></i>';
    pinBtn.title = isPinned ? 'Unpin chat' : 'Pin chat';
}

function isChatPinned(chatType, chatId) {
    const chatKey = `${chatType}:${chatId}`;
    return pinnedChats.includes(chatKey);
}


function showToastClickable(message, type = 'success', chatContext = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type} ${chatContext ? 'clickable' : ''}`;

    const iconMap = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
        <div class="toast-content">
            <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="toast-message">${message}</div>
            ${chatContext ? '<div style="font-size: 11px; margin-top: 4px; color: var(--primary-color);">Click to open</div>' : ''}
        </div>
    `;

    if (chatContext) {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', () => {
            
            if (chatContext.type === 'dm') {
                openDM(chatContext.friendId, chatContext.friendName);
            } else if (chatContext.type === 'community') {
                openRoomChat('community', chatContext.name);
            } else if (chatContext.type === 'group') {
                openRoomChat('group', chatContext.name);
            }
            
            
            toast.remove();
            
          
            if (window.innerWidth <= 480) {
                closeMobileSidebar();
            }
        });
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}



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

    
    let typingTimeout = null;
    const typingInput = document.getElementById('messageInput');
    if (typingInput) {
        typingInput.addEventListener('input', () => {
            if (!chatSettings.showTypingIndicator) return;
            
            
            if (currentChatContext.type === 'community' && currentChatContext.name) {
                socket?.emit('community typing', { community: currentChatContext.name, username: currentUser?.username });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket?.emit('community stop typing', { community: currentChatContext.name, username: currentUser?.username });
                }, 2000);
            } else if ((currentChatContext.type === 'group' || currentChatContext.type === 'room') && currentChatContext.id) {
                socket?.emit('room typing', { roomType: 'group', roomId: currentChatContext.id, roomName: currentChatContext.name, username: currentUser?.username });
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    socket?.emit('room stop typing', { roomType: 'group', roomId: currentChatContext.id, roomName: currentChatContext.name, username: currentUser?.username });
                }, 2000);
            }
        });
    }

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

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.getElementById('pickerPanel')?.classList.remove('show');
        }
    });

    document.addEventListener('click', (event) => {
        const picker = document.getElementById('pickerPanel');
        if (!picker || !picker.classList.contains('show')) return;
        if (picker.contains(event.target)) return;
        if (event.target.closest('[onclick="togglePicker()"]')) return;
        picker.classList.remove('show');
    });

   
    loadAudioSettings();
    loadThemeSettings();
    refreshAudioDevices();
    updateStatsDisplay();

    
    syncBuildVersionBadge();

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


function customAlert(message, title = 'Notice', icon = 'ℹ️') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('customDialog');
        dialog.innerHTML = `
            <div class="custom-dialog">
                <div class="custom-dialog-content">
                    <button class="custom-dialog-close" onclick="closeCustomDialog()" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 5px 10px; line-height: 1;">&times;</button>
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
                    <button class="custom-dialog-close" onclick="resolveCustomDialog(false)" style="position: absolute; top: 10px; right: 10px; background: transparent; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 5px 10px; line-height: 1;">&times;</button>
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
    stopIncomingCallAlert();
    document.getElementById('customDialog').style.display = 'none';
    if (window.customDialogResolve) window.customDialogResolve(true);
}

function resolveCustomDialog(value) {
    stopIncomingCallAlert();
    document.getElementById('customDialog').style.display = 'none';
    if (window.customDialogResolve) window.customDialogResolve(value);
}



function showQRCodeModal() {
    const modal = document.getElementById('qrModal');
    const qrContainer = document.querySelector('.qr-code-container');
    const userIdSpan = document.getElementById('qrUserId');
    
    if (!currentUser || !currentUser.id) {
        showToast('❌ User not logged in', 'error');
        return;
    }
    
   
    qrContainer.innerHTML = '';
    
    
    const qrDiv = document.createElement('div');
    qrDiv.id = 'qrCodeCanvas';
    qrDiv.style.backgroundColor = '#ffffff';
    qrDiv.style.padding = '10px';
    qrDiv.style.borderRadius = '8px';
    qrDiv.style.display = 'inline-block';
    qrContainer.appendChild(qrDiv);
    
    
    userIdSpan.textContent = currentUser.id || currentUser._id || 'Unknown';
    
    
    const friendRequestData = `FRIEND_REQUEST:${currentUser.id || currentUser._id}:${currentUser.username || 'User'}`;
    
   
    if (typeof QRCode !== 'undefined') {
        try {
            new QRCode(qrDiv, {
                text: friendRequestData,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            console.log('✅ QR Code generated successfully');
        } catch (error) {
            console.error('❌ QRCode library error:', error);
            generateQRCodeFallback(qrDiv, friendRequestData);
        }
    } else {
        console.warn('⚠️ QRCode library not loaded, using fallback');
        
        generateQRCodeFallback(qrDiv, friendRequestData);
    }
    
    modal.classList.add('show');
}

function generateQRCodeFallback(container, data) {
    console.log('📱 Using QR Code API fallback');
    
   
    const img = new Image();
    img.style.width = '200px';
    img.style.height = '200px';
    img.style.display = 'block';
    img.style.backgroundColor = '#ffffff';
    img.style.borderRadius = '8px';
    
    img.onload = () => {
        console.log('✅ QR Code loaded from API');
        container.innerHTML = '';
        container.appendChild(img);
    };
    
    img.onerror = () => {
        console.error('❌ QR Code API failed');
        
        container.innerHTML = `
            <div style="width: 200px; height: 200px; background: white; border: 2px solid #000; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 20px; box-sizing: border-box;">
                <div style="font-size: 24px; margin-bottom: 10px;">📱</div>
                <div style="font-weight: bold; color: #000; margin-bottom: 8px;">Friend Request</div>
                <div style="font-size: 12px; color: #666; word-break: break-all; text-align: center;">${currentUser.username || 'User'}</div>
                <div style="font-size: 10px; color: #999; margin-top: 8px;">ID: ${(currentUser.id || currentUser._id || 'N/A').substring(0, 8)}...</div>
            </div>
        `;
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
        
        
        if (qrData.startsWith('FRIEND_REQUEST:')) {
            const parts = qrData.split(':');
            friendId = parts[1];
            friendName = parts[2] || 'User';
        } else {
           
            friendId = qrData.trim();
        }
        
        if (!friendId) {
            showToast('❌ Invalid QR code data', 'error');
            return;
        }
        
        
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



function openVideoCallModal(targetName, targetId, callType) {
    targetName = targetName || currentChatContext.name || 'User';
    targetId = targetId || currentChatContext.id;
    callType = callType || 'Video Call';
    
    const html = `
        <div style="text-align: center; padding: 20px;">
            <div style="width: 120px; height: 120px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 60px; animation: pulse 2s infinite;">
                📞
            </div>
            <h3 style="margin: 15px 0; color: var(--text-primary); font-size: 24px;">${callType}</h3>
            <p style="margin: 10px 0; color: var(--text-secondary); font-size: 16px;">Calling <strong style="color: var(--primary-color);">${targetName}</strong></p>
            <p style="margin: 20px 0; color: var(--text-secondary); font-size: 14px; font-style: italic;">🔊 Ringing...</p>
            <div style="margin-top: 30px; padding: 15px; background: rgba(88, 101, 242, 0.1); border-radius: 8px; border: 1px solid var(--primary-color);">
                <p style="color: var(--text-secondary); font-size: 13px; margin: 0;">💡 <strong>Video Call Ready!</strong></p>
                <p style="color: var(--text-secondary); font-size: 12px; margin: 8px 0 0 0;">Waiting for the other user to accept...</p>
            </div>
            <button onclick="closeCustomDialog();" style="margin-top: 20px; padding: 12px 30px; background: var(--danger); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">
                ❌ End Call
            </button>
        </div>
        <style>
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }
        </style>
    `;
    
    customAlert(html, '📞 Video Call', '📞');
    
   
    if (socket && socket.connected && targetId) {
        socket.emit('start video call', { 
            targetId: targetId, 
            type: currentChatContext.type || 'dm',
            targetName: targetName
        });
        activeCallState = { callId: null, peerId: targetId, direction: 'outgoing' };
        showToast(`📞 Calling ${targetName}...`, 'success');
    }
}

function handleIncomingVideoCall(payload) {
    if (!payload || !payload.callId) return;

    const callerName = payload.fromUsername || 'Unknown User';
    activeCallState = { callId: payload.callId, peerId: payload.fromId, direction: 'incoming' };
    startIncomingCallAlert();

    customConfirm(
        `${callerName} is calling you. Accept this video call?`,
        'Incoming Video Call',
        '📞',
        false
    ).then((accepted) => {
        if (!socket || !socket.connected || !activeCallState) {
            stopIncomingCallAlert();
            return;
        }

        if (accepted) {
            stopIncomingCallAlert();
            socket.emit('accept video call', {
                callId: activeCallState.callId,
                toId: activeCallState.peerId
            });
            startCallSession(callerName, activeCallState.peerId, false).catch((error) => {
                console.error('Failed to initialize incoming call session:', error);
                showToast('Unable to initialize call media devices', 'error');
            });
            
        } else {
            stopIncomingCallAlert();
            socket.emit('reject video call', {
                callId: activeCallState.callId,
                toId: activeCallState.peerId
            });
            showToast(`Missed call from ${callerName}`, 'warning');
            activeCallState = null;
        }
    });
}

async function ensureLocalCallStream() {
    if (localCallStream) return localCallStream;

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const secureContextError = new Error('Camera and microphone require HTTPS on non-localhost devices.');
        showToast('❌ Call media blocked: open app over HTTPS on both devices.', 'error');
        throw secureContextError;
    }

    try {
        const selectedMic = audioSettings?.microphoneId;
        const constraints = {
            audio: {
                deviceId: selectedMic && selectedMic !== 'default' ? { exact: selectedMic } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                facingMode: 'user',
                width: { ideal: 720 },
                height: { ideal: 480 }
            }
        };
        localCallStream = await navigator.mediaDevices.getUserMedia(constraints);
        showToast('📹 Camera and microphone enabled', 'success');
        return localCallStream;
    } catch (error) {
        console.error('Media access error:', error);

        
        try {
            localCallStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            showToast('🎤 Microphone enabled (camera unavailable on this device)', 'warning');
            return localCallStream;
        } catch (fallbackError) {
            showToast(`❌ Cannot access camera/mic: ${fallbackError.message}`, 'error');
            throw fallbackError;
        }
    }
}

function createPeerConnection(peerId) {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ],
        iceCandidatePoolSize: 10
    });

    remoteIceCandidatesQueue = [];
    remoteCallStream = new MediaStream();

    const remoteVideo = document.getElementById('remoteCallVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = remoteCallStream;
        remoteVideo.autoplay = true;
        remoteVideo.playsInline = true;
        remoteVideo.muted = false;
        remoteVideo.volume = 1.0;
    }

    if (localCallStream) {
        localCallStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localCallStream);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
            socket.emit('video signal', {
                toId: peerId,
                callId: activeCallState?.callId,
                signal: { type: 'ice-candidate', candidate: event.candidate }
            });
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('📞 Remote track received:', event.track.kind, event.streams.length);
        const remoteVideo = document.getElementById('remoteCallVideo');
        if (remoteVideo) {
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else if (remoteCallStream) {
                remoteCallStream.addTrack(event.track);
                remoteVideo.srcObject = remoteCallStream;
            }
            
            
            remoteVideo.muted = false;
            remoteVideo.volume = 1.0;
            
            
            if (audioSettings.speakerId && audioSettings.speakerId !== 'default' && typeof remoteVideo.setSinkId === 'function') {
                remoteVideo.setSinkId(audioSettings.speakerId).catch((sinkError) => {
                    console.warn('Could not apply selected speaker for call:', sinkError);
                });
            }
            
            
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✅ Remote video/audio playing successfully');
                    showToast('📞 Connected! Audio should be working now', 'success');
                }).catch((error) => {
                    console.error('Remote video play error:', error);
                    
                    setTimeout(() => {
                        remoteVideo.play().catch(e => console.error('Retry play failed:', e));
                    }, 500);
                });
            }

            event.track.onunmute = () => {
                remoteVideo.play().catch(() => {});
            };
        }
    };

    function showCallWarningThrottled(message) {
        const now = Date.now();
        if (now - lastCallWarningAt < 5000) return;
        lastCallWarningAt = now;
        showToast(message, 'warning');
    }

    peerConnection.onconnectionstatechange = () => {
        console.log('📡 Connection state:', peerConnection.connectionState);
        
       
        if (window.userIntentionallEndedCall) {
            console.log('User ended call intentionally, skipping error messages');
            return;
        }
        if (peerConnection.connectionState === 'connecting') {
            showToast('📞 Connecting call...', 'info');
            
            if (!callTimerInterval) {
                startCallTimer();
            }
        } else if (peerConnection.connectionState === 'disconnected') {
            showCallWarningThrottled('⚠️ Connection unstable, trying to reconnect...');
            attemptIceRecovery(peerId);
        } else if (peerConnection.connectionState === 'connected') {
            showToast('📞 Call connected!', 'success');
           
            if (!callTimerInterval) {
                startCallTimer();
            }
        } else if (peerConnection.connectionState === 'failed') {
            showCallWarningThrottled('⚠️ Network issue detected, retrying call connection...');
            attemptIceRecovery(peerId);
        } else if (peerConnection.connectionState === 'closed') {
            
            cleanupCallSession(false);
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (!peerConnection) return;
        console.log('ICE connection state:', peerConnection.iceConnectionState);

        if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
            attemptIceRecovery(peerId);
        }
    };

    async function attemptIceRecovery(recoveryPeerId) {
        if (!peerConnection || !socket || !socket.connected) return;

        const now = Date.now();
        if (now - lastIceRecoveryAttemptAt < 4000) return;
        lastIceRecoveryAttemptAt = now;

        try {
            peerConnection.restartIce?.();

            if (peerConnection.signalingState === 'stable') {
                const recoveryOffer = await peerConnection.createOffer({
                    iceRestart: true,
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(recoveryOffer);

                socket.emit('video signal', {
                    toId: recoveryPeerId,
                    callId: activeCallState?.callId,
                    signal: { type: 'offer', offer: recoveryOffer }
                });
            }
        } catch (recoveryError) {
            console.warn('ICE recovery attempt failed:', recoveryError);
        }
    }
}

function openCallDialog(peerName) {
    const isMobile = window.innerWidth <= 768;
    const html = `
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: ${isMobile ? '100%' : '400px'}; ${isMobile ? 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; max-width: 100vw; background: #000; border-radius: 0;' : ''} ">
            <h3 style="margin: 0; text-align: center; color: var(--text-primary); font-size: ${isMobile ? '14px' : '16px'}; ${isMobile ? 'position: absolute; top: 10px; left: 10px; right: 10px; z-index: 10;' : ''}">📞 Video Call with ${peerName}</h3>
            <div style="text-align: center; font-size: ${isMobile ? '12px' : '14px'}; color: var(--success); font-weight: 700; letter-spacing: 0.5px; ${isMobile ? 'position: absolute; top: 40px; left: 10px; right: 10px; z-index: 10;' : ''}">Call time: <span id="callTimerLabel">00:00:00</span></div>
            <div style="display: grid; gap: ${isMobile ? '0' : '8px'}; grid-template-columns: 1fr; ${isMobile ? 'flex: 1; position: relative; width: 100%; height: 100%;' : ''}">
                <video id="remoteCallVideo" autoplay playsinline style="width: 100%; ${isMobile ? 'height: 100%; position: absolute; top: 0; left: 0;' : 'height: 240px;'} border-radius: ${isMobile ? '0' : '10px'}; background: #000; object-fit: cover;"></video>
                <video id="localCallVideo" autoplay muted playsinline style="width: ${isMobile ? '100px' : '100%'}; ${isMobile ? 'height: 120px; position: absolute; bottom: 80px; right: 10px; z-index: 5; border: 2px solid white;' : 'height: 140px;'} border-radius: ${isMobile ? '8px' : '10px'}; background: #000; object-fit: cover;"></video>
            </div>
            <div style="display: flex; justify-content: center; gap: 12px; ${isMobile ? 'position: absolute; bottom: 20px; left: 10px; right: 10px; z-index: 10;' : ''}">
                <button onclick="endVideoCall()" style="padding: 10px 20px; background: var(--danger); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; flex: 1;">🔴 End Call</button>
                <button onclick="toggleLocalMute()" style="padding: 10px 20px; background: var(--secondary); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px; flex: 1;" id="muteBtn">🔇 Mute</button>
            </div>
        </div>
    `;

    customAlert(html, isMobile ? '' : 'Live Video Call', '📹');
}

async function startCallSession(peerName, peerId, isCaller) {
    if (peerConnection && currentCallPeerId && String(currentCallPeerId) === String(peerId)) {
        return;
    }

    currentCallPeerId = peerId;
    currentCallPeerName = peerName;

    openCallDialog(peerName);
    await ensureLocalCallStream();

    const localVideo = document.getElementById('localCallVideo');
    if (localVideo) {
        localVideo.srcObject = localCallStream;
        localVideo.play().catch(() => {});
    }

    createPeerConnection(peerId);

    if (isCaller && peerConnection) {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('video signal', {
            toId: peerId,
            callId: activeCallState?.callId,
            signal: { type: 'offer', offer }
        });
    }
}

function endVideoCall() {
    
    window.userIntentionallEndedCall = true;
    
    
    if (socket && socket.connected && currentCallPeerId) {
        socket.emit('end video call', {
            callId: activeCallState?.callId,
            toId: currentCallPeerId
        });
    }

    cleanupCallSession(false);
}

function toggleLocalMute() {
    if (!localCallStream) return;
    
    const audioTracks = localCallStream.getAudioTracks();
    const currentlyEnabled = audioTracks.some(track => track.enabled);
    
    audioTracks.forEach(track => {
        track.enabled = !currentlyEnabled;
    });
    
    const btn = document.getElementById('muteBtn');
    if (btn) {
        const nowMuted = currentlyEnabled;
        btn.textContent = nowMuted ? '🎤 Unmute' : '🔇 Mute';
        btn.style.background = nowMuted ? 'var(--danger)' : 'var(--secondary)';
    }
    
    showToast(currentlyEnabled ? '🔇 Microphone muted' : '🎤 Microphone on', 'info');
}

function cleanupCallSession(keepDialogOpen = false) {
    
    window.userIntentionallEndedCall = false;
    
    
    stopIncomingCallAlert();
    stopCallTimer();

    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.close();
        peerConnection = null;
    }

    remoteIceCandidatesQueue = [];
    remoteCallStream = null;
    lastIceRecoveryAttemptAt = 0;
    lastCallWarningAt = 0;

    if (localCallStream) {
        localCallStream.getTracks().forEach((track) => track.stop());
        localCallStream = null;
    }

    currentCallPeerId = null;
    currentCallPeerName = null;
    activeCallState = null;

    if (!keepDialogOpen) {
        closeCustomDialog();
    }
}

function visitUserProfile(userId, userName = 'User') {
    
    if (!userId || userId === 'undefined') {
        showToast('❌ Invalid user ID', 'error');
        return;
    }

    
    const html = `
        <div style="text-align: center; padding: 20px 0;">
            <div style="width: 100px; height: 100px; background: linear-gradient(135deg, var(--primary-color), #4752c4); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">
                ${userName.charAt(0).toUpperCase()}
            </div>
            <h3 style="margin: 10px 0; color: var(--text-primary);">${userName}</h3>
            <p style="margin: 5px 0; color: var(--text-secondary); font-size: 13px;">Status: <span style="color: var(--success);">●</span> Online</p>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="(function() { 
                    currentChatContext = { id: '${userId}', name: '${userName}', type: 'dm' }; 
                    openDM('${userId}', '${userName}');
                    closeCustomDialog();
                })()" style="padding: 10px 20px; background: var(--success); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    💬 Send Message
                </button>
                <button onclick="(function() { 
                    currentChatContext = { id: '${userId}', name: '${userName}', type: 'dm' }; 
                    closeCustomDialog();
                    setTimeout(() => startVideoCall(), 200);
                })()" style="padding: 10px 20px; background: var(--primary-color); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
                    📞 Video Call
                </button>
                <button onclick="(function() { 
                    sendFriendRequest('${userId}', '${userName}');
                })()" style="padding: 10px 20px; background: #8e44ad; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
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
    const sections = [];
    sections.push(`<div style="font-size:13px; color: var(--text-secondary); margin-bottom: 12px;">Archived chats: <strong>${archivedChats.length}</strong> | Archived single messages: <strong>${archivedMessages.length}</strong></div>`);

    if (archivedChats.length > 0) {
        sections.push('<div style="font-weight:700; margin-bottom:6px;">Chats</div>');
        sections.push(archivedChats.map((chat) => `
            <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; cursor:pointer;" onclick="openArchivedChat('${chat.type}', '${chat.id}', '${String(chat.name).replace(/'/g, "\\'")}'); closeCustomDialog();">
                <strong>${chat.name}</strong> <span style="color:var(--text-secondary); font-size:12px;">(${chat.type})</span>
            </div>
        `).join(''));
    }

    if (archivedMessages.length > 0) {
        sections.push('<div style="font-weight:700; margin: 10px 0 6px;">Single Messages</div>');
        sections.push(archivedMessages.slice().reverse().slice(0, 50).map((m) => `
            <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px;">
                <div style="font-size:12px; color:var(--text-secondary);">${new Date(m.timestamp).toLocaleString()}</div>
                <div>${m.text || '[Media message]'}</div>
            </div>
        `).join(''));
    }

    if (archivedChats.length === 0 && archivedMessages.length === 0) {
        sections.push('<div style="color: var(--text-secondary);">No archived content yet.</div>');
    }

    customAlert(sections.join(''), '📦 Archived Messages', '📦');
}

async function clearCurrentChatHistory() {
    if (!currentChatContext || currentChatContext.type === 'none') {
        showToast('Open a chat first', 'warning');
        return;
    }

    const confirmed = await customConfirm(
        'This will permanently clear all messages in the current chat for your account.',
        'Clear Chat History',
        '🧹',
        true
    );

    if (!confirmed) return;

    try {
        if (currentChatContext.type === 'dm') {
            const response = await fetch(`${API_BASE}/dms/${currentChatContext.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showToast(data.error || 'Failed to clear chat history', 'error');
                return;
            }
        } else {
            socket?.emit('clear room chat', {
                roomType: currentChatContext.type,
                roomName: currentChatContext.name
            });
            const roomKey = `${currentChatContext.type}:${currentChatContext.name}`;
            roomMessages[roomKey] = [];
            saveRoomMessages();
        }

        document.getElementById('messages-container').innerHTML = '';
        refreshChatScrollbar();
        showToast('Chat history cleared', 'success');
    } catch (error) {
        console.error(error);
        showToast('Failed to clear chat history', 'error');
    }
}

async function rejectFriendRequest(requestId) {
    try {
        const response = await fetch(`${API_BASE}/friends/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ requestId })
        });

        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to decline friend request', 'error');
            return;
        }

        showToast('Friend request declined', 'warning');
        loadFriends();
    } catch (error) {
        console.error(error);
        showToast('Could not decline friend request', 'error');
    }
}


















