// Odoo AI Chat Integration
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
        
        // Wait for Odoo widget to be fully loaded
        const waitForWidget = () => {
            if (window.odoo.im_livechat.LivechatButton) {
                this.interceptOdooMessages();
            } else {
                setTimeout(waitForWidget, 500);
            }
        };
        waitForWidget();
    }

    interceptOdooMessages() {
        // Override the message sending in Odoo
        const self = this;
        
        // Hook into Odoo's message sending
        const originalPrototype = window.odoo.im_livechat.LivechatButton.prototype;
        const originalSendMessage = originalPrototype._sendMessage;
        
        originalPrototype._sendMessage = function(content) {
            if (self.aiMode) {
                self.handleWithAI(content, this);
            } else {
                originalSendMessage.call(this, content);
            }
        };
    }

    async handleWithAI(message, odooWidget) {
        this.conversationHistory.push({role: 'user', content: message});
        
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
                this.handoffToHuman(message, odooWidget);
            } else {
                this.displayAIMessage(aiResponse.message, odooWidget);
                this.conversationHistory.push({role: 'assistant', content: aiResponse.message});
            }
        } catch (error) {
            console.error('AI Error:', error);
            this.displayAIMessage("I'm having trouble right now. Let me connect you to a human agent.", odooWidget);
            this.handoffToHuman(message, odooWidget);
        }
    }

    handoffToHuman(originalMessage, odooWidget) {
        this.aiMode = false;
        
        // Display handoff message
        this.displayAIMessage("Let me connect you to one of our human agents...", odooWidget);
        
        // Send the original message to human agent
        setTimeout(() => {
            const originalSendMessage = window.odoo.im_livechat.LivechatButton.prototype._sendMessage;
            originalSendMessage.call(odooWidget, originalMessage);
        }, 1000);
    }

    displayAIMessage(message, odooWidget) {
        // Create a fake message from AI in Odoo format
        const messageElement = {
            id: Date.now(),
            body: message,
            author_id: [0, 'AI Assistant'],
            date: new Date().toISOString()
        };
        
        // Add message to Odoo chat
        if (odooWidget && odooWidget._addMessage) {
            odooWidget._addMessage(messageElement);
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
    }, 2000);
});