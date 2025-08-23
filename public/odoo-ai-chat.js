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
        
        // Force show chat widget even when no agents online
        this.forceShowWidget();
    }

    forceShowWidget() {
        const forceShow = () => {
            const chatButton = document.querySelector('.o_livechat_button');
            if (chatButton) {
                chatButton.style.display = 'block !important';
                chatButton.style.visibility = 'visible !important';
            }
            
            // Override Odoo's hide logic
            if (window.odoo && window.odoo.im_livechat) {
                const originalHide = window.odoo.im_livechat.LivechatButton.prototype.hide;
                if (originalHide) {
                    window.odoo.im_livechat.LivechatButton.prototype.hide = function() {
                        // Don't hide - keep widget visible
                        console.log('Preventing Odoo chat widget from hiding');
                    };
                }
            }
            
            setTimeout(forceShow, 2000);
        };
        forceShow();
    }

    setupOdooIntegration() {
        console.log('Setting up Odoo AI integration...');
        
        // Wait for Odoo widget to be fully loaded
        const waitForWidget = () => {
            if (window.odoo.im_livechat.LivechatButton) {
                this.interceptOdooMessages();
                this.ensureWidgetAlwaysVisible();
            } else {
                setTimeout(waitForWidget, 500);
            }
        };
        waitForWidget();
    }

    ensureWidgetAlwaysVisible() {
        // Override Odoo's availability check
        if (window.odoo && window.odoo.im_livechat && window.odoo.im_livechat.LivechatButton) {
            const prototype = window.odoo.im_livechat.LivechatButton.prototype;
            
            // Override the _isAvailable method to always return true
            if (prototype._isAvailable) {
                prototype._isAvailable = function() {
                    return true; // Always show widget
                };
            }
            
            // Override hide method
            if (prototype.hide) {
                prototype.hide = function() {
                    console.log('AI keeping chat widget visible');
                    // Don't hide
                };
            }
        }
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
        // Add user message first (simulate what user typed)
        this.addUserMessage(this.conversationHistory[this.conversationHistory.length - 1].content);
        
        // Then add AI response
        setTimeout(() => {
            const messagesContainer = document.querySelector('.o_thread_message_list, .o_livechat_thread, .o_mail_thread, .o_mail_chatter');
            
            if (messagesContainer) {
                const messageDiv = document.createElement('div');
                messageDiv.className = 'o_thread_message o_mail_message';
                messageDiv.innerHTML = `
                    <div class="o_thread_message_sidebar">
                        <div class="o_thread_message_avatar">
                            <span class="o_avatar" style="background: #0d6efd; color: white; font-size: 12px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">AI</span>
                        </div>
                    </div>
                    <div class="o_thread_message_main">
                        <div class="o_thread_message_core">
                            <div class="o_thread_message_author" style="font-weight: bold; color: #0d6efd;">AI Assistant</div>
                            <div class="o_thread_message_content">
                                <div class="o_thread_message_body" style="margin-top: 5px;">${message}</div>
                            </div>
                        </div>
                    </div>
                `;
                
                messagesContainer.appendChild(messageDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 500);
    }

    addUserMessage(message) {
        const messagesContainer = document.querySelector('.o_thread_message_list, .o_livechat_thread, .o_mail_thread, .o_mail_chatter');
        
        if (messagesContainer) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'o_thread_message o_mail_message';
            messageDiv.innerHTML = `
                <div class="o_thread_message_sidebar">
                    <div class="o_thread_message_avatar">
                        <span class="o_avatar" style="background: #6c757d; color: white; font-size: 12px; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">You</span>
                    </div>
                </div>
                <div class="o_thread_message_main">
                    <div class="o_thread_message_core">
                        <div class="o_thread_message_author" style="font-weight: bold;">You</div>
                        <div class="o_thread_message_content">
                            <div class="o_thread_message_body" style="margin-top: 5px;">${message}</div>
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
    
    // Keep widget visible
    const chatButton = document.querySelector('.o_livechat_button');
    if (chatButton && chatButton.style.display === 'none') {
        chatButton.style.display = 'block';
        chatButton.style.visibility = 'visible';
    }
});
observer.observe(document.body, { childList: true, subtree: true });