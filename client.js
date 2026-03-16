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
let remoteCallPlaybackRetryBound = false;
let remoteCallPlaybackStarted = false;
let isStartingCallSession = false;
let pendingSignalOffer = null;
let makingOffer = false;
let rtcRuntimeConfig = null;
let rtcConfigLoaded = false;
let activeIceServers = [];
let callIceFailureCount = 0;
let forceRelayOnly = false;
let pendingIceRecoveryTimer = null;
let pendingRelayFallbackTimer = null;
let pendingRemoteIceCandidates = [];
let callEventLog = [];
let currentCallProvider = 'webrtc';
let currentJitsiApi = null;
let currentCallRoomName = null;
let hasUserInteractedWithPage = false;
let activeRoomSubscription = null;
let roomMessages = JSON.parse(localStorage.getItem('roomMessages') || '{}');
let pinnedChats = [];
let joinedCommunities = [];
let joinedGroups = [];
let groupMemberRoles = JSON.parse(localStorage.getItem('groupMemberRoles') || '{}');
let cachedShopItemsById = {};
let equippedShopItems = JSON.parse(localStorage.getItem('equippedShopItems') || '{}');
let communityProfiles = JSON.parse(localStorage.getItem('communityProfiles') || '{}');
let groupProfiles = JSON.parse(localStorage.getItem('groupProfiles') || '{}');
let selectedOrbEffect = localStorage.getItem('selectedOrbEffect') || 'none';
let isCallCameraOff = false;
let notifList = JSON.parse(localStorage.getItem('notifList') || '[]');
let notifUnreadCount = 0;
let globalOnlineUsers = [];
let currentRoomMembers = [];
let roomRoleCache = JSON.parse(localStorage.getItem('roomRoleCache') || '{}');
let roomProfileCache = JSON.parse(localStorage.getItem('roomProfileCache') || '{}');
const ROOM_CACHE_MAX_PER_ROOM = 40;
const ROOM_CACHE_MEDIA_URL_MAX_CHARS = 1400;
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

function getDefaultIceServers() {
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ];
}

function hasTurnServerConfigured(iceServers = []) {
    return iceServers.some((server) => {
        const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
        return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
    });
}

async function ensureRtcConfigLoaded() {
    if (rtcConfigLoaded) return;
    rtcConfigLoaded = true;
    try {
        const response = await fetch(`${API_BASE}/rtc-config`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
            rtcRuntimeConfig = {
                iceServers: data.iceServers,
                iceTransportPolicy: data.iceTransportPolicy === 'relay' ? 'relay' : 'all'
            };
        }
    } catch (rtcConfigError) {
        console.warn('RTC config fetch failed, using defaults:', rtcConfigError);
    }
}

function normalizeRoomKeyClient(roomType, roomName) {
    return `${String(roomType || '').trim().toLowerCase()}:${String(roomName || '').trim().toLowerCase()}`;
}

function getRoomCacheKey(roomType, roomName) {
    return normalizeRoomKeyClient(roomType, roomName);
}

function getMyRoomRole(roomType, roomName) {
    const key = getRoomCacheKey(roomType, roomName);
    const roleMap = roomRoleCache[key] || {};
    const myId = String(currentUser?.id || '');
    const cachedRole = roleMap[myId];
    if (cachedRole) return cachedRole;

    if (roomType === 'group') {
        const localRole = groupMemberRoles?.[roomName]?.[myId];
        if (localRole) return localRole;
        if (joinedGroups.includes(roomName)) return 'Owner';
    }

    return 'Member';
}

function canManageRoomAppearance(roomType, roomName) {
    if (roomType === 'group' && joinedGroups.includes(roomName)) {
        return true;
    }

    const role = getMyRoomRole(roomType, roomName);
    if (roomType === 'group') {
        const localRole = groupMemberRoles?.[roomName]?.[String(currentUser?.id || '')] || 'Member';
        if (localRole === 'Owner' || localRole === 'Admin') {
            return true;
        }
    }
    if (roomType === 'community') {
        const profile = communityProfiles[roomName];
        const localRole = Array.isArray(profile?.members)
            ? (profile.members.find((m) => String(m.id) === String(currentUser?.id))?.role || 'member')
            : 'member';
        if (localRole === 'leader' || localRole === 'vice_leader') {
            return true;
        }
    }
    return role === 'Owner' || role === 'Admin';
}

function cacheRoomProfile(roomType, roomName, profilePatch = {}) {
    const key = getRoomCacheKey(roomType, roomName);
    const prev = roomProfileCache[key] || {};
    roomProfileCache[key] = {
        ...prev,
        ...profilePatch,
        roomType,
        roomName
    };
    localStorage.setItem('roomProfileCache', JSON.stringify(roomProfileCache));
}

function emitRoomProfileUpdate(roomType, roomName, profilePatch) {
    if (!socket || !socket.connected) {
        showToast('Not connected to sync room update', 'warning');
        return;
    }
    socket.emit('update room profile', {
        roomType,
        roomName,
        profilePatch
    });
}

['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
        hasUserInteractedWithPage = true;
    }, { passive: true });
});

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

    if (navigator.vibrate && hasUserInteractedWithPage) {
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

    if (navigator.vibrate && hasUserInteractedWithPage) {
        try {
            navigator.vibrate(0);
        } catch (error) {
            // Ignore browser intervention when user has not interacted yet.
        }
    }
}

function formatMessageTimestamp(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    return date.toLocaleString([], {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function ensureRemoteMediaPlayback(videoEl) {
    if (!videoEl) return;

    const tryPlay = () => {
        const playPromise = videoEl.play();
        if (!playPromise || typeof playPromise.then !== 'function') return;

        playPromise.then(() => {
            if (!remoteCallPlaybackStarted) {
                remoteCallPlaybackStarted = true;
                showToast('📞 Connected! Audio and video are live.', 'success');
            }
        }).catch((error) => {
            if (error?.name === 'AbortError') {
                setTimeout(() => {
                    if (videoEl.srcObject) {
                        videoEl.play().catch(() => {});
                    }
                }, 120);
                return;
            }

            console.warn('Remote media autoplay blocked, waiting for user gesture:', error);
            showToast('Tap once to enable call audio', 'warning');

            if (!remoteCallPlaybackRetryBound) {
                remoteCallPlaybackRetryBound = true;
                const retryPlayback = () => {
                    videoEl.play().catch((retryErr) => {
                        console.warn('Retry playback failed:', retryErr);
                    });
                    document.removeEventListener('click', retryPlayback);
                    document.removeEventListener('touchstart', retryPlayback);
                    document.removeEventListener('pointerdown', retryPlayback);
                    remoteCallPlaybackRetryBound = false;
                };
                document.addEventListener('click', retryPlayback, { once: true });
                document.addEventListener('touchstart', retryPlayback, { once: true, passive: true });
                document.addEventListener('pointerdown', retryPlayback, { once: true });
            }
        });
    };

    tryPlay();
    // Extra retry loop for slow mobile media pipelines.
    setTimeout(tryPlay, 250);
    setTimeout(tryPlay, 900);
}

function ensureLocalPreviewPlayback(videoEl) {
    if (!videoEl || !videoEl.srcObject) return;

    videoEl.muted = true;
    videoEl.autoplay = true;
    videoEl.playsInline = true;

    const tryPlay = () => {
        videoEl.play().catch(() => {});
    };

    tryPlay();
    setTimeout(tryPlay, 120);
    setTimeout(tryPlay, 500);
}

function appendCallLog(message) {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    callEventLog.push(entry);
    if (callEventLog.length > 20) {
        callEventLog = callEventLog.slice(-20);
    }
    refreshCallDebug();
}

function setCallStatus(statusText) {
    const statusLabel = document.getElementById('callStatusLabel');
    if (statusLabel) {
        statusLabel.textContent = statusText || '';
    }
}

function ensureJitsiApiLoaded() {
    if (typeof window.JitsiMeetExternalAPI === 'function') {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-jitsi-external-api="true"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Failed to load hosted call API')), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.async = true;
        script.dataset.jitsiExternalApi = 'true';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load hosted call API'));
        document.head.appendChild(script);
    });
}

function setHostedCallVisible(isVisible) {
    const host = document.getElementById('hostedCallContainer');
    const remoteVideo = document.getElementById('remoteCallVideo');
    const localVideo = document.getElementById('localCallVideo');
    if (host) host.style.display = isVisible ? 'block' : 'none';
    if (remoteVideo) remoteVideo.style.display = isVisible ? 'none' : 'block';
    if (localVideo) localVideo.style.display = isVisible ? 'none' : 'block';
}

async function startHostedCallRoom(peerName, roomName) {
    if (!roomName) {
        throw new Error('Missing hosted room name');
    }

    openCallDialog(peerName);
    setCallStatus('Joining hosted call...');
    appendCallLog(`Joining hosted room ${roomName}`);

    await ensureJitsiApiLoaded();

    const host = document.getElementById('hostedCallContainer');
    if (!host) {
        throw new Error('Hosted call container not found');
    }

    if (currentJitsiApi) {
        currentJitsiApi.dispose();
        currentJitsiApi = null;
    }

    host.innerHTML = '';
    setHostedCallVisible(true);
    currentCallProvider = 'hosted';
    currentCallRoomName = roomName;

    currentJitsiApi = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName,
        parentNode: host,
        width: '100%',
        height: '100%',
        userInfo: {
            displayName: currentUser?.username || 'User'
        },
        configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true
        },
        interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false
        }
    });

    currentJitsiApi.addListener('videoConferenceJoined', () => {
        setCallStatus('Connected');
        appendCallLog('Hosted room joined');
        if (!callTimerInterval) {
            startCallTimer();
        }
    });
    currentJitsiApi.addListener('participantJoined', (payload) => {
        appendCallLog(`Participant joined: ${payload?.displayName || payload?.id || 'remote user'}`);
    });
    currentJitsiApi.addListener('participantLeft', (payload) => {
        appendCallLog(`Participant left: ${payload?.id || 'remote user'}`);
    });
    currentJitsiApi.addListener('audioMuteStatusChanged', ({ muted }) => {
        const btn = document.getElementById('muteBtn');
        if (btn) {
            btn.textContent = muted ? '🔇' : '🎤';
            btn.classList.toggle('muted', !!muted);
        }
    });
    currentJitsiApi.addListener('videoMuteStatusChanged', ({ muted }) => {
        const btn = document.getElementById('cameraBtn');
        if (btn) {
            btn.textContent = muted ? '🚫' : '📷';
            btn.classList.toggle('cam-off', !!muted);
        }
    });
    currentJitsiApi.addListener('readyToClose', () => {
        appendCallLog('Hosted room requested close');
        cleanupCallSession(false);
    });
    currentJitsiApi.addListener('videoConferenceLeft', () => {
        appendCallLog('Hosted room left');
        cleanupCallSession(false);
    });
}

let callControlBindingsDone = false;
function bindCallControlButtons() {
    if (callControlBindingsDone) return;

    const bindings = [
        ['muteBtn', toggleLocalMute],
        ['cameraBtn', toggleCallCamera],
        ['endCallBtn', endVideoCall],
        ['callDebugBtn', toggleCallDebug]
    ];

    bindings.forEach(([id, action]) => {
        const button = document.getElementById(id);
        if (!button) return;

        const handlePress = (event) => {
            event.preventDefault();
            action();
        };

        button.addEventListener('click', handlePress);
        button.addEventListener('touchend', handlePress, { passive: false });
        button.style.pointerEvents = 'auto';
    });

    callControlBindingsDone = true;
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
    setAuthFeedback('');
}

function toggleForgotPasswordPanel() {
    const panel = document.getElementById('resetPasswordPanel');
    if (!panel) return;
    panel.classList.toggle('show');
}

function setAuthFeedback(message, type = 'info') {
    const statusEl = document.getElementById('authStatus');
    if (!statusEl) return;
    const colors = {
        info: 'var(--text-secondary)',
        success: 'var(--success)',
        warning: '#f6c945',
        error: 'var(--danger)'
    };
    statusEl.textContent = message || '';
    statusEl.style.color = colors[type] || colors.info;
}

