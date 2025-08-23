// Odoo AI Chat Integration
class OdooAIChat {
    constructor() {
        this.aiMode = true;
        this.conversationHistory = [];
        this.odooLoaded = false;
        this.sessionId = this.generateSessionId();
        
        this.init();
    }

    init() {
        // Wait for Odoo to load, then intercept
        this.waitForOdoo();
    }

    waitForOdoo() {
        // Check if Odoo livechat is available
        const checkOdoo = () => {
            if (window.odoo && window.odoo.im_livechat) {
                this.setupOdooIntegration();
            } else {
                setTimeout(checkOdoo, 500);
            }
        };
        checkOdoo();
    }

    setupOdooIntegration() {
        console.log('Setting up Odoo AI integration...');
        
        // Override Odoo's message sending
        const originalLivechat = window.odoo.im_livechat;
        
        // Intercept when user sends message
        if (originalLivechat && originalLivechat.LivechatButton) {
            const originalSend = originalLivechat.LivechatButton.prototype._sendMessage;
            
            originalLivechat.LivechatButton.prototype._sendMessage = (message) => {
                if (this.aiMode) {
                    this.handleWithAI(message);
                } else {
                    // Send to human agent
                    originalSend.call(this, message);
                }
            };
        }

        this.odooLoaded = true;
    }

    async handleWithAI(message) {
        this.conversationHistory.push({role: 'user', content: message});
        
        try {
            // Call your existing AI endpoint
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
                await this.handoffToHuman(message);
            } else {
                this.displayAIMessage(aiResponse.message);
                this.conversationHistory.push({role: 'assistant', content: aiResponse.message});
            }
        } catch (error) {
            console.error('AI Error:', error);
            this.displayAIMessage("I'm having trouble right now. Let me connect you to a human agent.");
            await this.handoffToHuman(message);
        }
    }

    async handoffToHuman(originalMessage) {
        this.aiMode = false;
        
        // Display handoff message
        this.displayAIMessage("Let me connect you to one of our human agents who can better assist you...");
        
        // Send conversation history to Odoo
        const historyText = this.conversationHistory.map(msg => 
            `${msg.role === 'user' ? 'Customer' : 'AI'}: ${msg.content}`
        ).join('\\n');
        
        // Use Odoo's internal messaging to send history
        setTimeout(() => {
            if (window.odoo && window.odoo.im_livechat) {
                const livechat = window.odoo.im_livechat;
                if (livechat.widget && livechat.widget._sendMessage) {
                    livechat.widget._sendMessage(`Previous AI conversation:\\n${historyText}\\n\\nCustomer: ${originalMessage}`);
                }
            }
        }, 1000);
    }

    displayAIMessage(message) {
        // Display message in Odoo chat interface
        if (window.odoo && window.odoo.im_livechat && window.odoo.im_livechat.widget) {
            const widget = window.odoo.im_livechat.widget;
            
            // Create message element similar to Odoo's format
            const messageData = {
                id: Date.now(),
                body: message,
                author_id: [0, 'AI Assistant'],
                date: new Date().toISOString(),
            };
            
            // Add to chat
            if (widget._addMessage) {
                widget._addMessage(messageData);
            }
        }
    }

    generateSessionId() {
        return 'ai_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.odooAIChat = new OdooAIChat();
});