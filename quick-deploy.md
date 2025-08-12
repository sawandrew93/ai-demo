# Quick Deployment Guide

## For New Ubuntu Server

### 1. One-Command Deployment
```bash
curl -fsSL https://raw.githubusercontent.com/sawandrew93/ai-demo/rollback-test/deploy-new-server.sh | bash -s yourdomain.com
```

### 2. Manual Step-by-Step

#### Initial Setup
```bash
# Clone repository
git clone https://github.com/sawandrew93/ai-demo.git
cd ai-demo
git checkout rollback-test

# Make scripts executable
chmod +x *.sh

# Run full deployment
./deploy-new-server.sh yourdomain.com
```

#### Configure Environment
```bash
# Copy and edit environment file
cp .env.example .env
nano .env
```

**Required .env variables:**
```
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
JWT_SECRET=your_random_jwt_secret_min_32_chars
ADMIN_PASSWORD=your_admin_password
AGENT1_PASSWORD=your_agent1_password
AGENT2_PASSWORD=your_agent2_password
NODE_ENV=production
```

#### Setup Database
```bash
./setup-database.sh
```

#### Individual Service Setup

**Nginx Only:**
```bash
sudo ./setup-nginx.sh yourdomain.com
```

**SSL Only:**
```bash
sudo ./setup-ssl.sh yourdomain.com
```

**Application Only:**
```bash
npm install
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. Verification Commands

```bash
# Check application status
pm2 status
pm2 logs ai-demo

# Check Nginx status
sudo systemctl status nginx
sudo nginx -t

# Check SSL certificate
sudo certbot certificates

# Test WebSocket connection
curl -I https://yourdomain.com

# Check logs
tail -f logs/combined.log
```

### 4. Troubleshooting

**WebSocket Issues:**
```bash
# Update Nginx WebSocket config
sudo ./update-nginx-websocket.sh
```

**SSL Issues:**
```bash
# Fix SSL renewal
sudo ./fix-ssl-renewal.sh
```

**Application Issues:**
```bash
# Restart application
pm2 restart ai-demo

# View detailed logs
pm2 logs ai-demo --lines 100
```

### 5. Maintenance Commands

```bash
# Update application
git pull origin rollback-test
npm install
pm2 restart ai-demo

# Renew SSL certificate
sudo certbot renew

# Check system resources
pm2 monit
```

## Domain Requirements

- Domain must point to your server's IP address
- Ports 80 and 443 must be open
- Server must have at least 1GB RAM
- Ubuntu 20.04+ recommended