async function resetForgottenPassword() {
    const email = document.getElementById('resetEmail')?.value.trim();
    const newPassword = document.getElementById('resetNewPassword')?.value.trim();

    if (!email || !newPassword) {
        showToast('Enter your email and new password', 'warning');
        setAuthFeedback('Enter your email and new password', 'warning');
        return;
    }

    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'warning');
        setAuthFeedback('New password must be at least 6 characters', 'warning');
        return;
    }

    try {
        setAuthFeedback('Resetting password...', 'info');
        const response = await fetch(`${API_BASE}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, newPassword })
        });

        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to reset password', 'error');
            setAuthFeedback(data.error || 'Failed to reset password', 'error');
            return;
        }

        showToast('Password reset successful. You can now login.', 'success');
        document.getElementById('resetPasswordPanel')?.classList.remove('show');
        document.getElementById('resetEmail').value = email;
        document.getElementById('resetNewPassword').value = '';
        if (isRegistering) {
            toggleAuthMode();
        }
        if (document.getElementById('email')) {
            document.getElementById('email').value = email;
        }
        if (document.getElementById('password')) {
            document.getElementById('password').value = newPassword;
            document.getElementById('password').focus();
        }
        setAuthFeedback('Password reset successful. Use the pre-filled email/password and tap Login.', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error resetting password', 'error');
        setAuthFeedback('Error resetting password. Please try again.', 'error');
    }
}

async function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const username = document.getElementById('username').value.trim();
    const authButton = document.getElementById('authButton');

    if (!email || !password) {
        showToast('Please fill in all fields', 'warning');
        setAuthFeedback('Please fill in all fields', 'warning');
        return;
    }

    try {
        if (authButton) {
            authButton.disabled = true;
            authButton.style.opacity = '0.7';
        }
        setAuthFeedback(isRegistering ? 'Creating account...' : 'Logging in...', 'info');
        let response;
        if (isRegistering) {
            if (!username) {
                showToast('Username is required', 'warning');
                setAuthFeedback('Username is required', 'warning');
                if (authButton) {
                    authButton.disabled = false;
                    authButton.style.opacity = '1';
                }
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

        let data = {};
        try {
            data = await response.json();
        } catch (parseError) {
            data = { error: 'Server returned invalid response' };
        }
        if (!response.ok) {
            showToast(data.error || 'Authentication failed', 'error');
            setAuthFeedback(data.error || 'Authentication failed', 'error');
            return;
        }

        currentToken = data.token;
        currentUser = data.user;
        localStorage.setItem('token', currentToken);
        localStorage.setItem('user', JSON.stringify(currentUser));
        saveAccountSession();
        const authSuccessMsg = isRegistering ? 'Registration successful. You are now logged in.' : 'Login successful. Welcome back.';
        setAuthFeedback(authSuccessMsg, 'success');
        showToast(authSuccessMsg, 'success');

        showMainApp();
        connectSocket();
    } catch (error) {
        console.error(error);
        showToast('Error: ' + error.message, 'error');
        setAuthFeedback(`Error: ${error.message}`, 'error');
    } finally {
        if (authButton) {
            authButton.disabled = false;
            authButton.style.opacity = '1';
        }
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
    // Reuse existing active socket to avoid duplicating/disrupting signaling during calls.
    if (socket && (socket.connected || socket.active)) {
        return;
    }

    // Cleanup stale socket before creating a new one.
    if (socket) {
        try {
            socket.removeAllListeners();
            socket.disconnect();
        } catch (socketCleanupError) {
            console.warn('Previous socket cleanup failed:', socketCleanupError);
        }
    }

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
        globalOnlineUsers = Array.isArray(users) ? users : [];
        if (currentChatContext?.type === 'group' || currentChatContext?.type === 'community') {
            const byId = new Map();
            (currentRoomMembers || []).forEach((m) => {
                const uid = String(m?.id || m?.userId || '');
                if (!uid) return;
                byId.set(uid, { ...m });
            });

            (globalOnlineUsers || []).forEach((u) => {
                const uid = String(u?.userId || u?.id || u?._id || '');
                if (!uid || byId.has(uid)) return;
                byId.set(uid, {
                    id: uid,
                    username: u?.username || 'User',
                    avatar: u?.avatar || null,
                    role: 'Online'
                });
            });

            renderMembersSidebarFromRoom(Array.from(byId.values()));
        } else {
            updateMembersList(globalOnlineUsers);
        }
    });

    socket.on('room members update', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        const members = Array.isArray(payload?.members) ? payload.members : [];
        const roomKey = getRoomCacheKey(roomType, roomName);
        const nextRoles = {};
        members.forEach((m) => {
            const uid = String(m.id || m.userId || '');
            if (uid) nextRoles[uid] = m.role || 'Member';
        });
        roomRoleCache[roomKey] = nextRoles;
        localStorage.setItem('roomRoleCache', JSON.stringify(roomRoleCache));

        if (roomType === 'group' && roomName) {
            groupMemberRoles[roomName] = nextRoles;
            localStorage.setItem('groupMemberRoles', JSON.stringify(groupMemberRoles));
        }

        const expectedKey = normalizeRoomKeyClient(currentChatContext?.type, currentChatContext?.name);
        const incomingKey = normalizeRoomKeyClient(roomType, roomName);
        if (expectedKey !== incomingKey) return;

        currentRoomMembers = members;
        renderMembersSidebarFromRoom(currentRoomMembers);
    });

    socket.on('room profile updated', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        const previousRoomName = payload?.previousRoomName || roomName;
        const profile = payload?.profile || {};
        if (!roomType || !roomName) return;

        cacheRoomProfile(roomType, roomName, profile);

        if (roomType === 'group') {
            const previousProfile = groupProfiles[previousRoomName] || groupProfiles[roomName] || {};
            const merged = {
                ...previousProfile,
                ...profile,
                name: profile?.name || roomName
            };
            if (previousRoomName !== roomName) {
                delete groupProfiles[previousRoomName];
                delete groupMemberRoles[previousRoomName];
            }
            groupProfiles[roomName] = merged;
            localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));

            const index = joinedGroups.findIndex((g) => String(g) === String(previousRoomName));
            if (index >= 0) {
                joinedGroups[index] = roomName;
                localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
            }
        }

        if (roomType === 'community') {
            const previousProfile = communityProfiles[previousRoomName] || communityProfiles[roomName] || {};
            const merged = {
                ...previousProfile,
                ...profile,
                name: profile?.name || roomName
            };
            if (previousRoomName !== roomName) {
                delete communityProfiles[previousRoomName];
            }
            communityProfiles[roomName] = merged;
            localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));

            const index = joinedCommunities.findIndex((g) => String(g) === String(previousRoomName));
            if (index >= 0) {
                joinedCommunities[index] = roomName;
                localStorage.setItem('joinedCommunities', JSON.stringify(joinedCommunities));
            }
        }

        if (currentChatContext?.type === roomType && String(currentChatContext?.name) === String(previousRoomName)) {
            const isRenameEvent = String(previousRoomName) !== String(roomName);
            currentChatContext.name = roomName;
            currentChatContext.id = roomName;

            if (isRenameEvent) {
                const oldKey = normalizeRoomKeyClient(roomType, previousRoomName);
                const nextKey = normalizeRoomKeyClient(roomType, roomName);
                if (roomMessages[oldKey] && !roomMessages[nextKey]) {
                    roomMessages[nextKey] = roomMessages[oldKey];
                    delete roomMessages[oldKey];
                    saveRoomMessages();
                }

                if (roomType === 'group') openGroupChat(roomName);
                if (roomType === 'community') openCommunityChat(roomName);
            } else {
                const titleEl = document.getElementById('chatTitle');
                if (titleEl) {
                    const profile = roomType === 'group' ? getGroupProfile(roomName) : getCommunityProfile(roomName);
                    titleEl.textContent = roomType === 'group'
                        ? `${profile.icon || '👥'} Group: ${roomName}`
                        : `${profile.icon || '🌐'} Community: ${roomName}`;
                }
            }
        }

        if (roomType === 'group' || roomType === 'community') {
            const expectedKey = normalizeRoomKeyClient(currentChatContext?.type, currentChatContext?.name);
            const incomingKey = normalizeRoomKeyClient(roomType, roomName);
            if (expectedKey === incomingKey) {
                renderMembersSidebarFromRoom(currentRoomMembers || []);
            }
        }

        loadFriendsForDM();
    });

    socket.on('room chat history', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        const roomKey = normalizeRoomKeyClient(roomType, roomName);
        roomMessages[roomKey] = Array.isArray(payload?.messages) ? payload.messages : [];
        saveRoomMessages();

        const isCurrentRoom = normalizeRoomKeyClient(currentChatContext?.type, currentChatContext?.name) === normalizeRoomKeyClient(roomType, roomName);
        if (isCurrentRoom) {
            renderRoomMessages(roomKey, roomName, roomType);
        }
    });

    socket.on('room message', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        if (!roomType || !roomName) return;

        const roomKey = normalizeRoomKeyClient(roomType, roomName);
        if (!roomMessages[roomKey]) {
            roomMessages[roomKey] = [];
        }
        const msgId = payload?.messageId || payload?.id;
        const exists = msgId ? roomMessages[roomKey].some((m) => String(m?.messageId || m?.id) === String(msgId)) : false;
        if (!exists) {
            roomMessages[roomKey].push(payload);
        }
        saveRoomMessages();

        const isCurrentRoom = normalizeRoomKeyClient(currentChatContext?.type, currentChatContext?.name) === normalizeRoomKeyClient(roomType, roomName);
        if (isCurrentRoom) {
            const alreadyRendered = payload?.messageId
                ? !!document.querySelector(`.message[data-message-id="${String(payload.messageId)}"]`)
                : false;
            if (!alreadyRendered) {
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
            pushNotification(`${roomLabel === 'Community' ? '🌐' : '👥'} ${roomName}`, `${payload.fromUsername}: ${messagePreview}`, { type: roomType, name: roomName });
        }
    });

    socket.on('room chat cleared', (payload) => {
        const roomType = payload?.roomType;
        const roomName = payload?.roomName;
        if (!roomType || !roomName) return;

        const roomKey = normalizeRoomKeyClient(roomType, roomName);
        roomMessages[roomKey] = [];
        saveRoomMessages();

        const isCurrentRoom = normalizeRoomKeyClient(currentChatContext?.type, currentChatContext?.name) === normalizeRoomKeyClient(roomType, roomName);
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
            pushNotification(`💬 ${data.fromUsername}`, messagePreview, { type: 'dm', friendId: otherUserId, friendName: data.fromUsername });
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
        const roomName = activeCallState?.callId || payload?.callId;
        if (roomName) {
            closeCustomDialog();
            startHostedCallRoom(byName, `firetech-${roomName}`).catch((error) => {
                console.error('Failed to start hosted call session:', error);
                showToast('Unable to join hosted call', 'error');
                cleanupCallSession(false);
            });
        }
    });

    socket.on('video call rejected', (payload) => {
        const byName = payload?.byUsername || 'User';
        stopIncomingCallAlert();
        showToast(`${byName} declined the call`, 'warning');
        activeCallState = null;
        closeCustomDialog();
        // Close overlay if open (waiting screen)
        document.getElementById('callOverlay')?.classList.remove('active');
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
                const isPolitePeer = String(currentUser?.id || '') > String(fromId || '');
                const hasPeer = !!peerConnection;
                const offerCollision = hasPeer && (makingOffer || peerConnection.signalingState !== 'stable');

                if (offerCollision) {
                    if (!isPolitePeer) {
                        console.warn('Ignoring offer collision (impolite peer)');
                        return;
                    }

                    // Polite peer: rollback local offer so remote offer can be accepted.
                    if (peerConnection.signalingState === 'have-local-offer') {
                        await peerConnection.setLocalDescription({ type: 'rollback' });
                    }
                }

                if (!activeCallState) {
                    activeCallState = { callId: payload?.callId || null, peerId: fromId, direction: 'incoming' };
                }
                if (isStartingCallSession) {
                    // Session setup in progress; save offer to process after setup completes
                    pendingSignalOffer = { fromId, offer: signal.offer };
                    return;
                }
                if (!peerConnection) {
                    await startCallSession(fromName, fromId, false);
                }
                if (!peerConnection) return;
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
                // Only apply answer when we actually sent an offer - prevents 'wrong state: stable' crash
                if (peerConnection.signalingState !== 'have-local-offer') {
                    console.warn('Ignoring stale answer, signaling state:', peerConnection.signalingState);
                } else {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.answer));
                    await flushQueuedIceCandidates();
                }
            }

            if (signal.type === 'ice-candidate' && signal.candidate) {
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

    currentRoomMembers = [];
    if (globalOnlineUsers.length > 0) {
        updateMembersList(globalOnlineUsers);
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
    panel.style.overflowY = 'auto';
    panel.style.webkitOverflowScrolling = 'touch';
    panel.style.height = '100dvh';
    panel.style.maxHeight = '100dvh';
    panel.style.touchAction = 'pan-y';
    panel.classList.add('show');
    panel.scrollTop = 0;
    const backdrop = document.getElementById('profileBackdrop');
    if (backdrop) backdrop.style.display = 'block';
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

// ==================== PROFILE BANNER ====================
const BANNER_PRESETS = [
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80', // night sky
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80', // abstract geo
    'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=800&q=80', // purple wave
    'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=800&q=80', // aurora
    '#gradient:135,#667eea,#764ba2',
    '#gradient:135,#f093fb,#f5576c',
    '#gradient:135,#4facfe,#00f2fe',
    '#gradient:135,#43e97b,#38f9d7',
];

function openBannerPicker() {
    const presetsHtml = BANNER_PRESETS.map((p, i) => {
        const isGradient = p.startsWith('#gradient:');
        const style = isGradient
            ? (() => { const parts = p.replace('#gradient:','').split(','); return `background: linear-gradient(${parts[0]}deg, ${parts[1]}, ${parts[2]})`; })()
            : `background-image: url('${p}'); background-size: cover; background-position: center;`;
        return `<div onclick="applyBannerPreset('${p}')" style="width:100%; height:60px; border-radius:8px; cursor:pointer; border:2px solid transparent; transition:border 0.15s; ${style}" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='transparent'"></div>`;
    }).join('');

    const html = `
        <div>
            <p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px;">Choose a preset or upload your own image.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">${presetsHtml}</div>
            <button class="save-btn" onclick="document.getElementById('bannerFileInput').click()" style="width:100%; margin-bottom:8px;">📁 Upload Custom Banner</button>
            <input type="file" id="bannerFileInput" accept="image/*" style="display:none;" onchange="handleBannerUpload(event)">
            <button class="secondary-btn" onclick="clearBanner(); closeCustomDialog();" style="width:100%;">🗑 Remove Banner</button>
        </div>
    `;
    customAlert(html, '🖼 Profile Banner', '🖼');
}

