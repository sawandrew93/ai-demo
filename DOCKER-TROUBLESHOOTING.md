# Docker Deployment Troubleshooting Guide

## Common Issues and Solutions

### 1. WebSocket "Reconnecting" Issue

**Problem**: AI chat shows "reconnecting" status when deployed as Docker image.

**Root Cause**: WebSocket URL configuration issues in containerized environment.

**Solutions Applied**:
- ✅ Fixed WebSocket URL construction to use same port as web page
- ✅ Added proper health checks to Docker container
- ✅ Implemented graceful shutdown handling
- ✅ Added environment validation

### 2. Environment Variables

**Problem**: Missing or incorrect environment variables.

**Solution**: 
```bash
# Copy and configure environment file
cp .env.example .env
# Edit .env with your actual values
```

**Required Variables**:
- `GEMINI_API_KEY` - Your Google Gemini API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Your Supabase service key
- `JWT_SECRET` - Random 256-bit secret for JWT tokens

### 3. Port Configuration

**Problem**: WebSocket connections fail due to port mismatches.

**Solution**: The application now automatically detects the correct port from the current page URL.

### 4. Docker Health Checks

**Problem**: Container appears running but application is not responding.

**Solution**: Added comprehensive health checks:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const options = { hostname: 'localhost', port: 3000, path: '/health', timeout: 5000 }; const req = http.request(options, (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.end();"
```

## Deployment Steps

### Using Docker Compose (Recommended)

1. **Prepare environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Deploy**:
   ```bash
   chmod +x deploy-docker.sh
   ./deploy-docker.sh
   ```

3. **Verify deployment**:
   ```bash
   curl http://localhost:3000/health
   ```

### Manual Docker Commands

1. **Build image**:
   ```bash
   docker build -t ai-demo .
   ```

2. **Run container**:
   ```bash
   docker run -d \
     --name ai-demo \
     -p 3000:3000 \
     --env-file .env \
     -v $(pwd)/uploads:/app/uploads \
     ai-demo
   ```

## Debugging Commands

### Check container logs
```bash
docker-compose logs -f
```

### Check container health
```bash
docker-compose ps
```

### Access container shell
```bash
docker-compose exec ai-demo sh
```

### Test WebSocket connection
```bash
# From browser console
const ws = new WebSocket('ws://localhost:3000');
ws.onopen = () => console.log('Connected');
ws.onerror = (e) => console.error('Error:', e);
```

## Performance Optimization

### Memory Usage
The application is optimized for low-resource environments:
- Memory limit: 256MB in production
- Efficient WebSocket connection pooling
- Automatic cleanup of idle connections

### Connection Stability
- Automatic reconnection with exponential backoff
- Health monitoring with ping/pong
- Graceful handling of container restarts

## Monitoring

### Health Endpoint
```bash
curl http://localhost:3000/health
```

Response should include:
```json
{
  "status": "OK",
  "agents": 0,
  "queue": 0,
  "conversations": 0,
  "activeAgents": 0,
  "activeSessions": 0
}
```

### WebSocket Status
Check browser developer tools Network tab for WebSocket connections.

## Common Error Messages

### "Connection lost - attempting to reconnect..."
- **Cause**: WebSocket connection dropped
- **Solution**: Should auto-reconnect. If persistent, check server logs.

### "Failed to reconnect. Please refresh the page."
- **Cause**: Multiple reconnection attempts failed
- **Solution**: Refresh page or restart container

### "No token provided" or "Invalid token"
- **Cause**: JWT authentication issues
- **Solution**: Check JWT_SECRET in environment variables

## Production Considerations

1. **Reverse Proxy**: Use Nginx or similar for HTTPS termination
2. **Load Balancing**: Consider sticky sessions for WebSocket connections
3. **Database**: Ensure Supabase connection is stable
4. **Monitoring**: Set up application monitoring and alerting
5. **Backups**: Regular backup of uploads directory and database

## Support

If issues persist:
1. Check all environment variables are correctly set
2. Verify Supabase connection and permissions
3. Check Docker container logs for specific error messages
4. Test WebSocket connection manually from browser console