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
    }

    connect(agentId, token) {
        this.agentId = agentId;
        this.token = token;
        this.isIntentionalClose = false;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return; // Already connected
        }

        this.createConnection();
    }

    createConnection() {
        if (this.ws) {
            this.ws.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        const wsUrl = window.location.protocol === 'https:' 
            ? `${protocol}//${hostname}` 
            : `${protocol}//${hostname}:3000`;

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
        };

        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                this.notifyHandlers(data);
            } catch (error) {
                console.error('SharedWebSocket: Error parsing message:', error);
            }
        };

        this.ws.onclose = (e) => {
            console.log('SharedWebSocket: Connection closed', e.code, e.reason);
            this.connectionStatus = 'disconnected';

            if (this.isIntentionalClose) {
                return; // Don't reconnect if intentionally closed
            }

            if (e.code === 1000) {
                // Normal closure, likely logout
                this.notifyHandlers({
                    type: 'connection_status',
                    status: 'disconnected',
                    message: 'Logged out'
                });
                return;
            }

            // Attempt to reconnect
            this.notifyHandlers({
                type: 'connection_status',
                status: 'reconnecting',
                message: 'Connection lost - attempting to reconnect...'
            });

            this.attemptReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('SharedWebSocket: Error:', err);
        };
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.notifyHandlers({
                type: 'connection_status',
                status: 'failed',
                message: 'Failed to reconnect. Please refresh the page.'
            });
            return;
        }

        this.reconnectAttempts++;
        setTimeout(() => {
            if (!this.isIntentionalClose) {
                this.createConnection();
            }
        }, this.reconnectDelay);
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
        if (this.ws) {
            this.ws.close();
        }
        this.messageHandlers.clear();
        this.agentId = null;
        this.token = null;
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

// Keep connection alive when navigating between pages
window.addEventListener('beforeunload', function(e) {
    // Don't close WebSocket on page navigation within same domain
    if (window.sharedWebSocket && window.sharedWebSocket.isConnected()) {
        // Send keep-alive message instead of closing
        window.sharedWebSocket.send({
            type: 'agent_navigating',
            agentId: window.sharedWebSocket.agentId
        });
    }
});

// Reconnect when returning to any page
window.addEventListener('focus', function() {
    if (window.sharedWebSocket && !window.sharedWebSocket.isConnected()) {
        const token = localStorage.getItem('agentToken');
        if (token && window.sharedWebSocket.agentId) {
            window.sharedWebSocket.connect(window.sharedWebSocket.agentId, token);
        }
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.sharedWebSocket && !window.sharedWebSocket.isConnected()) {
        const token = localStorage.getItem('agentToken');
        if (token && window.sharedWebSocket.agentId) {
            window.sharedWebSocket.connect(window.sharedWebSocket.agentId, token);
        }
    }
});