function applyBannerPreset(preset) {
    const wrap = document.getElementById('profileBannerWrap');
    const img = document.getElementById('profileBannerImg');
    if (!wrap) return;
    if (preset.startsWith('#gradient:')) {
        const parts = preset.replace('#gradient:', '').split(',');
        wrap.style.background = `linear-gradient(${parts[0]}deg, ${parts[1]}, ${parts[2]})`;
        img.style.display = 'none';
    } else {
        img.src = preset;
        img.style.display = 'block';
        wrap.style.background = '';
    }
    localStorage.setItem('profileBanner', preset);
    closeCustomDialog();
}

function handleBannerUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        applyBannerPreset(e.target.result);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function clearBanner() {
    const wrap = document.getElementById('profileBannerWrap');
    const img = document.getElementById('profileBannerImg');
    if (wrap) wrap.style.background = '';
    if (img) { img.style.display = 'none'; img.src = ''; }
    localStorage.removeItem('profileBanner');
}

function loadSavedBanner() {
    const saved = localStorage.getItem('profileBanner');
    if (saved) applyBannerPreset(saved);
}

// ==================== GROUPS FILTER ====================
function filterGroupsList(query) {
    const items = document.querySelectorAll('#groupsList .group-card');
    const q = query.toLowerCase();
    items.forEach(card => {
        const name = card.querySelector('.group-name')?.textContent?.toLowerCase() || '';
        card.style.display = name.includes(q) ? '' : 'none';
    });
}

function closeProfile() {
    const panel = document.getElementById('profilePanel');
    if (!panel) return;
    panel.classList.remove('show');
    const backdrop = document.getElementById('profileBackdrop');
    if (backdrop) backdrop.style.display = 'none';
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
    } else if (tab === 'orbs') {
        renderOrbEffects();
    } else if (tab === 'saved') {
        renderSavedItemsSummary();
    }
}

function applyOrbEffect(effect = 'none', options = {}) {
    const { silent = false } = options;
    const root = document.documentElement;
    root.classList.remove('orb-none', 'orb-aurora', 'orb-neon-pulse', 'orb-ocean-mist', 'orb-ember');

    const classMap = {
        none: 'orb-none',
        aurora: 'orb-aurora',
        neon_pulse: 'orb-neon-pulse',
        ocean_mist: 'orb-ocean-mist',
        ember: 'orb-ember'
    };

    const normalized = classMap[effect] ? effect : 'none';
    root.classList.add(classMap[normalized]);
    selectedOrbEffect = normalized;
    localStorage.setItem('selectedOrbEffect', normalized);

    const orbSelect = document.getElementById('orbEffectSelect');
    if (orbSelect) {
        orbSelect.value = normalized;
    }

    if (!silent) {
        showToast('Orb effect updated', 'success');
    }
}

function renderOrbEffects() {
    const orbSelect = document.getElementById('orbEffectSelect');
    if (orbSelect) {
        orbSelect.value = selectedOrbEffect;
    }
    applyOrbEffect(selectedOrbEffect, { silent: true });
}

function renderSavedItemsSummary() {
    const savedMediaCountEl = document.getElementById('savedMediaCount');
    const archivedMessageCountEl = document.getElementById('savedArchivedCount');
    if (savedMediaCountEl) {
        savedMediaCountEl.textContent = String(copiedMediaItems.length);
    }
    if (archivedMessageCountEl) {
        archivedMessageCountEl.textContent = String(archivedMessages.length);
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
    rail.classList.remove('hidden');
    const trackHeight = rail.clientHeight;
    const ratio = container.scrollHeight > 0 ? (container.clientHeight / container.scrollHeight) : 1;
    const thumbHeight = Math.max(56, Math.round(Math.min(1, ratio) * trackHeight));
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
    time.textContent = formatMessageTimestamp(data.timestamp);
    time.title = formatMessageTimestamp(data.timestamp);

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
        showQuickReactions(messageDiv.dataset.messageId, messageDiv, data);
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
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', 'true');
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
        item.dataset.userId = String(userId || '');
        item.dataset.username = username;

        
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
        mobileMembersList.onclick = (e) => {
            const memberItem = e.target.closest('.member-item');
            if (!memberItem) return;
            const mobileUserId = memberItem.dataset.userId;
            const mobileUsername = memberItem.dataset.username || 'User';
            if (!mobileUserId) {
                showToast('❌ User ID not available', 'error');
                return;
            }
            if (mobileUserId === String(currentUser.id) || mobileUserId === String(currentUser._id)) {
                openProfile();
            } else {
                visitUserProfile(mobileUserId, mobileUsername);
            }
        };
    }
}

