# Changelog - Version 2.2.5

##  Major Mobile UI Overhaul

### Mobile WhatsApp/Telegram-Style Layout
- **Bottom Navigation Bar**: Added a modern bottom nav bar for mobile devices with 5 key sections:
  -  Chats
  -  Communities
  -  Groups
  -  Friends
  -  Settings
- **Full-Screen Chat Area**: Mobile phones now show chat in full screen with all controls accessible
- **Responsive Sidebar**: Sidebars slide in from left with overlay backdrop on mobile
- **Touch-Optimized**: All buttons and controls properly sized for mobile interaction
- **No More Hidden Controls**: All features (messages, communities, left panel options) now visible on phone

##  Call Stability Improvements

### TURN Server Integration
- **Added Public TURN Servers**: Integrated openrelay.metered.ca TURN servers for better NAT traversal
- **Multiple Connectivity Options**:
  - TCP on port 443
  - UDP on port 80
  - TCP fallback for restricted networks
- **Mobile Network Support**: Calls now work reliably on mobile carrier networks
- **15-Second Grace Period**: Calls don't disconnect immediately on network hiccups
- **Visual Feedback**: Shows "Connection unstable, trying to reconnect..." during temporary disconnections
- **ICE Candidate Pool**: Increased to 10 for faster connection establishment

### Enhanced Call States
- **Connected Notification**: Shows "Call connected!" when peer-to-peer link established
- **Reconnection Logic**: Automatic reconnection attempts during brief disconnects
- **Better Error Messages**: Clear feedback when calls fail vs. temporary network issues

##  Pinned Chats Feature

### Pin Your Important Conversations
- **Pin/Unpin Button**: New thumbtack button in chat header to pin/unpin current chat
- **Visual Indicators**: 
  - Pinned chats show with colored background
  - Blue left border on pinned items
  - Thumbtack icon beside pinned chat name
- **Pinned Section**: Separate " PINNED" section at top of chat list
- **Persistent**: Pins saved to localStorage and survive app restarts
- **Works For All Chat Types**: Pin DMs, communities, and groups

##  Clickable Notifications

### Navigate Directly from Notifications
- **Click to Open Chat**: Tap any notification to jump directly to that conversation
- **Works on Desktop & Mobile**: Consistent experience across devices
- **Visual Cue**: Notifications show "Click to open" hint
- **Auto-Close Sidebars**: On mobile, tapping notification opens chat and closes any open modals
- **Context-Aware**: Different notification types (DM, community, group) open the correct chat view

### Notification Types
- **DM Notifications**: "New message from [friend]: [preview]" - click to open DM
- **Community Notifications**: "New message in Community '[name]' from [user]: [preview]"
- **Group Notifications**: "New message in Group '[name]' from [user]: [preview]"

## Horizontal Reactions Layout

### Better Reaction Display
- **Horizontal Alignment**: Reactions now flow left-to-right instead of stacking vertically
- **Proper Wrapping**: Reactions wrap to next line when needed
- **Better Spacing**: 6px gap between reaction items for cleaner look
- **Touch-Friendly**: Larger tap targets on mobile devices

##  Community Roles System (Basic)

### Role Foundation
- **Leader Role**: Community creator/admin designation (future backend support)
- **Member Role**: Regular community participant
- **Visual Role Indicators**: Role badges beside usernames (placeholder)
- **Permissions Framework**: Groundwork for role-based permissions:
  - Leaders can change community name/image (future)
  - Leaders can assign/remove member roles (future)
  - Members have standard chat permissions

*Note: Full role system requires backend implementation - this version provides the UI foundation*

##  Enhanced UI & Navigation

### Visual Improvements
- **Smoother Transitions**: Better animations for sidebar open/close
- **hover Effects**: Enhanced hover states on all interactive elements
- **Mobile-Optimized Header**: Compact header on phones with essential buttons only
- **Better Contrast**: Improved text readability in all themes
- **Consistent Spacing**: Unified padding and margins across the app

### Navigation Enhancements
- **Sidebar Overlay**: Dark overlay when sidebar open on mobile (tap to close)
- **Auto-Close Menus**: Modals and sidebars auto-close when opening chat on mobile
- **Breadcrumb-Style Headers**: Chat headers now clearly show the context
- **Faster Chat Switching**: Optimized chat loading and switching performance

##  Bug Fixes

### Mobile Fixes
- Fixed: Messages container now properly scrollable on all mobile devices
- Fixed: Input area stays accessible above mobile keyboard
- Fixed: Bottom nav doesn't cover chat input
- Fixed: Proper viewport height calculation (100dvh support)
- Fixed: Touch scrolling on iOS devices

### Call Fixes
- Fixed: Calls disconnecting after 5-10 seconds on mobile
- Fixed: "Failed" state triggers too quickly on network fluctuations
- Fixed: Users couldn't hear each other (remains from v2.2.4 fix)
- Fixed: Connection state not properly tracked during handshake

### UI Fixes
- Fixed: Pin button state updates when switching chats
- Fixed: Notification sounds play on correct events
- Fixed: Mobile sidebar animation glitches
- Fixed: React list overflow on narrow screens

## 📊 Technical Details

### Version Info
- **Frontend**: v2.2.5
- **Backend**: v2.2.5 (auto-reads from package.json)
- **Cache Buster**: Updated to prevent old JS/CSS caching

### Browser Compatibility
- Chrome/Edge (Desktop & Mobile)
- Firefox (Desktop & Mobile)
-  Safari/iOS Safari
- Samsung Internet
- Opera Mobile

### Mobile Breakpoints
- **< 480px**: Full mobile mode with bottom nav
- **480-768px**: Tablet mode with collapsible sidebar
- **> 768px**: Desktop mode with persistent sidebars

## Deployment Notes

### Update Steps
1. ` git pull` or download latest code
2. `npm install` (no new dependencies)
3. `npm run dev` for local testing
4. `railway up` or your deployment command for production

### Rollback Plan
- Previous stable: v2.2.4
- To rollback: `git checkout v2.2.4` or restore backup

## Known Limitations

### Current Version
- Community roles are UI-only (backend integration pending)
- Role permissions not enforced server-side
- TURN servers are public (consider private TURN for production)
- Desktop notifications require user permission grant
- Some features may need manual localStorage clear if upgrading from older versions

### Future Enhancements
- Server-side role management
- Database-backed community metadata
- Private TURN server option
- Push notifications for mobile browsers
- Community/group image upload
- Advanced role permissions (kick, mute, ban)
- Community settings panel in UI

## Testing Recommendations

### Critical Tests
1. **Mobile Layout**: Open on actual phone, verify all buttons visible
2. **Video Calls**: Test mobile-to-mobile call for 1+ minute
3. **Pinned Chats**: Pin several chats, close app, reopen - pins should persist
4. **Notifications**: Send message while in different chat, click notification
5. **Reactions**: Add multiple reactions to message, verify horizontal layout
6. **Bottom Nav**: Tap each nav item on mobile, ensure sections open correctly

### Test Accounts
- Recommended: Test with 2 phone accounts on different networks (WiFi + mobile data)
- Test video calls both on same WiFi and across networks
- Test notifications on both locked and unlocked screens

## Support

If you encounter issues:
1. Check browser console for errors (F12)
2. Clear localStorage: `localStorage.clear()` in console
3. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. Check network tab for failed requests
5. Verify WebRTC support: https://test.webrtc.org/

---

**Enjoy the new mobile-friendly experience! **
