# Phone Testing Guide

This guide explains how to test your Discord-like chat app on your phone during development and after deployment.

## Option 1: Local Network Testing (Same WiFi)

Use this to test your app during development while running on your PC.

### Prerequisites
- Your PC and phone must be on the **same WiFi network**
- Your development server must be running (`npm start`)

### Steps

1. **Find Your PC's Local IP Address**

   **On Windows:**
   - Open PowerShell
   - Run:
     ```powershell
     ipconfig
     ```
   - Look for "IPv4 Address" under your WiFi adapter
   - It will look like: `192.168.x.x` or `10.x.x.x`
   - Example: `192.168.1.100`
   - **Note the IP address**

2. **Access Your App on Phone**

   - On your phone, open any browser (Chrome, Safari, Edge)
   - In the address bar, type:
     ```
     http://YOUR_PC_IP:3000
     ```
   - Replace `YOUR_PC_IP` with your actual IP (e.g., `http://192.168.1.100:3000`)
   - Press Enter

3. **Test the App**

   - You should see the login page
   - Register a new account
   - Test all features:
     - Send messages
     - Upload photos/videos
     - Change profile picture
     - Add friends
     - Buy shop items
     - Check online status

### Troubleshooting Local Testing

**"Can't connect to server"**
- Ensure PC and phone are on same WiFi
- Check firewall isn't blocking port 3000:
  ```powershell
  netstat -ano | findstr :3000
  ```
- Restart your development server

**"Page won't load but shows connection error"**
- Verify the IP address is correct:
  - Run `ipconfig` again and double-check
  - Try pinging your PC from phone: `ping YOUR_PC_IP`
  
**"Connection to localhost:3000 failed"**
- Make sure you're using your IP address, NOT `localhost`
- `localhost` only works on the same device

## Option 2: Testing Your Live Railway App

Once deployed to Railway, test from anywhere (including mobile data).

### Steps

1. **Get Your Railway URL**
   - Go to Railway dashboard
   - Click on your app service
   - Copy the URL (looks like: `your-app-abc123.railway.app`)

2. **Access on Phone**
   - Open browser on any phone
   - Type: `https://your-app-abc123.railway.app`
   - Register and test

### Benefits
- Works on mobile data (not just WiFi)
- Works on any network worldwide
- No need for PC to be running

## Option 3: Using ngrok (Advanced)

Use ngrok if you want a public URL for your local server without deploying to Railway.

### Steps

1. **Download ngrok**
   - Go to https://ngrok.com/download
   - Download for Windows
   - Extract the file

2. **Connect ngrok (need account)**
   - Sign up at https://ngrok.com
   - Get your auth token
   - Open PowerShell in ngrok folder
   - Run: `.\ngrok config add-authtoken YOUR_TOKEN`

3. **Start ngrok**
   - Make sure your server is running (`npm start`)
   - In new PowerShell window, run:
     ```powershell
     .\ngrok http 3000
     ```
   - You'll see a URL like: `https://1a2b3c4d5e6f.ngrok.io`

4. **Test from Phone**
   - Open browser on phone
   - Type: `https://1a2b3c4d5e6f.ngrok.io`
   - It will work anywhere!

## Phone Testing Checklist

- [ ] Registration works
- [ ] Login works  
- [ ] Can see profile
- [ ] Can update username and bio
- [ ] Can upload profile picture
- [ ] Can add friends
- [ ] Can accept friend requests
- [ ] Can send messages to friends (shows in their chat)
- [ ] Can send images/videos
- [ ] Messages display correctly on phone
- [ ] Can scroll through messages
- [ ] Profile picture shows in messages
- [ ] Shop items display
- [ ] Can buy shop items
- [ ] Coins display and decrease
- [ ] Inventory shows purchased items
- [ ] Online/offline status updates
- [ ] Can logout and login again

## Performance Tips for Phone Testing

1. **Responsive Design**
   - Test on different phone sizes
   - Check if layout breaks on small screens
   - Try in portrait and landscape mode

2. **Network Speed**
   - Test on slower WiFi to simulate mobile data
   - See how app handles slow connections
   - Check if media uploads are optimized

3. **Battery**
   - Socket.IO connections may drain battery
   - Test app doesn't stay connected when not active
   - Monitor background processes

## Mobile Optimization Tips

If you notice issues during phone testing:

1. **Scrolling feels slow**
   - See if messages container needs `overflow-y: auto`
   - Consider virtual scrolling for long message lists

2. **Images too large**
   - Compress images before upload
   - Resize images on client before sending

3. **Layout broken on small screens**
   - Add mobile media queries to CSS
   - Test with `max-width: 320px` for small phones

4. **Touchscreen issues**
   - Increase button sizes (at least 44x44px recommended)
   - Add `touch-action: manipulation` to avoid double-tap delays

## Example Testing Scenario

1. **On PC:**
   - Start development server: `npm start`
   - Find IP: `ipconfig` → note the IPv4 address
   - Example: `192.168.1.50`

2. **On Phone:**
   - WiFi should be same as PC
   - Open browser
   - Type: `http://192.168.1.50:3000`
   - See login page ✓

3. **User Story Testing:**
   - Register as "Alice" on PC
   - Register as "Bob" on phone
   - Alice sends friend request to Bob
   - Bob accepts on phone
   - Alice sends message on PC
   - Bob sees message on phone
   - Bob sends reply on phone
   - Alice sees reply on PC ✓

## Debugging Phone Issues

If something isn't working:

1. **Check browser console:**
   - On phone, open developer tools (long-press → Inspect)
   - Look for JavaScript errors
   - Report errors here when creating issues

2. **Check network tab:**
   - See if API calls are failing
   - Monitor WebSocket (Socket.IO) connection
   - Check response times for media uploads

3. **Try on different browser:**
   - Try Chrome, Safari, Edge, Firefox
   - Some features may have browser-specific issues

## Capture Feedback

When testing on phone, note:
- Do message timestamps make sense?
- Are buttons easy to tap?
- Does scrolling feel smooth?
- Are profile pictures showing?
- Do error messages help understand problems?

Document any issues and fix them in the web version!

## Next Steps

- After fixing issues found via phone testing, commit changes: `git add . && git commit -m "Fix mobile responsiveness"`
- Push to GitHub: `git push`
- Railway automatically redeploys
- Test again on phone to verify fixes