function renderMembersSidebarFromRoom(members) {
    const membersList = document.getElementById('membersList');
    if (!membersList) return;

    membersList.innerHTML = '';
    members.forEach((member) => {
        const memberId = String(member.id || member.userId || '');
        const isSelf = memberId && (memberId === String(currentUser?.id) || memberId === String(currentUser?._id));
        const normalizedMember = {
            ...member,
            id: memberId,
            username: isSelf ? (currentUser?.username || member.username || 'You') : (member.username || 'User'),
            avatar: isSelf ? (currentUser?.avatar || member.avatar || null) : (member.avatar || null)
        };

        const item = document.createElement('div');
        item.className = 'member-item';
        item.style.cursor = 'pointer';

        const avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        if (normalizedMember.avatar) {
            avatar.style.backgroundImage = `url(${normalizedMember.avatar})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        } else {
            avatar.textContent = String(normalizedMember.username || 'U').charAt(0).toUpperCase();
        }

        const status = document.createElement('div');
        status.className = 'status-indicator';

        const nameWrap = document.createElement('div');
        nameWrap.style.display = 'flex';
        nameWrap.style.flexDirection = 'column';
        nameWrap.style.gap = '2px';

        const name = document.createElement('span');
        name.textContent = normalizedMember.username || 'Unknown';
        name.style.fontWeight = '600';

        const role = document.createElement('span');
        role.textContent = normalizedMember.role || 'Member';
        role.style.fontSize = '11px';
        role.style.color = 'var(--text-secondary)';

        nameWrap.appendChild(name);
        nameWrap.appendChild(role);

        const memberName = normalizedMember.username || 'User';
        item.dataset.userId = String(memberId || '');
        item.dataset.username = memberName;

        item.onclick = () => {
            if (!memberId) return;
            if (String(memberId) === String(currentUser?.id) || String(memberId) === String(currentUser?._id)) {
                openProfile();
            } else {
                visitUserProfile(memberId, memberName);
            }
        };

        item.appendChild(avatar);
        item.appendChild(status);
        item.appendChild(nameWrap);
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

    // Show upload spinner in the input bar
    const inputArea = document.querySelector('.input-area');
    let spinnerEl = null;
    if (inputArea) {
        spinnerEl = document.createElement('div');
        spinnerEl.className = 'input-upload-spinner';
        spinnerEl.innerHTML = '<div class="input-upload-spinner-bar"></div>';
        inputArea.insertBefore(spinnerEl, inputArea.firstChild);
    }

    const targetId = currentChatContext.type === 'dm' ? ensureChatTarget() : null;
    let sentCount = 0;
    const maxRawFileBytes = 24 * 1024 * 1024;

    for (const file of files) {
        if (file.size > maxRawFileBytes) {
            showToast(`⚠️ ${file.name} is too large for in-chat upload. Keep each file under 24MB.`, 'warning');
            continue;
        }
        
        const payload = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = e.target.result;
                // Support images, videos, and also treat webm/ogg/mp4 as reel videos
                let mediaType = 'image';
                const fileName = (file.name || '').toLowerCase();
                const videoByExt = /\.(mp4|webm|mov|m4v|mkv|3gp|ogv|ogg)$/i.test(fileName);
                const imageByExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileName);
                if (String(file.type || '').startsWith('video') || videoByExt) mediaType = 'video';
                else if (String(file.type || '').startsWith('image') || imageByExt) mediaType = 'image';
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

    // Remove spinner
    if (spinnerEl) spinnerEl.remove();

    if (sentCount > 0) {
        showToast(`✅ Sent ${sentCount} media file(s)`, 'success');
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
        joinedCommunities = Array.from(new Set(joinedCommunities)).sort((a, b) => String(a).localeCompare(String(b)));
        joinedGroups = Array.from(new Set(joinedGroups)).sort((a, b) => String(a).localeCompare(String(b)));

       
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
                    <span class="channel-label">${community}</span>
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
                    <span class="channel-label">${group}</span>
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
        selfText.className = 'channel-label';
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
    text.className = 'channel-label';
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

        const userCoins = Number(currentUser?.coins || 0);

        const shopHeader = document.createElement('div');
        shopHeader.className = 'shop-hero';
        shopHeader.innerHTML = `
            <div class="shop-hero-title">Premium Shop</div>
            <div class="shop-hero-subtitle">Instant equip items, profile cosmetics, and seasonal packs</div>
            <div class="shop-hero-discount">Live Deals: up to 20% off featured items</div>
        `;
        shopList.appendChild(shopHeader);

        if (items.length === 0) {
            shopList.innerHTML = '<p style="color: var(--text-secondary);">No shop items available</p>';
        } else {
            items.forEach(item => {
                const itemDiv = document.createElement('div');
                const canAfford = userCoins >= Number(item.price || 0);
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
                        <button onclick="buyItem('${item.id}')" class="buy-btn" ${canAfford ? '' : 'disabled'}>${canAfford ? 'Buy Now' : 'Not enough coins'}</button>
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
            renderSavedItemsSummary();
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
            const shopItem = item.ShopItem || item.itemId;
            if (!shopItem) return;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            itemDiv.style.cursor = 'pointer';
            itemDiv.innerHTML = `
                <div>
                    <div class="shop-item-name">${shopItem.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${shopItem.description}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Qty: ${item.quantity}</div>
                </div>
                <button onclick="applyShopItem('${shopItem.id}', '${shopItem.category}')" class="buy-btn" style="background: var(--primary-color);">Use</button>
            `;
            inventoryList.appendChild(itemDiv);
        });

        renderSavedItemsSummary();
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
    if (!candidateData) return;

    // Candidate can arrive before peerConnection exists; keep it for later.
    if (!peerConnection) {
        pendingRemoteIceCandidates.push(candidateData);
        return;
    }

    const candidate = new RTCIceCandidate(candidateData);
    const hasRemoteDescription = Boolean(peerConnection.remoteDescription && peerConnection.remoteDescription.type);

    if (hasRemoteDescription) {
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (iceErr) {
            // Stale or duplicate ICE candidates are common and harmless after ICE restart
            console.warn('ICE candidate ignored:', iceErr.message);
        }
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
    panel.removeAttribute('style');
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
            if (socket && socket.connected) {
                socket.emit('update profile cache', {
                    username: newUsername,
                    avatar: currentUser.avatar || null
                });
            }
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

async function clearAndCloseCurrentChat() {
    if (!currentChatContext || currentChatContext.type === 'none') {
        showToast('No active chat to clear', 'warning');
        return;
    }

    const cleared = await clearCurrentChatHistory();
    if (cleared) {
        closeCurrentChat();
    }
}

function getCurrentRoomKey() {
    if (currentChatContext.type === 'community') return normalizeRoomKeyClient('community', currentChatContext.name);
    if (currentChatContext.type === 'group') return normalizeRoomKeyClient('group', currentChatContext.name);
    return null;
}

function saveRoomMessages() {
    const buildCompactCache = (maxPerRoom, keepMedia = true) => {
        const compact = {};
        for (const [roomKey, msgs] of Object.entries(roomMessages || {})) {
            const latest = Array.isArray(msgs) ? msgs.slice(-maxPerRoom) : [];
            compact[roomKey] = latest.map((m) => {
                const copy = {
                    messageId: m?.messageId || m?.id || null,
                    from: m?.from || null,
                    fromUsername: m?.fromUsername || 'User',
                    fromAvatar: m?.fromAvatar || null,
                    content: m?.content || '',
                    mediaType: m?.mediaType || 'text',
                    roomType: m?.roomType,
                    roomName: m?.roomName,
                    timestamp: m?.timestamp || new Date().toISOString()
                };

                const mediaUrl = typeof m?.mediaUrl === 'string' ? m.mediaUrl : '';
                if (keepMedia && mediaUrl && mediaUrl.length <= ROOM_CACHE_MEDIA_URL_MAX_CHARS) {
                    copy.mediaUrl = mediaUrl;
                } else if (copy.mediaType !== 'text') {
                    copy.mediaUrl = null;
                    if (!copy.content) copy.content = `${copy.mediaType} message`;
                }

                return copy;
            });
        }
        return compact;
    };

    const attempts = [
        () => buildCompactCache(ROOM_CACHE_MAX_PER_ROOM, true),
        () => buildCompactCache(24, false),
        () => buildCompactCache(12, false),
        () => buildCompactCache(6, false)
    ];

    for (const build of attempts) {
        try {
            localStorage.setItem('roomMessages', JSON.stringify(build()));
            return;
        } catch (error) {
            if (error?.name !== 'QuotaExceededError') {
                console.warn('Failed saving room messages cache:', error);
                return;
            }
        }
    }

    try {
        localStorage.removeItem('roomMessages');
    } catch (_) {}
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

    // Optimistic render so the sender sees it immediately
    const optimistic = {
        id: Date.now(),
        from: currentUser.id,
        fromUsername: currentUser.username,
        fromAvatar: currentUser.avatar,
        to: targetId,
        content: payload.content,
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl || null,
        timestamp: new Date().toISOString()
    };
    if (currentChatContext.type === 'dm' && String(currentChatContext.id) === String(targetId)) {
        addMessageToChat(optimistic);
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

// ==================== IN-APP NOTIFICATION FEED ====================
function pushNotification(title, body, action = null) {
    const notif = {
        id: Date.now(),
        title,
        body,
        action,
        time: new Date().toISOString(),
        read: false
    };
    notifList.unshift(notif);
    if (notifList.length > 100) notifList.length = 100;
    localStorage.setItem('notifList', JSON.stringify(notifList));
    notifUnreadCount++;
    updateNotifBadge();
}

function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (notifUnreadCount > 0) {
        badge.textContent = notifUnreadCount > 99 ? '99+' : notifUnreadCount;
        badge.classList.add('visible');
    } else {
        badge.classList.remove('visible');
    }
}

function openNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    panel.classList.add('show');
    // Mark all as read
    notifList.forEach(n => n.read = true);
    localStorage.setItem('notifList', JSON.stringify(notifList));
    notifUnreadCount = 0;
    updateNotifBadge();
    renderNotifList();
}

function closeNotifPanel() {
    document.getElementById('notifPanel')?.classList.remove('show');
}

function clearAllNotifications() {
    notifList = [];
    localStorage.setItem('notifList', JSON.stringify(notifList));
    notifUnreadCount = 0;
    updateNotifBadge();
    renderNotifList();
}

function renderNotifList() {
    const el = document.getElementById('notifList');
    if (!el) return;
    if (notifList.length === 0) {
        el.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-secondary);">No notifications yet</div>';
        return;
    }
    el.innerHTML = notifList.map(n => {
        const timeStr = n.time ? new Date(n.time).toLocaleString() : '';
        const unreadClass = n.read ? '' : 'notif-unread';
        const actionAttr = n.action ? `onclick="handleNotifAction(${JSON.stringify(JSON.stringify(n.action))})"` : '';
        return `<div class="notif-item ${unreadClass}" ${actionAttr}>
            <div class="notif-item-title">${n.title}</div>
            <div class="notif-item-body">${n.body}</div>
            <div class="notif-item-time">${timeStr}</div>
        </div>`;
    }).join('');
}

function handleNotifAction(actionStr) {
    try {
        const action = JSON.parse(actionStr);
        closeNotifPanel();
        if (action.type === 'dm') {
            openDM(action.friendId, action.friendName);
        } else if (action.type === 'community' || action.type === 'group') {
            if (action.type === 'community') openCommunityChat(action.name);
            else openGroupChat(action.name);
        }
    } catch(e) {}
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
        const safeCommunityName = String(c.name).replace(/'/g, "\\'");
        const avatarHtml = profile.image
            ? `<div class="group-avatar" style="background-image:url('${profile.image}'); background-size:cover; background-position:center; border-radius:14px; width:48px; height:48px; flex-shrink:0;"></div>`
            : `<div class="group-avatar">${profile.icon || String.fromCodePoint(parseInt(c.iconId, 16))}</div>`;
        return `
            <div class="group-card community-card">
                ${avatarHtml}
                <div class="group-info">
                    <div class="group-name">${profile.icon || '🌐'} ${c.name}</div>
                    <div class="group-desc">${c.description}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end; min-width:96px;">
                    ${isJoined ? `<button class="buy-btn" onclick="openCommunityDetails('${safeCommunityName}')" style="background: var(--secondary-color);">⚙ Manage</button>` : ''}
                        <button class="buy-btn" 
                            onclick="${isJoined ? `openCommunityChat('${safeCommunityName}'); closeCommunitiesModal();` : `joinCommunity('${safeCommunityName}')`}" 
                            style="${isJoined ? 'background: var(--success);' : ''}">
                            ${isJoined ? '✅ Open' : '➕ Join'}
                        </button>
                </div>
            </div>
        `;
    }).join('');
    
    modal.classList.remove('hidden');
}

function closeCommunitiesModal() {
    document.getElementById('communitiesModal').classList.add('hidden');
}

function filterCommunitiesList(query) {
    const items = document.querySelectorAll('#communitiesList .community-card');
    const q = String(query || '').toLowerCase();
    items.forEach((card) => {
        const name = card.querySelector('.group-name')?.textContent?.toLowerCase() || '';
        card.style.display = name.includes(q) ? '' : 'none';
    });
}

function openGroupsModal() {
    const modal = document.getElementById('groupsModal');
    const list = document.getElementById('groupsList');
    
    const baseGroups = [
        { name: 'Study Group', emoji: '📚', description: 'Study together and share notes' },
        { name: 'Project Team', emoji: '💼', description: 'Collaborate on projects' },
        { name: 'Family', emoji: '👨‍👩‍👧', description: 'Family group chat' },
        { name: 'Friends', emoji: '🎉', description: 'Hang out with friends' },
        { name: 'Work', emoji: '🏢', description: 'Work related discussions' },
        { name: 'Gaming', emoji: '🎮', description: 'Gaming sessions and talk' },
        { name: 'Music', emoji: '🎵', description: 'Share music and playlists' }
    ];
    const groups = Array.from(new Set([...baseGroups.map((g) => g.name), ...joinedGroups])).map((groupName) => {
        const preset = baseGroups.find((g) => g.name === groupName) || { name: groupName, emoji: '👥', description: 'Custom group chat' };
        const roles = groupMemberRoles[groupName] || {};
        const dynamicCount = Math.max(1, Object.keys(roles).length || (joinedGroups.includes(groupName) ? 1 : 0));
        return { ...preset, members: dynamicCount };
    });
    
    list.innerHTML = groups.map(g => {
        const isJoined = joinedGroups.includes(g.name);
        const profile = getGroupProfile(g.name);
        const safeGroupName = String(g.name).replace(/'/g, "\\'");
        const avatarHtml = profile.image
            ? `<div class="group-avatar" style="background-image:url('${profile.image}'); background-size:cover; background-position:center; border-radius:14px; width:48px; height:48px; flex-shrink:0;"></div>`
            : `<div class="group-avatar">${profile.icon || g.emoji}</div>`;
        return `
            <div class="group-card">
                ${avatarHtml}
                <div class="group-info">
                    <div class="group-name">${g.name}</div>
                    <div class="group-desc">${g.description}</div>
                    <div class="group-members-count">👥 ${g.members} members</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end; min-width:96px;">
                    <button class="buy-btn" 
                        onclick="${isJoined ? `openGroupChat('${safeGroupName}'); closeGroupsModal();` : `joinGroup('${safeGroupName}')`}" 
                        style="${isJoined ? 'background: var(--success);' : ''}">
                        ${isJoined ? '✅ Open' : '➕ Join'}
                    </button>
                    <button class="secondary-btn" style="padding:6px 10px; font-size:12px;" onclick="openGroupAppearanceEditor('${safeGroupName}')">🎨 Edit</button>
                    ${isJoined ? `<div style="display:flex; gap:6px;"><button class="secondary-btn" style="padding:5px 8px; font-size:11px;" onclick="openGroupAppearanceEditor('${safeGroupName}')">Icon</button><button class="secondary-btn" style="padding:5px 8px; font-size:11px;" onclick="changeGroupImagePrompt('${safeGroupName}')">Photo</button></div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    modal.classList.remove('hidden');
}

function closeGroupsModal() {
    document.getElementById('groupsModal').classList.add('hidden');
}

function openGroupAppearanceEditor(name) {
    const profile = getGroupProfile(name);
    const safeName = String(name).replace(/'/g, "\\'");
    const canManage = canManageRoomAppearance('group', name);
    const iconList = ['👥', '📚', '💼', '👨‍👩‍👧', '🎉', '🏢', '🎮', '🎵', '⚽', '🍕', '🚀', '💻'];
    const iconsHtml = iconList.map((icon) => (
        `<button onclick="setGroupIcon('${safeName}', '${icon}')" ${canManage ? '' : 'disabled'} style="font-size: 28px; padding: 8px; border: 2px solid var(--border-color); border-radius: 8px; background: var(--bg-color); cursor: ${canManage ? 'pointer' : 'not-allowed'}; opacity: ${canManage ? '1' : '0.55'};">${icon}</button>`
    )).join('');

    const html = `
        <div style="display:grid; gap:10px; min-width:280px;">
            <div style="font-size:13px; color:var(--text-secondary);">Customize group appearance for <strong>${name}</strong>. ${canManage ? 'You can manage this room.' : 'Only Owner or Admin can edit this room.'}</div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">${iconsHtml}</div>
            <button class="secondary-btn" onclick="renameGroupPrompt('${safeName}'); closeCustomDialog();" ${canManage ? '' : 'disabled'}>✏ Rename Group</button>
            <button class="save-btn" onclick="changeGroupImagePrompt('${safeName}'); closeCustomDialog();" ${canManage ? '' : 'disabled'}>🖼 Upload Group Photo</button>
            <button class="secondary-btn" onclick="showGroupRoles('${safeName}'); closeCustomDialog();">👥 View Roles</button>
            <button class="secondary-btn" onclick="resetGroupAppearance('${safeName}')" ${canManage ? '' : 'disabled'}>♻ Reset to Default</button>
        </div>
    `;
    customAlert(html, `🎨 ${name} Appearance`, '🎨');
}

function renameGroupPrompt(name) {
    if (!canManageRoomAppearance('group', name)) {
        showToast('Only Owner or Admin can rename this group', 'warning');
        return;
    }
    customPrompt('Enter new group name', '✏ Rename Group', name, name, '✏').then((newName) => {
        const trimmed = String(newName || '').trim();
        if (!trimmed || trimmed === name) return;

        const idx = joinedGroups.indexOf(name);
        if (idx >= 0) {
            joinedGroups[idx] = trimmed;
            localStorage.setItem('joinedGroups', JSON.stringify(joinedGroups));
        }

        if (groupProfiles[name]) {
            groupProfiles[trimmed] = { ...groupProfiles[name], name: trimmed };
            delete groupProfiles[name];
            localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
        }

        if (groupMemberRoles[name]) {
            groupMemberRoles[trimmed] = groupMemberRoles[name];
            delete groupMemberRoles[name];
            localStorage.setItem('groupMemberRoles', JSON.stringify(groupMemberRoles));
        }

        const oldKey = normalizeRoomKeyClient('group', name);
        const newKey = normalizeRoomKeyClient('group', trimmed);
        if (roomMessages[oldKey]) {
            roomMessages[newKey] = roomMessages[oldKey];
            delete roomMessages[oldKey];
            saveRoomMessages();
        }

        if (currentChatContext.type === 'group' && currentChatContext.name === name) {
            openGroupChat(trimmed);
        }

        emitRoomProfileUpdate('group', name, { name: trimmed });

        loadFriendsForDM();
        showToast('Group renamed successfully', 'success');
    });
}

function showGroupRoles(name) {
    const roleMap = groupMemberRoles[name] || {};
    const members = Array.isArray(currentRoomMembers) && currentChatContext?.type === 'group' && currentChatContext?.name === name
        ? currentRoomMembers
        : [];
    const myRole = roleMap[String(currentUser?.id || '')] || 'Member';
    const canManage = myRole === 'Owner' || myRole === 'Admin';

    const rows = members.map((m) => {
        const memberId = String(m.id || m.userId || '');
        const role = m.role || roleMap[memberId] || 'Member';
        const self = memberId === String(currentUser?.id || '');
        const controls = canManage && !self
            ? `
                <div style="display:flex; gap:6px;">
                    <button class="secondary-btn" style="padding:4px 8px; font-size:11px;" onclick="assignGroupRole('${String(name).replace(/'/g, "\\'")}', '${memberId}', 'Member')">Member</button>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:11px;" onclick="assignGroupRole('${String(name).replace(/'/g, "\\'")}', '${memberId}', 'Admin')">Admin</button>
                    <button class="secondary-btn" style="padding:4px 8px; font-size:11px;" onclick="assignGroupRole('${String(name).replace(/'/g, "\\'")}', '${memberId}', 'Owner')">Owner</button>
                </div>
            `
            : `<div style="font-size:12px; color:var(--text-secondary);">${role}</div>`;
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border:1px solid var(--border-color); border-radius:8px;">
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:600;">${m.username || 'User'}</div>
                    <div style="font-size:11px; color:var(--text-secondary);">${role}${self ? ' (You)' : ''}</div>
                </div>
                ${controls}
            </div>
        `;
    }).join('');

    customAlert(`
        <div style="display:grid; gap:8px; min-width:320px;">
            <div style="font-size:13px; color:var(--text-secondary);">Backend-synced roles for active group room. Your role: <strong>${myRole}</strong>.</div>
            ${rows || '<div style="color:var(--text-secondary);">Open the group chat first to load live members.</div>'}
        </div>
    `, `👥 ${name} Roles`, '👥');
}

