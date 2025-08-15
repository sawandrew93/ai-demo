// Shared WebSocket service for maintaining agent connection across pages
class SharedWebSocketService {
    constructor() {
        this.ws = null;
        this.agentId = null;
        this.token = null;
        this.connectionStatus = 'disconnected';
        this.messageHandlers = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.isIntentionalClose = false;
        this.pingInterval = null;
        this.pongTimeout = null;
    }

    connect(agentId, token) {
        this.agentId = agentId;
        this.token = token;
        this.isIntentionalClose = false;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('SharedWebSocket: Already connected');
            // Send agent_join to ensure server knows we're still here
            this.ws.send(JSON.stringify({
                type: 'agent_join',
                agentId: this.agentId,
                token: this.token
            }));
            return;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.createConnection();
    }

    createConnection() {
        if (this.ws) {
            this.ws.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
        const wsUrl = `${protocol}//${hostname}${port && port !== '80' && port !== '443' ? ':' + port : ''}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('SharedWebSocket: Connected');
            this.connectionStatus = 'connected';
            this.reconnectAttempts = 0;
            
            // Send agent join message
            this.ws.send(JSON.stringify({
                type: 'agent_join',
                agentId: this.agentId,
                token: this.token
            }));

            this.notifyHandlers({
                type: 'connection_status',
                status: 'connected',
                message: 'Connected to server'
            });
            
            // Start health monitoring
            this.startHealthMonitoring();
        };

        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                
                // Handle pong response
                if (data.type === 'pong') {
                    if (this.pongTimeout) {
                        clearTimeout(this.pongTimeout);
                        this.pongTimeout = null;
                    }
                    return;
                }
                
                this.notifyHandlers(data);
            } catch (error) {
                console.error('SharedWebSocket: Error parsing message:', error);
            }
        };

        this.ws.onclose = (e) => {
            console.log('SharedWebSocket: Connection closed', e.code, e.reason);
            this.connectionStatus = 'disconnected';

            if (this.isIntentionalClose) {
                console.log('SharedWebSocket: Intentional close, not reconnecting');
                return; // Don't reconnect if intentionally closed
            }

            if (e.code === 1000 || e.code === 1001) {
                // Normal closure or going away (page navigation)
                console.log('SharedWebSocket: Normal closure, not reconnecting');
                this.notifyHandlers({
                    type: 'connection_status',
                    status: 'disconnected',
                    message: 'Connection closed'
                });
                return;
            }

            // Only reconnect for unexpected closures
            if (e.code !== 1005 && e.code !== 1006) {
                console.log('SharedWebSocket: Unexpected closure, attempting reconnect');
                this.notifyHandlers({
                    type: 'connection_status',
                    status: 'reconnecting',
                    message: 'Connection lost - attempting to reconnect...'
                });
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (err) => {
            console.error('SharedWebSocket: Error:', err);
        };
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('SharedWebSocket: Max reconnect attempts reached');
            this.notifyHandlers({
                type: 'connection_status',
                status: 'failed',
                message: 'Failed to reconnect. Please refresh the page.'
            });
            return;
        }

        this.reconnectAttempts++;
        console.log(`SharedWebSocket: Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        setTimeout(() => {
            if (!this.isIntentionalClose && this.agentId && this.token) {
                console.log('SharedWebSocket: Attempting to reconnect...');
                this.createConnection();
            }
        }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    addMessageHandler(handler) {
        this.messageHandlers.add(handler);
    }

    removeMessageHandler(handler) {
        this.messageHandlers.delete(handler);
    }

    notifyHandlers(data) {
        // Handle notifications globally first
        if (window.sharedNotifications) {
            window.sharedNotifications.handleMessage(data);
        }
        
        // Then notify page-specific handlers
        this.messageHandlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error('SharedWebSocket: Handler error:', error);
            }
        });
    }

    disconnect() {
        this.isIntentionalClose = true;
        this.stopHealthMonitoring();
        if (this.ws) {
            this.ws.close();
        }
        this.messageHandlers.clear();
        this.agentId = null;
        this.token = null;
    }
    
    startHealthMonitoring() {
        this.stopHealthMonitoring();
        
        // Send ping every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
                
                // Set timeout for pong response
                this.pongTimeout = setTimeout(() => {
                    console.log('SharedWebSocket: Pong timeout, connection may be dead');
                    if (this.ws) {
                        this.ws.close();
                    }
                }, 10000); // 10 second timeout
            }
        }, 30000);
    }
    
    stopHealthMonitoring() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
        }
    }

    getConnectionStatus() {
        return this.connectionStatus;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Create global instance
window.sharedWebSocket = new SharedWebSocketService();

// Handle page navigation - don't close connection
window.addEventListener('beforeunload', function(e) {
    if (window.sharedWebSocket && window.sharedWebSocket.isConnected()) {
        console.log('SharedWebSocket: Page navigating, keeping connection alive');
        // Don't mark as intentional close for navigation
        window.sharedWebSocket.send({
            type: 'agent_navigating',
            agentId: window.sharedWebSocket.agentId
        });
    }
});

// Reconnect when page becomes visible (but not on every focus)
let reconnectTimeout = null;
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.sharedWebSocket) {
        // Clear any pending reconnect
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        
        // Only reconnect if truly disconnected and we have credentials
        if (!window.sharedWebSocket.isConnected()) {
            const token = localStorage.getItem('agentToken');
            if (token && window.sharedWebSocket.agentId) {
                console.log('SharedWebSocket: Page visible, reconnecting...');
                // Reset intentional close flag
                window.sharedWebSocket.isIntentionalClose = false;
                window.sharedWebSocket.reconnectAttempts = 0;
                
                // Delay reconnection slightly to avoid rapid reconnects
                reconnectTimeout = setTimeout(() => {
                    window.sharedWebSocket.connect(window.sharedWebSocket.agentId, token);
                }, 500);
            }
        }
    }
});