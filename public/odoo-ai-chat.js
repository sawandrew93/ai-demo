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
        const self = this;
        
        // Wait for the chat widget to be ready
        const interceptMessages = () => {
            const chatInput = document.querySelector('.o_composer_text_field, .o_livechat_composer input, input[placeholder*="message"], textarea[placeholder*="message"]');
            const sendButton = document.querySelector('.o_composer_send, .o_livechat_send, button[type="submit"]');
            
            if (chatInput && sendButton) {
                console.log('Found Odoo chat elements, setting up AI interception');
                
                // Override the send button click
                sendButton.addEventListener('click', (e) => {
                    if (self.aiMode && chatInput.value.trim()) {
                        e.preventDefault();
                        e.stopPropagation();
                        const message = chatInput.value.trim();
                        chatInput.value = '';
                        self.handleWithAI(message);
                    }
                });
                
                // Override Enter key
                chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && self.aiMode && chatInput.value.trim()) {
                        e.preventDefault();
                        e.stopPropagation();
                        const message = chatInput.value.trim();
                        chatInput.value = '';
                        self.handleWithAI(message);
                    }
                });
            } else {
                setTimeout(interceptMessages, 1000);
            }
        };
        
        interceptMessages();
    }

    async handleWithAI(message) {
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
                this.handoffToHuman(message);
            } else {
                this.displayAIMessage(aiResponse.message);
                this.conversationHistory.push({role: 'assistant', content: aiResponse.message});
            }
        } catch (error) {
            console.error('AI Error:', error);
            this.displayAIMessage("I'm having trouble right now. Let me connect you to a human agent.");
            this.handoffToHuman(message);
        }
    }

    handoffToHuman(originalMessage) {
        this.aiMode = false;
        
        // Display handoff message
        this.displayAIMessage("Let me connect you to one of our human agents...");
        
        // Send the original message to human agent
        setTimeout(() => {
            const chatInput = document.querySelector('.o_composer_text_field, .o_livechat_composer input, input[placeholder*="message"], textarea[placeholder*="message"]');
            const sendButton = document.querySelector('.o_composer_send, .o_livechat_send, button[type="submit"]');
            
            if (chatInput && sendButton) {
                chatInput.value = originalMessage;
                sendButton.click();
            }
        }, 1000);
    }

    displayAIMessage(message) {
        // Find the chat messages container
        const messagesContainer = document.querySelector('.o_thread_message_list, .o_livechat_thread, .o_mail_thread');
        
        if (messagesContainer) {
            // Create AI message element
            const messageDiv = document.createElement('div');
            messageDiv.className = 'o_thread_message o_mail_message';
            messageDiv.innerHTML = `
                <div class="o_thread_message_sidebar">
                    <div class="o_thread_message_avatar">
                        <span class="o_avatar o_thread_message_avatar" style="background: #0d6efd; color: white; font-size: 12px;">AI</span>
                    </div>
                </div>
                <div class="o_thread_message_main">
                    <div class="o_thread_message_core">
                        <div class="o_thread_message_author">AI Assistant</div>
                        <div class="o_thread_message_content">
                            <div class="o_thread_message_body">${message}</div>
                        </div>
                    </div>
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

// Also try when DOM changes (for dynamic Odoo loading)
const observer = new MutationObserver(() => {
    if (document.querySelector('.o_livechat_button') && !window.odooAIChat) {
        window.odooAIChat = new OdooAIChat();
    }
});
observer.observe(document.body, { childList: true, subtree: true });