function assignGroupRole(groupName, targetUserId, role) {
    if (!socket || !socket.connected) {
        showToast('Not connected to server', 'warning');
        return;
    }
    socket.emit('set room role', {
        roomType: 'group',
        roomName: groupName,
        targetUserId,
        role
    });
    showToast(`Requested role change to ${role}`, 'success');
}

function setGroupIcon(name, icon) {
    if (!canManageRoomAppearance('group', name)) {
        showToast('Only Owner or Admin can change group icon', 'warning');
        return;
    }
    const profile = getGroupProfile(name);
    profile.icon = icon;
    profile.image = '';
    groupProfiles[name] = profile;
    localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
    closeCustomDialog();
    openGroupsModal();
    if (currentChatContext?.type === 'group' && currentChatContext?.name === name) {
        document.getElementById('chatTitle').textContent = `${icon} Group: ${name}`;
    }
    emitRoomProfileUpdate('group', name, { icon, image: '' });
    loadFriendsForDM();
    showToast('Group icon updated!', 'success');
}

function resetGroupAppearance(name) {
    if (!canManageRoomAppearance('group', name)) {
        showToast('Only Owner or Admin can reset group appearance', 'warning');
        return;
    }
    const profile = getGroupProfile(name);
    profile.image = '';
    profile.icon = '👥';
    groupProfiles[name] = profile;
    localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
    closeCustomDialog();
    openGroupsModal();
    emitRoomProfileUpdate('group', name, { icon: '👥', image: '' });
    loadFriendsForDM();
    showToast('Group appearance reset', 'success');
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
    if (name && typeof name === 'object') {
        name = name.name || name.id || String(name);
    }
    name = String(name || 'Community');
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
    renderRoomMessages(normalizeRoomKeyClient('community', name), name, 'community');
    currentRoomMembers = [{
        id: currentUser?.id,
        username: currentUser?.username || 'You',
        avatar: currentUser?.avatar || null,
        role: getMyRoomRole('community', name) || 'Owner'
    }];
    renderMembersSidebarFromRoom(currentRoomMembers);
    subscribeToRoomChat('community', name);
    document.getElementById('closeChatBtn').style.display = 'block';
    showSection('chat');
    
    
    if (window.innerWidth <= 480) {
        closeMobileSidebar();
    }
}

function openGroupChat(name) {
    if (name && typeof name === 'object') {
        name = name.name || name.id || String(name);
    }
    name = String(name || 'Group');
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
    renderRoomMessages(normalizeRoomKeyClient('group', name), name, 'group');
    currentRoomMembers = [{
        id: currentUser?.id,
        username: currentUser?.username || 'You',
        avatar: currentUser?.avatar || null,
        role: getMyRoomRole('group', name) || 'Owner'
    }];
    renderMembersSidebarFromRoom(currentRoomMembers);
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
    if (!groupMemberRoles[name]) {
        groupMemberRoles[name] = {};
    }
    groupMemberRoles[name][String(currentUser?.id || 'self')] = 'Owner';
    localStorage.setItem('groupMemberRoles', JSON.stringify(groupMemberRoles));
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
    if (!picker) return;
    picker.classList.toggle('show');
    if (picker.classList.contains('show')) {
        loadPickerContent();
    }
}

function switchPickerTab(tab, triggerEl) {
    currentPickerTab = tab;
    document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
    const tabTrigger = triggerEl || (typeof event !== 'undefined' ? event.target : null);
    if (tabTrigger) tabTrigger.classList.add('active');
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

function showQuickReactions(messageId, messageDiv, messageData = null) {
    if (!messageDiv) return;
    const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '💯', '👏', '🤯', '😎'];
    
    
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
    
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.position = 'fixed';
    picker.style.background = 'var(--chat-bg)';
    picker.style.border = '2px solid var(--primary-color)';
    picker.style.borderRadius = '12px';
    picker.style.padding = '12px';
    picker.style.display = 'flex';
    picker.style.flexDirection = 'column';
    picker.style.gap = '10px';
    picker.style.zIndex = '9999';
    picker.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
    picker.style.maxWidth = 'min(96vw, 460px)';
    
    
    const rect = messageDiv.getBoundingClientRect();
    // Position above message, clamped to viewport
    const estimatedPickerH = 260;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let top;
    if (spaceAbove >= estimatedPickerH + 20) {
        top = rect.top - estimatedPickerH - 10;
    } else if (spaceBelow >= estimatedPickerH + 20) {
        top = rect.bottom + 10;
    } else {
        // Center on screen if neither fits
        top = Math.max(10, (window.innerHeight - estimatedPickerH) / 2);
    }
    picker.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 470)) + 'px';
    picker.style.top = Math.max(12, top) + 'px';

    const title = document.createElement('div');
    title.textContent = 'React or take action';
    title.style.fontSize = '12px';
    title.style.fontWeight = '700';
    title.style.color = 'var(--text-secondary)';
    picker.appendChild(title);

    const emojiGrid = document.createElement('div');
    emojiGrid.style.display = 'grid';
    emojiGrid.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
    emojiGrid.style.gap = '8px';
    
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
        emojiGrid.appendChild(btn);
    });

    picker.appendChild(emojiGrid);

    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'grid';
    actionsRow.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    actionsRow.style.gap = '8px';

    const makeActionButton = (label, onClick, isDanger = false) => {
        const actionBtn = document.createElement('button');
        actionBtn.textContent = label;
        actionBtn.style.padding = '8px 10px';
        actionBtn.style.borderRadius = '8px';
        actionBtn.style.border = `1px solid ${isDanger ? 'var(--danger)' : 'var(--border-color)'}`;
        actionBtn.style.background = isDanger ? 'rgba(240,71,71,0.15)' : 'var(--bg-color)';
        actionBtn.style.color = isDanger ? 'var(--danger)' : 'var(--text-primary)';
        actionBtn.style.fontSize = '12px';
        actionBtn.style.fontWeight = '600';
        actionBtn.style.cursor = 'pointer';
        actionBtn.onclick = (e) => {
            e.stopPropagation();
            onClick();
            picker.remove();
        };
        return actionBtn;
    };

    actionsRow.appendChild(makeActionButton('↩ Reply', () => {
        const data = messageData || {
            fromUsername: messageDiv.querySelector('.message-username')?.textContent || 'user',
            content: messageDiv.querySelector('.message-text')?.textContent || ''
        };
        replyToMessage(messageId, data);
    }));
    actionsRow.appendChild(makeActionButton('📋 Copy', () => copyMessageText(messageId)));
    actionsRow.appendChild(makeActionButton('📦 Archive', () => archiveSingleMessage(messageId, messageDiv)));

    if (String(messageDiv.dataset.sender) === String(currentUser?.id)) {
        actionsRow.appendChild(makeActionButton('🗑 Delete Message', () => deleteMessage(messageId, messageDiv), true));
    }

    picker.appendChild(actionsRow);
    
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
        { label: '👍 React', action: () => showQuickReactions(messageDiv.dataset.messageId, messageDiv, data), hoverClass: 'primary-hover' },
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
        if (groupName === null) {
            showToast('Group creation cancelled', 'info');
            return;
        }
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
            if (memberIds === null) {
                showToast('Group creation cancelled before invites', 'info');
                return;
            }
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
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <span style="font-size: 24px;">${icon}</span>
                    <div style="flex: 1; min-width: 140px;">
                        <div style="font-weight: 600; font-size: 14px; word-break: break-word;">${chat.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${chat.type === 'dm' ? 'Direct Message' : chat.type === 'community' ? 'Community' : 'Group Chat'}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button onclick="event.stopPropagation(); unarchiveChat('${chat.type}', '${chat.id}');" style="padding: 6px 10px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Open</button>
                        <button onclick="event.stopPropagation(); deleteArchivedChat('${chat.type}', '${chat.id}');" style="padding: 6px 10px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const modal = document.getElementById('archivedChatsModal');
    const list = document.getElementById('archivedChatsList');
    if (!modal || !list) {
        showToast('Archive UI unavailable', 'error');
        return;
    }

    list.innerHTML = chatsHtml;
    modal.classList.remove('hidden');
}

