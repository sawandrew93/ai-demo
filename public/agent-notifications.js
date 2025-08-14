// Agent notification service for secondary pages - uses shared WebSocket
class AgentSoundService {
    constructor() {
        this.token = localStorage.getItem('agentToken');
        this.user = null;
        
        // Only initialize on non-agent pages and if we have a token
        if (this.token && window.location.pathname !== '/agent') {
            this.validateAndSetupNotifications();
        }
    }

    async validateAndSetupNotifications() {
        try {
            const response = await fetch('/api/agent/validate', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.setupSharedWebSocketListener();
            }
        } catch (error) {
            console.error('Agent validation failed:', error);
        }
    }

    setupSharedWebSocketListener() {
        // Use the shared WebSocket service instead of creating a new connection
        if (window.sharedWebSocket && this.user) {
            console.log('AgentSoundService: Setting up shared WebSocket listener');
            
            // Add message handler to shared service
            window.sharedWebSocket.addMessageHandler((data) => {
                if (data.type === 'pending_request') {
                    this.showNotification(data);
                }
            });
            
            // Connect if not already connected
            if (!window.sharedWebSocket.isConnected()) {
                window.sharedWebSocket.connect(this.user.id, this.token);
            }
        }
    }

    showNotification(data) {
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:white;border:2px solid #007bff;padding:15px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;max-width:300px';
        notification.innerHTML = `
            <h4 style="margin:0 0 10px 0;color:#007bff">📞 New Customer Request</h4>
            <p style="margin:5px 0;font-size:14px">Position ${data.position} of ${data.totalInQueue}</p>
            <p style="margin:5px 0;font-size:14px">"${data.lastMessage}"</p>
            <button onclick="window.location.href='/agent'" style="background:#28a745;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-right:10px">Go to Dashboard</button>
            <button onclick="this.parentNode.remove()" style="background:#6c757d;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer">Dismiss</button>
        `;
        document.body.appendChild(notification);
        this.playNotificationSound();
        setTimeout(() => notification.remove(), 30000);
    }

    playNotificationSound() {
        try {
            // Create audio context for notification sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Play multiple beeps for attention
            for (let i = 0; i < 3; i++) {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                const startTime = audioContext.currentTime + (i * 0.4);
                
                oscillator.frequency.setValueAtTime(1000, startTime);
                oscillator.frequency.setValueAtTime(800, startTime + 0.1);
                
                gainNode.gain.setValueAtTime(0.6, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
                
                oscillator.start(startTime);
                oscillator.stop(startTime + 0.2);
            }
        } catch (error) {
            console.log('Could not play notification sound:', error);
        }
    }

}

// Initialize sound service after shared WebSocket is loaded
if (typeof window.sharedWebSocket !== 'undefined') {
    window.agentSoundService = new AgentSoundService();
} else {
    // Wait for shared WebSocket to load
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            window.agentSoundService = new AgentSoundService();
        }, 100);
    });
}
