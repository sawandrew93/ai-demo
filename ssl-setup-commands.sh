#!/bin/bash
# SSL Setup Commands for Ubuntu Server

echo "🔧 Installing Nginx and Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo "🔧 Setting up Nginx configuration..."
# Replace 'yourdomain.com' with your actual domain
sudo cp nginx-setup.conf /etc/nginx/sites-available/ai-demo
sudo ln -s /etc/nginx/sites-available/ai-demo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "🔧 Testing Nginx configuration..."
sudo nginx -t

echo "🔧 Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

echo "🔒 Getting SSL certificate..."
# Replace 'yourdomain.com' with your actual domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

echo "🔧 Testing auto-renewal..."
sudo certbot renew --dry-run

echo "✅ SSL setup complete!"
echo "Your site should now be available at https://yourdomain.com"