function closeArchivedChatsModal() {
    document.getElementById('archivedChatsModal')?.classList.add('hidden');
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
        showArchivedChats(); 
    }
}

function deleteArchivedChat(type, id) {
    const index = archivedChats.findIndex(c => c.type === type && c.id === id);
    if (index === -1) return;
    const chat = archivedChats[index];
    archivedChats.splice(index, 1);
    localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
    showToast(`Deleted archived chat: ${chat.name}`, 'success');
    showArchivedChats();
}

function clearArchivedChats() {
    archivedChats = [];
    localStorage.setItem('archivedChats', JSON.stringify(archivedChats));
    showToast('All archived chats deleted', 'success');
    closeArchivedChatsModal();
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
    const html = `
        <div style="display:grid; gap:10px; min-width:280px;">
            <button class="save-btn" onclick="startTriviaChallenge(); closeCustomDialog();">🧠 Trivia Challenge</button>
            <button class="secondary-btn" onclick="startSpeedTypingChallenge(); closeCustomDialog();">⌨ Speed Typing</button>
            <button class="secondary-btn" onclick="startMemoryChallenge(); closeCustomDialog();">🧩 Memory Sequence</button>
            <div style="font-size:12px; color:var(--text-secondary);">Complete challenges to earn coins and boost your profile stats.</div>
        </div>
    `;
    customAlert(html, '🎉 Events & Challenges', '🎉');
}

function startTriviaChallenge() {
    const quizzes = [
        { q: 'What year is it?', a: '2026', coins: 50 },
        { q: 'Can you archive chats?', a: 'yes', coins: 40 },
        { q: 'Which tab shows your inventory?', a: 'inventory', coins: 60 },
        { q: 'What button starts a call?', a: 'video', coins: 40 }
    ];
    const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];
    customPrompt(quiz.q, '🧠 Trivia Challenge', 'Your answer...', '', '🧠').then(answer => {
        if (answer && answer.toLowerCase().trim() === quiz.a.toLowerCase()) {
            showToast(`✅ Correct! +${quiz.coins} coins`, 'success');
            updateUserStats('quizCorrect', 1);
            addCoins(quiz.coins);
            updateStatsDisplay();
            updateUserProfile();
        } else if (answer !== null) {
            showToast(`❌ Wrong! Answer: ${quiz.a}`, 'error');
        }
    });
}

function startSpeedTypingChallenge() {
    const phrase = ['chat faster', 'web rtc sync', 'hello community', 'discord style ui'][Math.floor(Math.random() * 4)];
    const startedAt = Date.now();
    customPrompt(`Type this exactly:\n\n${phrase}`, '⌨ Speed Typing', phrase, '', '⌨').then((answer) => {
        if (answer === null) return;
        const elapsed = (Date.now() - startedAt) / 1000;
        if (String(answer).trim().toLowerCase() === phrase) {
            const reward = elapsed <= 8 ? 80 : elapsed <= 15 ? 50 : 30;
            showToast(`✅ Nice! ${elapsed.toFixed(1)}s, +${reward} coins`, 'success');
            addCoins(reward);
            updateStatsDisplay();
            updateUserProfile();
        } else {
            showToast('❌ Text mismatch. Try again!', 'warning');
        }
    });
}

