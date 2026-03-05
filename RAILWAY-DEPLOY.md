# Deploying to Railway

This guide will help you deploy your Discord-like chat app to Railway for free hosting.

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Node.js and Git installed locally

## Step 1: Push Your Code to GitHub

1. **Create a new repository on GitHub**
   - Go to https://github.com/new
   - Create a repository called `discord-chat-app`
   - Don't add README, .gitignore, or license

2. **Push your local code**
   ```powershell
   # Initialize git if not already done
   git init
   
   # Add all files
   git add .
   
   # Commit
   git commit -m "Initial commit: Discord-like chat app"
   
   # Add remote (replace USERNAME with your GitHub username)
   git remote add origin https://github.com/USERNAME/discord-chat-app.git
   
   # Push to GitHub
   git branch -M main
   git push -u origin main
   ```

## Step 2: Set Up MongoDB Atlas (Cloud Database)

1. **Create MongoDB Atlas account**
   - Go to https://www.mongodb.com/cloud/atlas
   - Sign up and verify email
   - Create an organization (any name)
   - Create a project (e.g., "chat-app")

2. **Create a cluster**
   - Choose "Build a Database"
   - Select the free tier (M0 Sandbox)
   - Choose a cloud provider and region (AWS us-east-1 recommended)
   - Click "Create" and wait a few minutes

3. **Create a database user**
   - Go to "Database Access" in left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Username: `chatapp`
   - Password: Create a strong password (save it!)
   - Default Privileges: "Read and write to any database"
   - Click "Add User"

4. **Allow network access**
   - Go to "Network Access" in left sidebar
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (for Railway)
   - Or add `0.0.0.0/0`
   - Click "Confirm"

5. **Get your connection string**
   - Go to "Databases" and click "Connect"
   - Choose "Drivers"
   - Select Node.js driver
   - Copy the connection string
   - Example: `mongodb+srv://chatapp:password@cluster0.xxxxx.mongodb.net/discord-app?retryWrites=true&w=majority`

## Step 3: Set Up Railway Project

1. **Log in to Railway**
   - Go to https://railway.app
   - Click "Login"
   - Authorize with GitHub

2. **Create new project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Search for your repository
   - Select your `discord-chat-app` repo
   - Click "Deploy Now"

3. **Wait for build**
   - Railway will automatically build and deploy
   - This takes 2-3 minutes
   - You can see logs in real-time

## Step 4: Configure Environment Variables

1. **Add environment variables in Railway**
   - After deployment, click on your service
   - Go to "Variables" tab
   - Add the following variables:

   ```
   NODE_ENV=production
   PORT=3000
   MONGODB_URI=mongodb+srv://chatapp:PASSWORD@cluster0.xxxxx.mongodb.net/discord-app?retryWrites=true&w=majority
   JWT_SECRET=your_secret_key_here_make_it_long_and_random_12345
   CORS_ORIGIN=*
   ```

   Replace:
   - `PASSWORD` with your MongoDB password
   - `cluster0.xxxxx` with your actual MongoDB cluster
   - `your_secret_key_here_make_it_long_and_random_12345` with a random string (generate one at https://randomkeygen.com/)

2. **Save variables**
   - Railway automatically redeploys when variables change
   - Wait for deployment to complete

## Step 5: Get Your Live URL

1. **Find your deployment URL**
   - In Railway dashboard, click on your service
   - Look for "Deployments" tab
   - Your URL will be something like: `your-app-xxxx.railway.app`
   - Copy this URL

2. **Test your app**
   - Open `https://your-app-xxxx.railway.app` in browser
   - You should see the login page
   - Register an account and test features

## Step 6: Phone Testing on Same WiFi

See [PHONE-TESTING.md](PHONE-TESTING.md) for instructions on testing with your phone.

## Troubleshooting

### App stuck in building
- Check logs in Railway dashboard
- Make sure `package.json` has a valid `scripts.start` command
- Verify `server.js` exists in project root

### MongoDB connection error
- Double-check connection string in MongoDB Atlas
- Verify IP address is allowed in Network Access
- Confirm password is correct (special characters need URL encoding)

### Port already in use
- Railway automatically assigns ports
- Don't hardcode port in `.listen()` - use `process.env.PORT || 3000`

### CORS errors
- Set `CORS_ORIGIN=*` in environment variables
- Or set it to your specific domain

## Production Tips

1. **Keep your JWT_SECRET secure** - change it if deployed accidentally publicly
2. **Monitor MongoDB usage** - free tier has 5GB storage
3. **Enable Railway notifications** - get alerts for deployment failures
4. **Keep sensitive data in environment variables**, never in code
5. **Use HTTPS** - Railway provides free SSL certificates

## Updating Your App

To deploy new changes:

```powershell
# Make your changes locally
# Then commit and push to GitHub

git add .
git commit -m "Add new feature"
git push

# Railway automatically deploys on GitHub push
# Check the Deployments tab to see status
```

## Support & Resources

- Railway Docs: https://docs.railway.app
- MongoDB Atlas: https://docs.atlas.mongodb.com
- Node.js Deployment: https://nodejs.org/en/docs/guides/nodejs-web-app-without-framework/
