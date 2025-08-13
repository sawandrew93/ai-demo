// Shared notification system for all agent pages
class SharedNotificationService {
    constructor() {
        this.currentSession = null;
        this.isAgentDashboard = window.location.pathname === '/agent';
        this.setupNotificationContainer();
        this.setupSoundSystem();
    }

    setupNotificationContainer() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('shared-notifications')) {
            const container = document.createElement('div');
            container.id = 'shared-notifications';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
    }

    setupSoundSystem() {
        this.playNotificationSound = () => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
        };
    }

    showCustomerRequest(data) {
        // Don't show on agent dashboard - it has its own handling
        if (this.isAgentDashboard) return;

        this.showNotification({
            type: 'customer-request',
            title: '📞 New Customer Request',
            message: `Position ${data.position}: "${data.lastMessage}"`,
            actions: [
                {
                    text: 'Accept',
                    class: 'accept',
                    onclick: () => {
                        window.location.href = '/agent';
                        // Store session to auto-accept
                        localStorage.setItem('autoAcceptSession', data.sessionId);
                    }
                },
                {
                    text: 'Dismiss',
                    class: 'dismiss',
                    onclick: () => this.dismissNotification('customer-request')
                }
            ],
            persistent: true
        });

        this.playNotificationSound();
        this.showDesktopNotification(data);
    }

    showCustomerMessage(data) {
        // Don't show on agent dashboard - it has its own handling
        if (this.isAgentDashboard) return;

        this.showNotification({
            type: 'customer-message',
            title: '💬 New Customer Message',
            message: data.message,
            actions: [
                {
                    text: 'Go to Chat',
                    class: 'goto-chat',
                    onclick: () => window.location.href = '/agent'
                },
                {
                    text: 'Dismiss',
                    class: 'dismiss',
                    onclick: () => this.dismissNotification('customer-message')
                }
            ],
            autoHide: 10000
        });

        this.playNotificationSound();
    }

    showNotification({ type, title, message, actions = [], persistent = false, autoHide = 0 }) {
        const container = document.getElementById('shared-notifications');
        
        // Remove existing notification of same type
        this.dismissNotification(type);

        const notification = document.createElement('div');
        notification.id = `notification-${type}`;
        notification.style.cssText = `
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 16px;
            margin-bottom: 10px;
            animation: slideIn 0.3s ease-out;
        `;

        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; color: #333;">${title}</div>
            <div style="margin-bottom: 12px; color: #666; line-height: 1.4;">${message}</div>
            <div style="display: flex; gap: 8px;">
                ${actions.map(action => `
                    <button class="notification-btn ${action.class}" style="
                        padding: 6px 12px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: 500;
                    ">${action.text}</button>
                `).join('')}
            </div>
        `;

        // Add styles for buttons
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .notification-btn.accept { background: #28a745; color: white; }
            .notification-btn.accept:hover { background: #218838; }
            .notification-btn.goto-chat { background: #007bff; color: white; }
            .notification-btn.goto-chat:hover { background: #0056b3; }
            .notification-btn.dismiss { background: #6c757d; color: white; }
            .notification-btn.dismiss:hover { background: #545b62; }
        `;
        document.head.appendChild(style);

        // Add event listeners
        actions.forEach((action, index) => {
            const btn = notification.querySelectorAll('.notification-btn')[index];
            if (btn && action.onclick) {
                btn.addEventListener('click', action.onclick);
            }
        });

        container.appendChild(notification);

        // Auto-hide if specified
        if (autoHide > 0) {
            setTimeout(() => this.dismissNotification(type), autoHide);
        }
    }

    dismissNotification(type) {
        const notification = document.getElementById(`notification-${type}`);
        if (notification) {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }
    }

    showDesktopNotification(data) {
        if (Notification.permission === 'granted') {
            const notification = new Notification('New Customer Request', {
                body: `Position ${data.position}: "${data.lastMessage}"`,
                icon: '/favicon.ico',
                tag: 'customer-request',
                requireInteraction: true
            });

            notification.onclick = () => {
                window.focus();
                window.location.href = '/agent';
                localStorage.setItem('autoAcceptSession', data.sessionId);
                notification.close();
            };
        }
    }

    handleMessage(data) {
        switch(data.type) {
            case 'pending_request':
                this.showCustomerRequest(data);
                break;
            case 'customer_message':
                if (this.currentSession === data.sessionId) {
                    this.showCustomerMessage(data);
                }
                break;
            case 'customer_assigned':
                this.currentSession = data.sessionId;
                break;
            case 'session_ended_by_customer':
            case 'chat_ended':
                if (this.currentSession === data.sessionId) {
                    this.currentSession = null;
                }
                break;
        }
    }
}

// Create global instance
window.sharedNotifications = new SharedNotificationService();

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}