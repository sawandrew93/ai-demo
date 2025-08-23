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
            
            if (!chatButton || chatButton.style.display === 'none') {
                // Odoo widget is hidden/removed, create our own
                this.createFallbackWidget();
            } else {
                chatButton.style.display = 'block !important';
                chatButton.style.visibility = 'visible !important';
            }
            
            setTimeout(forceShow, 2000);
        };
        forceShow();
    }

    createFallbackWidget() {
        if (document.getElementById('ai-fallback-chat')) return;
        
        const widget = document.createElement('div');
        widget.id = 'ai-fallback-chat';
        widget.innerHTML = `
            <div id="ai-chat-button" style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                background: #875A7B;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 1000;
            " onclick="window.odooAIChat.toggleFallbackChat()">
                💬
            </div>
            <div id="ai-chat-window" style="
                position: fixed;
                bottom: 90px;
                right: 20px;
                width: 350px;
                height: 500px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.3);
                display: none;
                flex-direction: column;
                z-index: 1000;
            ">
                <div style="background: #875A7B; color: white; padding: 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
                    <span>Ask Vanguard</span>
                    <span onclick="window.odooAIChat.toggleFallbackChat()" style="cursor: pointer;">×</span>
                </div>
                <div id="ai-messages" style="flex: 1; padding: 15px; overflow-y: auto; background: #f8f9fa;">
                    <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #875A7B;">
                        Hi! I'm your AI assistant. How can I help you today?
                    </div>
                </div>
                <div style="padding: 15px; border-top: 1px solid #eee; display: flex; gap: 10px;">
                    <input type="text" id="ai-input" placeholder="Type your message..." style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px;" onkeypress="if(event.key==='Enter') window.odooAIChat.sendFallbackMessage()">
                    <button onclick="window.odooAIChat.sendFallbackMessage()" style="background: #875A7B; color: white; border: none; padding: 10px 15px; border-radius: 6px; cursor: pointer;">Send</button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);
    }

    toggleFallbackChat() {
        const window = document.getElementById('ai-chat-window');
        const button = document.getElementById('ai-chat-button');
        
        if (window.style.display === 'none') {
            window.style.display = 'flex';
            button.innerHTML = '×';
        } else {
            window.style.display = 'none';
            button.innerHTML = '💬';
        }
    }

    async sendFallbackMessage() {
        const input = document.getElementById('ai-input');
        const messages = document.getElementById('ai-messages');
        const message = input.value.trim();
        
        if (!message) return;
        
        // Add user message
        const userMsg = document.createElement('div');
        userMsg.style.cssText = 'background: #875A7B; color: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; margin-left: 50px; text-align: right;';
        userMsg.textContent = message;
        messages.appendChild(userMsg);
        
        input.value = '';
        messages.scrollTop = messages.scrollHeight;
        
        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ message, sessionId: this.sessionId })
            });
            
            const data = await response.json();
            
            const aiMsg = document.createElement('div');
            aiMsg.style.cssText = 'background: white; padding: 10px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #875A7B;';
            aiMsg.textContent = data.message;
            messages.appendChild(aiMsg);
            messages.scrollTop = messages.scrollHeight;
            
        } catch (error) {
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = 'background: #f8d7da; padding: 10px; border-radius: 8px; margin-bottom: 10px; color: #721c24;';
            errorMsg.textContent = 'Sorry, I encountered an error. Please try again.';
            messages.appendChild(errorMsg);
        }
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

// Monitor for Odoo widget changes
const observer = new MutationObserver(() => {
    if (!window.odooAIChat) {
        window.odooAIChat = new OdooAIChat();
    }
    
    // Check if Odoo widget disappeared
    const chatButton = document.querySelector('.o_livechat_button');
    if (!chatButton && !document.getElementById('ai-fallback-chat')) {
        window.odooAIChat.createFallbackWidget();
    }
});
observer.observe(document.body, { childList: true, subtree: true });