function startMemoryChallenge() {
    const pool = ['🔥', '🎯', '🌟', '🎮', '💎', '⚡'];
    const seq = [pool[Math.floor(Math.random() * pool.length)], pool[Math.floor(Math.random() * pool.length)], pool[Math.floor(Math.random() * pool.length)]];
    const expected = seq.join(' ');
    customAlert(`<div style="font-size:24px; text-align:center; margin:10px 0;">${expected}</div><div style="font-size:12px; color:var(--text-secondary); text-align:center;">Memorize this sequence, then press OK.</div>`, '🧩 Memory Challenge', '🧩').then(() => {
        customPrompt('Enter the exact emoji sequence separated by spaces', '🧩 Memory Recall', expected, '', '🧩').then((answer) => {
            if (answer === null) return;
            if (String(answer).trim() === expected) {
                showToast('✅ Perfect recall! +70 coins', 'success');
                addCoins(70);
                updateStatsDisplay();
                updateUserProfile();
            } else {
                showToast(`❌ Not quite. Correct: ${expected}`, 'warning');
            }
        });
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
    if (!document.getElementById('shopModal')?.classList.contains('hidden')) {
        loadShopItems();
    }
}

function updateUserProfile() {
    if (!currentUser) return;
    const userJSON = localStorage.getItem('user');
    if (userJSON) {
        const user = JSON.parse(userJSON);
        currentUser = user;
        const coinsDisplay = document.getElementById('coinsDisplay');
        if (coinsDisplay) coinsDisplay.textContent = `💰 Coins: ${user.coins || 0}`;
        if (!document.getElementById('shopModal')?.classList.contains('hidden')) {
            loadShopItems();
        }
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
            extraActions.push('<button class="secondary-btn" onclick="openGroupAppearanceEditor(currentChatContext.name); closeCustomDialog();">🎨 Change Group Icon</button>');
            extraActions.push('<button class="secondary-btn" onclick="changeGroupImagePrompt(currentChatContext.name); closeCustomDialog();">🖼️ Change Group Image</button>');
        }
        if (currentChatContext.type === 'community') {
            extraActions.push('<button class="secondary-btn" onclick="changeCommunityImagePrompt(currentChatContext.name); closeCustomDialog();">🖼️ Change Community Image</button>');
        }
    }

    const html = `
        <div style="display:grid; gap:10px; min-width:260px;">
            <button class="secondary-btn" onclick="showQRCodeModal(); closeCustomDialog();">📱 My QR Code</button>
            <button class="save-btn" onclick="openArchivedChatsFromQuickActions();">📦 Archive Center</button>
            <button class="secondary-btn" onclick="showUserStats(); closeCustomDialog();">📊 Activity Dashboard</button>
            <button class="secondary-btn" onclick="openMediaPreview(); closeCustomDialog();">🖼️ Saved Media Vault</button>
            <button class="secondary-btn" onclick="startQuiz(); closeCustomDialog();">🎉 Events & Challenges</button>
            ${extraActions.join('')}
            <button class="secondary-btn" onclick="closeCustomDialog();">✖ Close</button>
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
    const cacheKey = getRoomCacheKey('community', name);
    const synced = roomProfileCache[cacheKey] || {};
    if (!communityProfiles[name]) {
        communityProfiles[name] = {
            name: synced.name || name,
            icon: synced.icon || '',
            image: synced.image || '',
            members: [
                {
                    id: currentUser?.id || `u-${Date.now()}`,
                    username: currentUser?.username || 'You',
                    role: 'leader'
                }
            ]
        };
        localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
    } else if (synced.name || synced.icon || synced.image) {
        communityProfiles[name] = {
            ...communityProfiles[name],
            ...(synced.name ? { name: synced.name } : {}),
            ...(synced.icon ? { icon: synced.icon } : {}),
            ...(typeof synced.image === 'string' ? { image: synced.image } : {})
        };
    }
    return communityProfiles[name];
}

function getGroupProfile(name) {
    const cacheKey = getRoomCacheKey('group', name);
    const synced = roomProfileCache[cacheKey] || {};
    if (!groupProfiles[name]) {
        groupProfiles[name] = {
            name: synced.name || name,
            icon: synced.icon || '👥',
            image: synced.image || ''
        };
        localStorage.setItem('groupProfiles', JSON.stringify(groupProfiles));
    } else if (synced.name || synced.icon || synced.image) {
        groupProfiles[name] = {
            ...groupProfiles[name],
            ...(synced.name ? { name: synced.name } : {}),
            ...(synced.icon ? { icon: synced.icon } : {}),
            ...(typeof synced.image === 'string' ? { image: synced.image } : {})
        };
    }
    return groupProfiles[name];
}

function openCommunityDetails(name) {
    const profile = getCommunityProfile(name);
    const modal = document.getElementById('communityDetailsModal');
    const title = document.getElementById('communityDetailsTitle');
    const body = document.getElementById('communityDetailsBody');
    if (!modal || !title || !body) return;

    const roomRole = getMyRoomRole('community', name);
    const localRole = Array.isArray(profile.members)
        ? (profile.members.find((m) => String(m.id) === String(currentUser?.id))?.role || 'member')
        : 'member';
    const canManage = roomRole === 'Owner' || roomRole === 'Admin' || localRole === 'leader' || localRole === 'vice_leader';
    const roleLabel = roomRole === 'Admin' ? 'Vice Leader' : (roomRole === 'Owner' ? 'Leader' : (localRole === 'leader' ? 'Leader' : (localRole === 'vice_leader' ? 'Vice Leader' : 'Member')));

    title.textContent = `${profile.icon} ${profile.name}`;
    const members = Array.isArray(profile.members) ? profile.members : [];
    body.innerHTML = `
        <div style="display:grid; gap:12px; margin-bottom:14px;">
            <button class="secondary-btn" onclick="renameCommunityPrompt('${name}')" ${canManage ? '' : 'disabled'}>✏️ Rename Community</button>
            <button class="secondary-btn" onclick="changeCommunityIconPrompt('${name}')" ${canManage ? '' : 'disabled'}>🖼️ Change Icon</button>
            <button class="secondary-btn" onclick="changeCommunityImagePrompt('${name}')" ${canManage ? '' : 'disabled'}>🖼️ Upload Cover Image</button>
            <div style="font-size:12px; color:var(--text-secondary);">Your role: <strong>${roleLabel}</strong>. Only Leader or Vice Leader can change community appearance.</div>
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
    if (!canManageRoomAppearance('community', name)) {
        showToast('Only Leader or Vice Leader can rename this community', 'warning');
        return;
    }
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

        emitRoomProfileUpdate('community', name, { name: trimmed });

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
    if (!canManageRoomAppearance('community', name)) {
        showToast('Only Leader or Vice Leader can change icon', 'warning');
        return;
    }
    const profile = getCommunityProfile(name);
    profile.icon = icon;
    communityProfiles[name] = profile;
    localStorage.setItem('communityProfiles', JSON.stringify(communityProfiles));
    closeCustomDialog();
    openCommunityDetails(name);
    if (currentChatContext.type === 'community' && currentChatContext.name === name) {
        document.getElementById('chatTitle').textContent = `${profile.icon} Community: ${name}`;
    }
    emitRoomProfileUpdate('community', name, { icon });
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
    if (!canManageRoomAppearance('community', name)) {
        showToast('Only Leader or Vice Leader can change image', 'warning');
        return;
    }
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
            emitRoomProfileUpdate('community', name, { image: reader.result });
            showToast('Community image updated (Profile updated)', 'success');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

function changeGroupImagePrompt(name) {
    if (!canManageRoomAppearance('group', name)) {
        showToast('Only Owner or Admin can change group image', 'warning');
        return;
    }
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
            emitRoomProfileUpdate('group', name, { image: reader.result });
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
    bindCallControlButtons();
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
    applyOrbEffect(selectedOrbEffect, { silent: true });
    renderSavedItemsSummary();
    loadSavedBanner();

    // Load previous notifications count
    notifUnreadCount = notifList.filter(n => !n.read).length;
    updateNotifBadge();

    // Start debug auto-refresh if call is active
    setInterval(() => {
        if (peerConnection) refreshCallDebug();
    }, 3000);

    
    syncBuildVersionBadge();
    ensureRtcConfigLoaded();

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
    if (window.customDialogResolve) window.customDialogResolve(false);
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
    
    
    const profileLinkData = `${window.location.origin}?addFriend=${encodeURIComponent(currentUser.id || currentUser._id)}`;
    
   
    if (typeof QRCode !== 'undefined') {
        try {
            new QRCode(qrDiv, {
                text: profileLinkData,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            console.log('✅ QR Code generated successfully');
        } catch (error) {
            console.error('❌ QRCode library error:', error);
            generateQRCodeFallback(qrDiv, profileLinkData);
        }
    } else {
        console.warn('⚠️ QRCode library not loaded, using fallback');
        
        generateQRCodeFallback(qrDiv, profileLinkData);
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
        
        
        if (qrData.startsWith('http://') || qrData.startsWith('https://')) {
            try {
                const parsed = new URL(qrData.trim());
                const addFriendId = parsed.searchParams.get('addFriend');
                if (addFriendId) {
                    friendId = addFriendId;
                    friendName = 'Friend';
                }
            } catch (error) {
                console.warn('Invalid QR URL:', error);
            }
        } else if (qrData.startsWith('FRIEND_REQUEST:')) {
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
    openCallDialog(targetName);
    setCallStatus('Dialing...');
    appendCallLog(`Outgoing ${callType.toLowerCase()} to ${targetName}`);

    if (socket && socket.connected && targetId) {
        socket.emit('start video call', { 
            targetId: targetId, 
            type: currentChatContext.type || 'dm',
            targetName: targetName
        });
        activeCallState = { callId: null, peerId: targetId, direction: 'outgoing' };
        showToast(`📞 Calling ${targetName}...`, 'success');
        appendCallLog('Call request emitted to signaling server');
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
            appendCallLog(`Accepted incoming call from ${callerName}`);
            socket.emit('accept video call', {
                callId: activeCallState.callId,
                toId: activeCallState.peerId
            });
            closeCustomDialog();
            startHostedCallRoom(callerName, `firetech-${activeCallState.callId}`).catch((error) => {
                console.error('Failed to initialize hosted call session:', error);
                showToast('Unable to join hosted call', 'error');
                cleanupCallSession(false);
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
            audio: true, // Keep it simple for better compatibility
            video: {
                facingMode: 'user',
                width: { min: 320, ideal: 640, max: 1280 }, // Use ranges, not fixed ideals
                height: { min: 240, ideal: 480, max: 720 }
            }
        };
        localCallStream = await navigator.mediaDevices.getUserMedia(constraints);
        showToast('📹 Camera and microphone enabled', 'success');
        return localCallStream;
    } catch (error) {
        console.error('Media access error:', error);

        // Retry with simpler constraints for mobile browsers that reject advanced constraints.
        try {
            localCallStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            showToast('📹 Camera and microphone enabled', 'success');
            return localCallStream;
        } catch (secondaryError) {
            console.warn('Secondary media constraint attempt failed:', secondaryError);
        }

        
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
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    const runtimeIceServers = Array.isArray(rtcRuntimeConfig?.iceServers) && rtcRuntimeConfig.iceServers.length
        ? rtcRuntimeConfig.iceServers
        : getDefaultIceServers();
    const hasTurnServersConfigured = hasTurnServerConfigured(runtimeIceServers);
    activeIceServers = runtimeIceServers;

    peerConnection = new RTCPeerConnection({
        iceServers: runtimeIceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: forceRelayOnly ? 'relay' : (rtcRuntimeConfig?.iceTransportPolicy || 'all')
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

    let hasLocalAudio = false;
    let hasLocalVideo = false;

    if (localCallStream) {
        localCallStream.getTracks().forEach((track) => {
            track.enabled = true;
            peerConnection.addTrack(track, localCallStream);
            if (track.kind === 'audio') hasLocalAudio = true;
            if (track.kind === 'video') hasLocalVideo = true;
        });
    }

    // Keep remote receiving path alive even when local media permissions fail.
    if (!hasLocalAudio) {
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    }
    if (!hasLocalVideo) {
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
    }

    // Apply candidates that arrived before peer connection was created.
    if (pendingRemoteIceCandidates.length) {
        const earlyCandidates = [...pendingRemoteIceCandidates];
        pendingRemoteIceCandidates = [];
        earlyCandidates.forEach((candidateData) => {
            addOrQueueIceCandidate(candidateData).catch((error) => {
                console.warn('Failed to apply early ICE candidate:', error);
            });
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
        // Add the incoming track to our managed MediaStream so srcObject stays consistent.
        if (event.track && remoteCallStream) {
            if (!remoteCallStream.getTrackById(event.track.id)) {
                remoteCallStream.addTrack(event.track);
                appendCallLog(`Remote ${event.track.kind} track received`);
            }
        }
        const remoteVideo = document.getElementById('remoteCallVideo');
        if (remoteVideo) {
            if (remoteVideo.srcObject !== remoteCallStream) {
                remoteVideo.srcObject = remoteCallStream;
            }
            remoteVideo.muted = false;
            remoteVideo.volume = 1.0;
            ensureRemoteMediaPlayback(remoteVideo);
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
            setCallStatus('Connecting...');
            showToast('📞 Connecting call...', 'info');
        } else if (peerConnection.connectionState === 'connected') {
            callIceFailureCount = 0;
            setCallStatus('Connected');
            appendCallLog('Peer connection connected');
            showToast('📞 Call connected!', 'success');
            // Start timer only if not already running (avoids resetting a running clock)
            if (!callTimerInterval) {
                startCallTimer();
            }
            // Ensure remote media plays after ICE recovery
            const remoteVidEl = document.getElementById('remoteCallVideo');
            if (remoteVidEl) {
                if (!remoteVidEl.srcObject && remoteCallStream) {
                    remoteVidEl.srcObject = remoteCallStream;
                }
                remoteVidEl.muted = false;
                remoteVidEl.volume = 1.0;
                if (remoteVidEl.srcObject) {
                    ensureRemoteMediaPlayback(remoteVidEl);
                }
            }
        } else if (peerConnection.connectionState === 'failed') {
            setCallStatus('Connection failed');
            appendCallLog('Peer connection failed, starting recovery');
            showCallWarningThrottled('⚠️ Network issue detected, retrying call connection...');
            attemptIceRecovery(peerId);
        } else if (peerConnection.connectionState === 'closed') {
            
            cleanupCallSession(false);
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (!peerConnection) return;
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        appendCallLog(`ICE state: ${peerConnection.iceConnectionState}`);

        if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
            callIceFailureCount = 0;
            if (pendingIceRecoveryTimer) {
                clearTimeout(pendingIceRecoveryTimer);
                pendingIceRecoveryTimer = null;
            }
            if (pendingRelayFallbackTimer) {
                clearTimeout(pendingRelayFallbackTimer);
                pendingRelayFallbackTimer = null;
            }
            return;
        }

        if (peerConnection.iceConnectionState === 'checking' && forceRelayOnly && !pendingRelayFallbackTimer) {
            // If relay-only stalls, fall back to mixed ICE so STUN/P2P can connect.
            pendingRelayFallbackTimer = setTimeout(() => {
                pendingRelayFallbackTimer = null;
                if (!peerConnection) return;
                if (peerConnection.iceConnectionState !== 'checking') return;
                try {
                    forceRelayOnly = false;
                    peerConnection.setConfiguration({
                        iceServers: activeIceServers,
                        iceTransportPolicy: 'all'
                    });
                    showToast('Retrying call with mixed network mode...', 'warning');
                    appendCallLog('Fallback from relay-only to mixed mode');
                    attemptIceRecovery(peerId);
                } catch (fallbackError) {
                    console.warn('Relay fallback failed:', fallbackError);
                }
            }, 10000);
        }

        if (peerConnection.iceConnectionState === 'disconnected') {
            if (pendingIceRecoveryTimer) {
                clearTimeout(pendingIceRecoveryTimer);
            }
            // 'disconnected' can be temporary on mobile networks; wait before forcing ICE restart.
            pendingIceRecoveryTimer = setTimeout(() => {
                pendingIceRecoveryTimer = null;
                if (!peerConnection) return;
                if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
                    showCallWarningThrottled('⚠️ Connection unstable, trying to reconnect...');
                    attemptIceRecovery(peerId);
                }
            }, 3000);
            return;
        }

        if (peerConnection.iceConnectionState === 'failed') {
            if (pendingIceRecoveryTimer) {
                clearTimeout(pendingIceRecoveryTimer);
                pendingIceRecoveryTimer = null;
            }
            attemptIceRecovery(peerId);
        }
    };

    async function attemptIceRecovery(recoveryPeerId) {
        if (!peerConnection || !socket || !socket.connected) return;

        const now = Date.now();
        if (now - lastIceRecoveryAttemptAt < 4000) return;
        lastIceRecoveryAttemptAt = now;
        callIceFailureCount += 1;

        try {
            if (callIceFailureCount >= 2 && !forceRelayOnly && hasTurnServersConfigured) {
                forceRelayOnly = true;
                peerConnection.setConfiguration({
                    iceServers: activeIceServers,
                    iceTransportPolicy: 'relay'
                });
                showToast('Switching call to relay mode for network compatibility...', 'warning');
                appendCallLog('Switching to relay mode for recovery');
            } else if (callIceFailureCount >= 2 && !hasTurnServersConfigured) {
                showToast('Retrying call without relay fallback...', 'warning');
                appendCallLog('No TURN available, retrying direct ICE only');
            }

            peerConnection.restartIce?.();

            if (peerConnection.signalingState === 'stable') {
                const recoveryOffer = await peerConnection.createOffer({
                    iceRestart: true,
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(recoveryOffer);
                appendCallLog('ICE restart offer created and sent');

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
    // Use the new full-screen call overlay instead of a custom dialog
    const overlay = document.getElementById('callOverlay');
    if (overlay) {
        overlay.classList.toggle('desktop-window', window.innerWidth > 700);
        callEventLog = [];
        document.getElementById('callOverlayPeerName').textContent = `📞 ${peerName}`;
        document.getElementById('callTimerLabel').textContent = '00:00:00';
        setCallStatus('Preparing call...');
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) { muteBtn.textContent = '🎤'; muteBtn.classList.remove('muted'); }
        const camBtn = document.getElementById('cameraBtn');
        if (camBtn) { camBtn.textContent = '📷'; camBtn.classList.remove('cam-off'); }
        isCallCameraOff = false;
        overlay.classList.add('active');
        const dbg = document.getElementById('callDebugPanel');
        if (dbg) dbg.style.display = 'block';
        appendCallLog(`Call window opened for ${peerName}`);
    }
}

async function startCallSession(peerName, peerId, isCaller) {
    if (peerConnection && currentCallPeerId && String(currentCallPeerId) === String(peerId)) {
        return;
    }
    if (isStartingCallSession) return;
    isStartingCallSession = true;

    try {
    currentCallPeerId = peerId;
    currentCallPeerName = peerName;
    callIceFailureCount = 0;
    await ensureRtcConfigLoaded();
    forceRelayOnly = rtcRuntimeConfig?.iceTransportPolicy === 'relay';
    appendCallLog(`Starting session as ${isCaller ? 'caller' : 'callee'}`);

    openCallDialog(peerName);
    // Start timer from session start to avoid "stuck at 00:00" perception on unstable networks.
    if (!callTimerInterval) {
        startCallTimer();
    }
    try {
        await ensureLocalCallStream();
    } catch (mediaError) {
        // Do not abort the call - continue in receive-only mode so user can still hear/see remote party.
        console.warn('Local media unavailable, continuing receive-only call:', mediaError);
        localCallStream = null;
        appendCallLog(`Local media unavailable: ${mediaError?.message || mediaError}`);
        showToast('Starting call in receive-only mode (local camera/mic unavailable)', 'warning');
    }

    const localVideo = document.getElementById('localCallVideo');
    if (localVideo && localCallStream) {
        localVideo.srcObject = localCallStream;
        ensureLocalPreviewPlayback(localVideo);
    } else if (localVideo) {
        localVideo.srcObject = null;
    }

    createPeerConnection(peerId);
    appendCallLog('Peer connection created');

    if (isCaller && peerConnection) {
        makingOffer = true;
        try {
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(offer);
            appendCallLog('Offer created and sent');
            socket.emit('video signal', {
                toId: peerId,
                callId: activeCallState?.callId,
                signal: { type: 'offer', offer }
            });
        } finally {
            makingOffer = false;
        }
    }

    // Handle an offer that arrived while this session was being set up
    if (!isCaller && pendingSignalOffer && peerConnection) {
        const po = pendingSignalOffer;
        pendingSignalOffer = null;
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(po.offer));
            appendCallLog('Pending remote offer applied');
            await flushQueuedIceCandidates();
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            appendCallLog('Answer created for pending offer');
            socket.emit('video signal', {
                toId: po.fromId,
                callId: activeCallState?.callId,
                signal: { type: 'answer', answer }
            });
        } catch (pendingOfferErr) {
            console.error('Failed to handle pending offer:', pendingOfferErr);
        }
    }
    } finally {
        isStartingCallSession = false;
    }
}

function endVideoCall() {
    if (currentCallProvider === 'hosted' && currentJitsiApi) {
        currentJitsiApi.executeCommand('hangup');
    }
    
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
    if (currentCallProvider === 'hosted' && currentJitsiApi) {
        currentJitsiApi.executeCommand('toggleAudio');
        return;
    }
    if (!localCallStream) {
        showToast('Microphone unavailable on this device/browser', 'warning');
        return;
    }
    
    const audioTracks = localCallStream.getAudioTracks();
    if (!audioTracks.length) {
        showToast('No microphone track available', 'warning');
        return;
    }
    const currentlyEnabled = audioTracks.some(track => track.enabled);
    
    audioTracks.forEach(track => {
        track.enabled = !currentlyEnabled;
    });
    
    const btn = document.getElementById('muteBtn');
    if (btn) {
        const nowMuted = currentlyEnabled;
        btn.textContent = nowMuted ? '🔇' : '🎤';
        if (nowMuted) btn.classList.add('muted'); else btn.classList.remove('muted');
    }
    
    showToast(currentlyEnabled ? '🔇 Microphone muted' : '🎤 Microphone on', 'info');
}

function toggleCallCamera() {
    if (currentCallProvider === 'hosted' && currentJitsiApi) {
        currentJitsiApi.executeCommand('toggleVideo');
        return;
    }
    if (!localCallStream) {
        showToast('Camera unavailable on this device/browser', 'warning');
        return;
    }
    const videoTracks = localCallStream.getVideoTracks();
    if (!videoTracks.length) {
        showToast('No camera track available', 'warning');
        return;
    }
    isCallCameraOff = !isCallCameraOff;
    videoTracks.forEach(track => { track.enabled = !isCallCameraOff; });
    const btn = document.getElementById('cameraBtn');
    if (btn) {
        btn.textContent = isCallCameraOff ? '🚫' : '📷';
        if (isCallCameraOff) btn.classList.add('cam-off'); else btn.classList.remove('cam-off');
    }
    showToast(isCallCameraOff ? '📷 Camera off' : '📷 Camera on', 'info');
}

function toggleCallDebug() {
    const dbg = document.getElementById('callDebugPanel');
    if (!dbg) return;
    if (dbg.style.display === 'block') {
        dbg.style.display = 'none';
        return;
    }
    dbg.style.display = 'block';
    refreshCallDebug();
}

function refreshCallDebug() {
    const dbg = document.getElementById('callDebugPanel');
    if (!dbg || dbg.style.display !== 'block') return;

    const connState = peerConnection ? peerConnection.connectionState : 'none';
    const iceState = peerConnection ? peerConnection.iceConnectionState : 'none';
    const sigState = peerConnection ? peerConnection.signalingState : 'none';
    const localTracks = localCallStream ? localCallStream.getTracks().map(t => `${t.kind}[${t.enabled ? 'on' : 'off'}]`).join(', ') : 'none';
    const remoteTracks = remoteCallStream ? remoteCallStream.getTracks().map(t => `${t.kind}[${t.readyState}]`).join(', ') : 'none';
    const remoteVid = document.getElementById('remoteCallVideo');
    const vidState = remoteVid ? `paused:${remoteVid.paused} muted:${remoteVid.muted} vol:${remoteVid.volume}` : 'none';
    const socketStr = socket ? (socket.connected ? `connected [${socket.id}]` : 'disconnected') : 'null';

    dbg.innerHTML = `
        <div class="dbg-row">🔗 Connection: <b>${connState}</b></div>
        <div class="dbg-row">❄️ ICE State: <b>${iceState}</b></div>
        <div class="dbg-row">📡 Signaling: <b>${sigState}</b></div>
        <div class="dbg-row">🎤 Local Tracks: ${localTracks}</div>
        <div class="dbg-row">🔊 Remote Tracks: ${remoteTracks}</div>
        <div class="dbg-row">📺 Remote Video: ${vidState}</div>
        <div class="dbg-row">🔌 Socket: ${socketStr}</div>
        <div class="dbg-row">⏱ Call duration: ${document.getElementById('callTimerLabel')?.textContent || 'n/a'}</div>
        <div class="dbg-row">📋 Status: ${document.getElementById('callStatusLabel')?.textContent || 'n/a'}</div>
        <div class="dbg-log">${callEventLog.map((entry) => `<div>${entry}</div>`).join('')}</div>
        <div style="margin-top:8px;">
            <button onclick="forceRestartIce()" style="background:#00ff88;color:#000;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:700;">🔄 Restart ICE</button>
            <button onclick="refreshCallDebug()" style="background:rgba(255,255,255,0.2);color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:10px;margin-left:4px;">↻ Refresh</button>
        </div>
    `;
}

function forceRestartIce() {
    if (!peerConnection || !currentCallPeerId) {
        showToast('No active call to restart ICE', 'warning');
        return;
    }
    peerConnection.restartIce?.();
    showToast('♻️ ICE restart triggered', 'info');
    refreshCallDebug();
}

function cleanupCallSession(keepDialogOpen = false) {
    
    window.userIntentionallEndedCall = false;
    
    
    stopIncomingCallAlert();
    stopCallTimer();

    if (currentJitsiApi) {
        try {
            currentJitsiApi.dispose();
        } catch (_) {
        }
        currentJitsiApi = null;
    }
    currentCallProvider = 'webrtc';
    currentCallRoomName = null;
    setHostedCallVisible(false);

    if (peerConnection) {
        peerConnection.onicecandidate = null;
        peerConnection.ontrack = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.close();
        peerConnection = null;
    }

    remoteIceCandidatesQueue = [];
    remoteCallStream = null;
    remoteCallPlaybackRetryBound = false;
    remoteCallPlaybackStarted = false;
    lastIceRecoveryAttemptAt = 0;
    lastCallWarningAt = 0;
    isStartingCallSession = false;
    pendingSignalOffer = null;
    makingOffer = false;
    callIceFailureCount = 0;
    forceRelayOnly = false;
    activeIceServers = [];
    if (pendingIceRecoveryTimer) {
        clearTimeout(pendingIceRecoveryTimer);
        pendingIceRecoveryTimer = null;
    }
    if (pendingRelayFallbackTimer) {
        clearTimeout(pendingRelayFallbackTimer);
        pendingRelayFallbackTimer = null;
    }
    pendingRemoteIceCandidates = [];

    if (localCallStream) {
        localCallStream.getTracks().forEach((track) => track.stop());
        localCallStream = null;
    }

    currentCallPeerId = null;
    currentCallPeerName = null;
    activeCallState = null;
    callEventLog = [];
    setCallStatus('');

    // Close the overlay
    const overlay = document.getElementById('callOverlay');
    if (overlay) overlay.classList.remove('active');

    // Also close any old dialog if still open
    if (!keepDialogOpen) {
        closeCustomDialog();
    }

    // Clear debug panel
    const dbg = document.getElementById('callDebugPanel');
    if (dbg) { dbg.style.display = 'none'; dbg.innerHTML = ''; }
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
    if (!content) return;
    content.innerHTML = '';

    if (copiedMediaItems.length === 0) {
        content.innerHTML = `
            <div style="padding: 20px; color: var(--text-secondary); text-align: center; border: 1px dashed var(--border-color); border-radius: 8px;">
                No saved media yet. Use message actions like copy/archive on images or videos to add them here.
            </div>
        `;
        return;
    }
    
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
    renderMediaPreview();
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
    const modal = document.getElementById('archivedChatsModal');
    const list = document.getElementById('archivedChatsList');
    if (!modal || !list) {
        showToast('Archive UI unavailable', 'error');
        return;
    }

    const chatsHtml = archivedChats.map((chat) => {
        const icon = chat.type === 'dm' ? '👤' : chat.type === 'community' ? '🌐' : '👥';
        const safeName = String(chat.name || '').replace(/'/g, "\\'");
        return `
            <div style="padding: 12px; background: var(--bg-color); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="font-size:20px;">${icon}</span>
                    <div style="flex:1; min-width:140px;">
                        <div style="font-weight:600; word-break:break-word;">${chat.name}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">${chat.type}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="secondary-btn" style="padding:6px 10px; font-size:12px;" onclick="openArchivedChat('${chat.type}', '${chat.id}', '${safeName}'); closeArchivedChatsModal();">Open</button>
                        <button class="save-btn" style="padding:6px 10px; font-size:12px; background:var(--danger);" onclick="deleteArchivedChat('${chat.type}', '${chat.id}');">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const messageItems = archivedMessages.slice().reverse().slice(0, 80).map((m) => {
        const preview = String(m.text || '[Media message]').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
            <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 8px; background: var(--bg-color);">
                <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">${new Date(m.timestamp).toLocaleString()}</div>
                <div style="font-size:13px; line-height:1.4; word-break:break-word; overflow-wrap:anywhere;">${preview}</div>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div style="font-size:13px; color: var(--text-secondary); margin-bottom: 12px;">
            Archived chats: <strong>${archivedChats.length}</strong> | Archived single messages: <strong>${archivedMessages.length}</strong>
        </div>
        ${archivedChats.length > 0 ? `<div style="font-weight:700; margin-bottom:6px;">Chats</div>${chatsHtml}` : ''}
        ${archivedMessages.length > 0 ? `<div style="font-weight:700; margin: 10px 0 6px;">Single Messages</div>${messageItems}` : ''}
        ${archivedChats.length === 0 && archivedMessages.length === 0 ? '<div style="color: var(--text-secondary);">No archived content yet.</div>' : ''}
    `;

    modal.classList.remove('hidden');
}

async function clearCurrentChatHistory() {
    if (!currentChatContext || currentChatContext.type === 'none') {
        showToast('Open a chat first', 'warning');
        return false;
    }

    const confirmed = await customConfirm(
        'This will permanently clear all messages in the current chat for your account.',
        'Clear Chat History',
        '🧹',
        true
    );

    if (!confirmed) return false;

    try {
        if (currentChatContext.type === 'dm') {
            const response = await fetch(`${API_BASE}/dms/${currentChatContext.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showToast(data.error || 'Failed to clear chat history', 'error');
                return false;
            }
        } else {
            socket?.emit('clear room chat', {
                roomType: currentChatContext.type,
                roomName: currentChatContext.name
            });
            const roomKey = normalizeRoomKeyClient(currentChatContext.type, currentChatContext.name);
            roomMessages[roomKey] = [];
            saveRoomMessages();
        }

        document.getElementById('messages-container').innerHTML = '';
        refreshChatScrollbar();
        showToast('Chat history cleared', 'success');
        return true;
    } catch (error) {
        console.error(error);
        showToast('Failed to clear chat history', 'error');
        return false;
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




















