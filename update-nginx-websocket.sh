#!/bin/bash

# Update Nginx configuration for WebSocket support
echo "🔧 Updating Nginx configuration for WebSocket support..."

# Replace yourdomain.com with actual domain
DOMAIN="aidemo.sapb1mm.com"

# Create temporary file with domain replacement
cp nginx-setup.conf /tmp/nginx-temp.conf
sed -i "s/yourdomain.com/$DOMAIN/g" /tmp/nginx-temp.conf

# Copy to nginx sites-available
sudo cp /tmp/nginx-temp.conf /etc/nginx/sites-available/$DOMAIN

# Remove default site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

# Enable the site
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Test nginx configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration is valid"
    
    # Reload nginx
    echo "🔄 Reloading Nginx..."
    sudo systemctl reload nginx
    
    echo "✅ Nginx reloaded successfully!"
    echo "🌐 WebSocket connections should now work properly"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

# Clean up
rm -f /tmp/nginx-temp.conf