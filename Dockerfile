FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm install instead of npm ci)
RUN npm install --production

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads temp

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
