#!/bin/bash

# Complete deployment script for new Ubuntu server
# Usage: ./deploy-new-server.sh yourdomain.com

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Domain parameter is required"
    echo "Usage: ./deploy-new-server.sh yourdomain.com"
    exit 1
fi

DOMAIN=$1
APP_DIR="/home/ubuntu/ai-demo"

echo "🚀 Starting deployment for domain: $DOMAIN"

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install Certbot for SSL
echo "📦 Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Clone repository
echo "📥 Cloning repository..."
if [ -d "$APP_DIR" ]; then
    cd $APP_DIR
    git pull origin feature-update
else
    git clone https://github.com/sawandrew93/ai-demo.git $APP_DIR
    cd $APP_DIR
    git checkout feature-update
fi

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Setup environment file
echo "⚙️ Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "🔧 Please edit .env file with your actual values:"
    echo "   - GEMINI_API_KEY"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_ANON_KEY"
    echo "   - SUPABASE_SERVICE_KEY"
    echo "   - JWT_SECRET"
    echo "   - ADMIN_PASSWORD"
    echo "   - AGENT1_PASSWORD"
    echo "   - AGENT2_PASSWORD"
    echo ""
    echo "Press Enter when done editing .env file..."
    read -p ""
fi

# Setup Nginx
echo "🌐 Configuring Nginx..."
./setup-nginx.sh $DOMAIN

# Setup SSL
echo "🔒 Setting up SSL certificate..."
./setup-ssl.sh $DOMAIN

# Start application with PM2
echo "🚀 Starting application..."
pm2 delete ai-demo 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "✅ Deployment complete!"
echo "🌐 Your application should be available at: https://$DOMAIN"
echo ""
echo "Next steps:"
echo "1. Verify your .env file has correct values"
echo "2. Check PM2 status: pm2 status"
echo "3. Check Nginx status: sudo systemctl status nginx"
echo "4. View logs: pm2 logs ai-demo"