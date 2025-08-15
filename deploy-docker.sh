#!/bin/bash

# Docker deployment script for AI Demo

echo "🚀 Starting Docker deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create one based on .env.example"
    exit 1
fi

# Stop and remove existing container
echo "🛑 Stopping existing container..."
docker-compose down

# Build and start the application
echo "🔨 Building and starting application..."
docker-compose up --build -d

# Wait for application to start
echo "⏳ Waiting for application to start..."
sleep 10

# Check if application is healthy
echo "🔍 Checking application health..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Application is running successfully!"
    echo "🌐 Access your application at: http://localhost:3000"
    echo "👤 Agent dashboard: http://localhost:3000/agent"
    echo "📚 Knowledge base: http://localhost:3000/knowledge-base"
else
    echo "❌ Application health check failed"
    echo "📋 Checking logs..."
    docker-compose logs --tail=20
    exit 1
fi

echo "🎉 Deployment completed successfully!"