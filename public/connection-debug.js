// Connection debugging utility
class ConnectionDebugger {
    constructor() {
        this.logs = [];
        this.maxLogs = 50;
        this.init();
    }

    init() {
        // Add debug panel to page
        this.createDebugPanel();
        
        // Hook into shared WebSocket events
        if (window.sharedWebSocket) {
            this.hookWebSocketEvents();
        } else {
            // Wait for shared WebSocket to load
            setTimeout(() => {
                if (window.sharedWebSocket) {
                    this.hookWebSocketEvents();
                }
            }, 1000);
        }
    }

    createDebugPanel() {
        // Only show in development or when debug=true in URL
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('debug') && window.location.hostname !== 'localhost') {
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'connection-debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 300px;
            max-height: 200px;
            background: rgba(0,0,0,0.9);
            color: white;
            font-family: monospace;
            font-size: 11px;
            padding: 10px;
            border-radius: 5px;
            z-index: 10000;
            overflow-y: auto;
            display: none;
        `;

        const header = document.createElement('div');
        header.innerHTML = `
            <strong>WebSocket Debug</strong>
            <button onclick="this.parentNode.parentNode.style.display='none'" style="float:right;background:none;border:none;color:white;cursor:pointer;">×</button>
            <div id="connection-status" style="margin: 5px 0;"></div>
            <div id="debug-logs" style="max-height: 150px; overflow-y: auto;"></div>
        `;
        
        panel.appendChild(header);
        document.body.appendChild(panel);

        // Add toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = '🔧';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 10001;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            cursor: pointer;
        `;
        toggleBtn.onclick = () => {
            const panel = document.getElementById('connection-debug-panel');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        };
        document.body.appendChild(toggleBtn);
    }

    hookWebSocketEvents() {
        const originalAddHandler = window.sharedWebSocket.addMessageHandler.bind(window.sharedWebSocket);
        const originalConnect = window.sharedWebSocket.connect.bind(window.sharedWebSocket);
        const originalSend = window.sharedWebSocket.send.bind(window.sharedWebSocket);

        // Hook message handler
        window.sharedWebSocket.addMessageHandler((data) => {
            this.log(`📨 Received: ${data.type}`, 'info');
            if (data.type === 'connection_status') {
                this.updateStatus(data.status, data.message);
            }
        });

        // Hook connect
        window.sharedWebSocket.connect = (agentId, token) => {
            this.log(`🔌 Connecting agent ${agentId}`, 'info');
            return originalConnect(agentId, token);
        };

        // Hook send
        window.sharedWebSocket.send = (data) => {
            this.log(`📤 Sending: ${data.type}`, 'info');
            return originalSend(data);
        };

        // Monitor connection state
        setInterval(() => {
            const status = window.sharedWebSocket.getConnectionStatus();
            const isConnected = window.sharedWebSocket.isConnected();
            this.updateStatus(status, isConnected ? 'Connected' : 'Disconnected');
        }, 2000);
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            type
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.updateDebugPanel();
    }

    updateStatus(status, message) {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            const color = status === 'connected' ? '#28a745' : 
                         status === 'connecting' || status === 'reconnecting' ? '#ffc107' : '#dc3545';
            statusEl.innerHTML = `<span style="color: ${color};">● ${status.toUpperCase()}</span> - ${message}`;
        }
    }

    updateDebugPanel() {
        const logsEl = document.getElementById('debug-logs');
        if (logsEl) {
            logsEl.innerHTML = this.logs.map(log => 
                `<div style="margin: 2px 0; color: ${this.getLogColor(log.type)};">[${log.timestamp}] ${log.message}</div>`
            ).join('');
            logsEl.scrollTop = logsEl.scrollHeight;
        }
    }

    getLogColor(type) {
        switch(type) {
            case 'error': return '#ff6b6b';
            case 'warning': return '#feca57';
            case 'success': return '#48dbfb';
            default: return '#ffffff';
        }
    }
}

// Initialize debugger
if (typeof window !== 'undefined') {
    window.connectionDebugger = new ConnectionDebugger();
}