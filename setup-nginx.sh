#!/bin/bash

# Nginx setup script
# Usage: sudo ./setup-nginx.sh yourdomain.com

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Domain parameter is required"
    echo "Usage: sudo ./setup-nginx.sh yourdomain.com"
    exit 1
fi

DOMAIN=$1

echo "🌐 Setting up Nginx for domain: $DOMAIN"

# Create Nginx configuration
sudo tee /tmp/nginx-site.conf > /dev/null << EOF
# WebSocket upgrade mapping (must be at http level)
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL configuration (Certbot will modify these paths)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Main application with WebSocket support
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket headers
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$server_name;
        proxy_set_header X-Forwarded-Port \$server_port;

        # WebSocket timeouts
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 60s;

        # Disable buffering for WebSocket
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Install the configuration
sudo cp /tmp/nginx-site.conf /etc/nginx/sites-available/$DOMAIN

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Enable the site
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Test configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    sudo systemctl reload nginx
    echo "✅ Nginx reloaded successfully"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

# Clean up
rm -f /tmp/nginx-site.conf

echo "✅ Nginx setup complete for $DOMAIN"