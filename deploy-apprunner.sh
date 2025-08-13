#!/bin/bash

# AWS App Runner Deployment Script
# Usage: ./deploy-apprunner.sh your-docker-username

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Docker username is required"
    echo "Usage: ./deploy-apprunner.sh your-docker-username"
    exit 1
fi

DOCKER_USERNAME=$1
IMAGE_NAME="ai-demo"
TAG="latest"
FULL_IMAGE_NAME="$DOCKER_USERNAME/$IMAGE_NAME:$TAG"

echo "🚀 Starting AWS App Runner deployment..."
echo "📦 Image: $FULL_IMAGE_NAME"

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t $FULL_IMAGE_NAME .

# Push to Docker Hub
echo "📤 Pushing to Docker Hub..."
docker push $FULL_IMAGE_NAME

echo "✅ Docker image pushed successfully!"
echo ""
echo "🌐 Next steps:"
echo "1. Go to AWS App Runner console"
echo "2. Create new service"
echo "3. Use container image: $FULL_IMAGE_NAME"
echo "4. Set environment variables in App Runner console"
echo ""
echo "Required environment variables:"
echo "- GEMINI_API_KEY"
echo "- SUPABASE_URL" 
echo "- SUPABASE_ANON_KEY"
echo "- SUPABASE_SERVICE_KEY"
echo "- JWT_SECRET"
echo "- ADMIN_PASSWORD"
echo "- AGENT1_PASSWORD"
echo "- AGENT2_PASSWORD"