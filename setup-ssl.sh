#!/bin/bash

# SSL setup script with Let's Encrypt
# Usage: sudo ./setup-ssl.sh yourdomain.com

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Domain parameter is required"
    echo "Usage: sudo ./setup-ssl.sh yourdomain.com"
    exit 1
fi

DOMAIN=$1

echo "🔒 Setting up SSL certificate for domain: $DOMAIN"

# Check if certificate already exists
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "📜 Certificate already exists, renewing..."
    sudo certbot renew --force-renewal
else
    echo "📜 Obtaining SSL certificate and configuring Nginx..."
    sudo certbot --nginx \
        --non-interactive \
        --agree-tos \
        --email admin@$DOMAIN \
        -d $DOMAIN
fi

# Enable auto-renewal
echo "⏰ Setting up auto-renewal..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# notify 
echo "✅ SSL setup complete!"
echo "🌐 Your site should now be available at https://$DOMAIN"
