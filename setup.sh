#!/bin/bash
echo "Setting up AI Demo environment..."

# Stop existing containers
docker-compose down

# Rebuild and start
docker-compose up --build -d

echo "Setup complete! Access your app at:"
echo "- Home page: http://localhost:8080"
echo "- Agent login: http://localhost:8080/agent"
echo "- Knowledge base: http://localhost:8080/knowledge-base"
echo ""
echo "Default login credentials:"
echo "- Username: admin, Password: Admin123!"
echo "- Username: saw.andrew, Password: Agent123!"
echo "- Username: blaze.hein, Password: Agent123!"