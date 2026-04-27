#!/bin/bash
echo "========================================="
echo "  WeChatSim v5.0 Installer"
echo "========================================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "Node.js version: $(node -v)"
echo "npm version: $(npm -v)"

# Create directories
mkdir -p data/uploads public

# Install dependencies
echo "Installing dependencies..."
npm install

# Set permissions
chmod +x server.js

echo ""
echo "========================================="
echo "  Installation complete!"
echo "  Run: npm start"
echo "  Then open: http://YOUR_IP:3777"
echo "========================================="
