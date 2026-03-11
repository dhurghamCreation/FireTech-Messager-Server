#!/bin/bash


echo "🚀 Discord-Like Chat App - Quick Start"
echo "======================================"
echo ""


if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""


if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB not found in PATH"
    echo "   Make sure MongoDB is running separately!"
    echo "   Start MongoDB with: mongod"
    echo ""
fi

echo "📦 Step 1: Installing dependencies..."
npm install

echo ""
echo "🗄️  Step 2: Setting up database..."
echo "   Make sure MongoDB is running on localhost:27017"
echo "   Or update MONGODB_URI in .env file"
echo ""

echo "📝 Step 3: Configuration"
echo "   - Create/Update .env file"
echo "   - Set MongoDB connection string"
echo "   - Set JWT_SECRET for security"
echo ""

echo "🌱 Step 4: Initialize Database (optional)"
echo "   Run: npm run init-db"
echo "   This adds sample shop items"
echo ""

echo "🎮 Step 5: Start the server"
echo "   Development: npm run dev"
echo "   Production: npm start"
echo ""

echo "🌐 Step 6: Open browser"
echo "   Visit: http://localhost:3000"
echo ""

echo "======================================"
echo "✨ Setup complete! Follow the 5 steps above to get started."
echo ""
