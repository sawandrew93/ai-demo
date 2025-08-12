#!/bin/bash

# SSL Certificate Renewal Fix Script
# This script handles port 80 conflicts during certificate renewal

echo "🔧 Fixing SSL certificate renewal..."

# Stop services that might be using port 80
echo "⏹️ Stopping services..."
sudo systemctl stop nginx
sudo systemctl stop apache2 2>/dev/null || true

# Wait a moment for ports to be released
sleep 2

# Check what's still using port 80
echo "🔍 Checking port 80 usage..."
sudo lsof -i :80 || echo "Port 80 is free"

# Renew certificates
echo "🔄 Renewing certificates..."
sudo certbot renew --force-renewal

# Restart nginx
echo "🚀 Restarting nginx..."
sudo systemctl start nginx
sudo systemctl status nginx --no-pager -l

echo "✅ SSL renewal fix complete!"