# AWS App Runner Deployment Guide

## Prerequisites
- Docker installed
- Docker Hub account
- AWS account with App Runner access

## Step-by-Step Deployment

### 1. Prepare Docker Image
```bash
# Make deployment script executable
chmod +x deploy-apprunner.sh

# Build and push image (replace 'yourusername' with your Docker Hub username)
./deploy-apprunner.sh yourusername
```

### 2. Create App Runner Service

1. Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner)
2. Click "Create service"
3. Choose "Container registry" → "Docker Hub"
4. Enter image URI: `yourusername/ai-demo:latest`
5. Set deployment trigger to "Manual"

### 3. Configure Service Settings

**Service name:** `ai-demo-service`
**Port:** `3000`
**CPU:** `1 vCPU`
**Memory:** `2 GB`

### 4. Environment Variables

Add these in App Runner console:
```
NODE_ENV=production
GEMINI_API_KEY=your_gemini_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
JWT_SECRET=your_jwt_secret
ADMIN_PASSWORD=your_admin_password
AGENT1_PASSWORD=your_agent1_password
AGENT2_PASSWORD=your_agent2_password
```

### 5. Deploy
Click "Create & deploy" - App Runner will:
- Pull your Docker image
- Deploy automatically
- Provide a public URL

## Updates
To update your app:
1. Run `./deploy-apprunner.sh yourusername` again
2. Go to App Runner console → "Deploy" to trigger new deployment

## Cost Estimate
- ~$25-50/month for basic usage
- Auto-scales based on traffic
- Pay only for what you use