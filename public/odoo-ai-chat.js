// Simple Odoo AI Integration - Always keep Odoo widget visible
class OdooAIChat {
    constructor() {
        this.aiMode = true;
        this.conversationHistory = [];
        this.sessionId = this.generateSessionId();
        this.init();
    }

    init() {
        this.waitForOdoo();
    }

    waitForOdoo() {
        const checkOdoo = () => {
            if (window.odoo && window.odoo.im_livechat) {
                this.setupOdooIntegration();
            } else {
                setTimeout(checkOdoo, 1000);
            }
        };
        checkOdoo();
    }

    setupOdooIntegration() {
        console.log('Setting up Odoo AI integration...');
        
        // Force Odoo widget to always be available
        this.forceOdooAvailable();
        
        // Intercept messages
        this.interceptOdooMessages();
    }

    forceOdooAvailable() {
        // Override Odoo's availability check to always return true
        if (window.odoo && window.odoo.im_livechat) {
            const originalInit = window.odoo.im_livechat.init;
            window.odoo.im_livechat.init = function(options) {
                // Force availability
                options = options || {};
                options.available = true;
                options.operators = options.operators || [{id: 1, name: 'AI Assistant'}];
                return originalInit.call(this, options);
            };
            
            // Re-initialize with forced availability
            if (window.odoo.im_livechat.LivechatButton) {
                const button = new window.odoo.im_livechat.LivechatButton();
                button.appendTo(document.body);
            }
        }
    }

    interceptOdooMessages() {
        const self = this;
        
        // Wait for chat input to appear
        const waitForInput = () => {
            const chatInput = document.querySelector('input[placeholder*="message"], textarea[placeholder*="message"], .o_composer_text_field');
            
            if (chatInput) {
                console.log('Found Odoo chat input, setting up interception');
                
                // Intercept form submission
                const form = chatInput.closest('form');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        if (self.aiMode && chatInput.value.trim()) {
                            e.preventDefault();
                            const message = chatInput.value.trim();
                            chatInput.value = '';
                            self.handleWithAI(message);
                        }
                    });
                }
                
                // Intercept Enter key
                chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && self.aiMode && chatInput.value.trim()) {
                        e.preventDefault();
                        const message = chatInput.value.trim();
                        chatInput.value = '';
                        self.handleWithAI(message);
                    }
                });
            } else {
                setTimeout(waitForInput, 1000);
            }
        };
        
        waitForInput();
    }

    async handleWithAI(message) {
        this.conversationHistory.push({role: 'user', content: message});
        
        // Show user message in chat
        this.displayMessage(message, 'user');
        
        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: message,
                    history: this.conversationHistory,
                    sessionId: this.sessionId
                })
            });

            const aiResponse = await response.json();
            
            if (aiResponse.needsHandoff) {
                this.handoffToHuman(message);
            } else {
                this.displayMessage(aiResponse.message, 'ai');
                this.conversationHistory.push({role: 'assistant', content: aiResponse.message});
            }
        } catch (error) {
            console.error('AI Error:', error);
            this.displayMessage("I'm having trouble right now. Let me connect you to a human agent.", 'ai');
            this.handoffToHuman(message);
        }
    }

    handoffToHuman(originalMessage) {
        this.aiMode = false;
        this.displayMessage("Connecting you to a human agent...", 'ai');
        
        // Send message through normal Odoo flow
        setTimeout(() => {
            const chatInput = document.querySelector('input[placeholder*="message"], textarea[placeholder*="message"], .o_composer_text_field');
            const sendButton = document.querySelector('button[type="submit"], .o_composer_send');
            
            if (chatInput && sendButton) {
                chatInput.value = originalMessage;
                sendButton.click();
            }
        }, 1000);
    }

    displayMessage(message, sender) {
        const messagesContainer = document.querySelector('.o_thread_message_list, .o_mail_thread, .o_livechat_thread');
        
        if (messagesContainer) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'o_thread_message';
            
            const isUser = sender === 'user';
            const avatar = isUser ? 'You' : 'AI';
            const bgColor = isUser ? '#6c757d' : '#875A7B';
            
            messageDiv.innerHTML = `
                <div style="display: flex; margin-bottom: 10px; ${isUser ? 'justify-content: flex-end;' : ''}">
                    ${!isUser ? `<div style="width: 30px; height: 30px; border-radius: 50%; background: ${bgColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 10px;">${avatar}</div>` : ''}
                    <div style="max-width: 70%; padding: 10px; border-radius: 8px; background: ${isUser ? bgColor : 'white'}; color: ${isUser ? 'white' : 'black'}; ${isUser ? '' : 'border-left: 3px solid ' + bgColor + ';'}">
                        ${message}
                    </div>
                    ${isUser ? `<div style="width: 30px; height: 30px; border-radius: 50%; background: ${bgColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-left: 10px;">${avatar}</div>` : ''}
                </div>
            `;
            
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    generateSessionId() {
        return 'odoo_ai_' + Math.random().toString(36).substr(2, 9);
    }
}

// Initialize when page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        window.odooAIChat = new OdooAIChat();
    }, 3000);
});