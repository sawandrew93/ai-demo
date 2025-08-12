#!/bin/bash

# SSL setup script with Let's Encrypt
# Usage: sudo ./setup-ssl.sh yourdomain.com

set -e

DOMAIN=${1:-"yourdomain.com"}

echo "🔒 Setting up SSL certificate for domain: $DOMAIN"

# Stop services that might use port 80
echo "⏹️ Temporarily stopping services..."
sudo systemctl stop nginx 2>/dev/null || true

# Wait for ports to be released
sleep 2

# Check if certificate already exists
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "📜 Certificate already exists, renewing..."
    sudo certbot renew --force-renewal
else
    echo "📜 Obtaining new SSL certificate..."
    sudo certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email admin@$DOMAIN \
        -d $DOMAIN \
        -d www.$DOMAIN
fi

# Start nginx
echo "🚀 Starting Nginx..."
sudo systemctl start nginx

# Enable auto-renewal
echo "⏰ Setting up auto-renewal..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal
echo "🧪 Testing certificate renewal..."
sudo certbot renew --dry-run

echo "✅ SSL setup complete!"
echo "🌐 Your site should now be available at https://$DOMAIN"