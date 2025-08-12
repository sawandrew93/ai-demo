require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini AI with latest models
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" }); 

// Import knowledge base services
const EmbeddingService = require('./knowledge-base/embeddings');
const KnowledgeBaseDB = require('./knowledge-base/database');

// Initialize knowledge base services
const embeddingService = new EmbeddingService();
const knowledgeDB = new KnowledgeBaseDB();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Storage
const conversations = new Map();
const humanAgents = new Map();
const waitingQueue = [];
const agentSessions = new Map();
const sessionAgentMap = new Map();
const customerTimeouts = new Map();
const customerIdleTimeouts = new Map();
const chatHistory = [];
const agentReconnectTimeouts = new Map();

// Database-based user management
class UserService {
  static async getUserByUsername(username) {
    try {
      const { data, error } = await supabase
        .from('agent_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }
  
  static async createUser(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const { data, error } = await supabase
        .from('agent_users')
        .insert([{
          username: userData.username,
          email: userData.email,
          name: userData.name,
          password_hash: hashedPassword,
          role: userData.role || 'agent'
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
}

async function initializeDefaultUsers() {
  try {
    // Check if admin user exists
    const adminExists = await UserService.getUserByUsername('admin');
    if (!adminExists) {
      console.log('Creating default admin user...');
      await UserService.createUser({
        username: 'admin',
        email: 'admin@vanguardmm.com',
        name: 'System Admin',
        password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
        role: 'admin'
      });
      console.log('✅ Default admin user created');
    }
    
    // Create sample agent users if they don't exist
    const sampleUsers = [
      { username: 'saw.andrew', email: 'andrew.saw@vanguardmm.com', name: 'Saw Andrew', password: process.env.AGENT_PASSWORD || 'Agent123!', role: 'agent' },
      { username: 'blaze.hein', email: 'blaze.hein@vanguardmm.com', name: 'Blaze', password: process.env.AGENT_PASSWORD || 'Agent123!', role: 'agent' }
    ];
    
    for (const user of sampleUsers) {
      const exists = await UserService.getUserByUsername(user.username);
      if (!exists) {
        await UserService.createUser(user);
        console.log(`✅ Created user: ${user.username}`);
      }
    }
  } catch (error) {
    console.error('Error initializing users:', error);
  }
}

// Constants
const CUSTOMER_TIMEOUT = 10 * 60 * 1000;
const CUSTOMER_IDLE_WARNING = 10 * 60 * 1000; // 10 minutes for idle warning
const CUSTOMER_IDLE_TIMEOUT = (10 * 60 * 1000) + (30 * 1000); // 10 minutes + 30 seconds total
const AGENT_RECONNECT_WINDOW = 5 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
const SIMILARITY_THRESHOLD = 0.4; // Minimum similarity for knowledge base answers
const HANDOFF_THRESHOLD = 0.8; // Threshold for intelligent handoff detection

// ========== VECTOR DATABASE FUNCTIONS ========== //
async function generateEmbedding(text) {
  try {
    return await embeddingService.generateEmbedding(text);
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// AI-driven query expansion based on intent classification
function expandQuery(query, intentClassification) {
  const intentExpansions = {
    'pricing_inquiry': ['cost', 'price', 'pricing', 'budget', 'expensive', 'cheap', 'quote', 'estimate', 'fee'],
    'product_inquiry': ['services', 'products', 'solutions', 'features', 'capabilities', 'offerings', 'what we do'],
    'demo_request': ['demo', 'trial', 'test', 'preview', 'show', 'demonstration', 'try'],
    'technical_support': ['help', 'support', 'problem', 'issue', 'error', 'bug', 'troubleshoot', 'fix'],
    'implementation_help': ['setup', 'install', 'configure', 'deploy', 'implementation', 'integration'],
    'account_management': ['account', 'billing', 'payment', 'subscription', 'invoice', 'cancel'],
    'hr_policy': ['leave', 'vacation', 'sick', 'annual', 'policy', 'employee', 'work', 'office', 'time off', 'holiday'],
    'complaint': ['complain', 'frustrated', 'angry', 'disappointed', 'terrible', 'awful', 'bad', 'dissatisfied']
  };
  
  let expandedQuery = query;
  
  // Add intent-specific expansions
  if (intentClassification && intentExpansions[intentClassification.intent]) {
    const synonyms = intentExpansions[intentClassification.intent];
    expandedQuery += ' ' + synonyms.join(' ');
  }
  
  // Add some common semantic expansions
  const commonExpansions = {
    'make love': 'romance dating relationship intimate',
    'types of': 'what available allowed different kinds'
  };
  
  for (const [key, expansion] of Object.entries(commonExpansions)) {
    if (query.toLowerCase().includes(key)) {
      expandedQuery += ' ' + expansion;
    }
  }
  
  return expandedQuery;
}

// Intent-aware knowledge base search
async function searchKnowledgeBaseWithIntent(query, intentClassification, limit = 5) {
  try {
    console.log('🔍 Searching knowledge base for:', query);
    console.log('🤖 AI Intent:', intentClassification.intent, 'Confidence:', intentClassification.confidence);
    
    // Expand query based on AI intent classification
    const expandedQuery = expandQuery(query, intentClassification);
    console.log('🔍 Intent-expanded query:', expandedQuery);
    
    // Generate embedding for the expanded query
    const queryEmbedding = await generateEmbedding(expandedQuery);
    console.log('✅ Generated embedding, length:', queryEmbedding.length);

    // Adjust threshold based on AI confidence
    const baseThreshold = intentClassification.confidence > 0.8 ? SIMILARITY_THRESHOLD - 0.1 : SIMILARITY_THRESHOLD;
    
    // Search using the knowledge base service
    let results = await knowledgeDB.searchSimilarDocuments(queryEmbedding, baseThreshold, limit);

    // If no results, try with lower threshold
    if (!results || results.length === 0) {
      console.log('🔍 No results with AI-adjusted threshold, trying lower threshold...');
      results = await knowledgeDB.searchSimilarDocuments(queryEmbedding, 0.25, limit);
    }

    console.log(`📊 Found ${results?.length || 0} results`);
    if (results && results.length > 0) {
      console.log('📝 Top result similarity:', results[0].similarity);
      console.log('📝 Top result:', results[0].content?.substring(0, 100) + '...');
    }

    return results || [];
  } catch (error) {
    console.error('❌ Knowledge base search error:', error);
    return [];
  }
}

// Keep original function for backward compatibility
async function searchKnowledgeBase(query, limit = 5) {
  try {
    console.log('🔍 Searching knowledge base for:', query);
    
    // Expand query based on AI intent classification
    const expandedQuery = expandQuery(query, null); // Will be enhanced when called from generateAIResponse
    console.log('🔍 Expanded query:', expandedQuery);
    
    // Generate embedding for the expanded query
    const queryEmbedding = await generateEmbedding(expandedQuery);
    console.log('✅ Generated embedding, length:', queryEmbedding.length);

    // Search using the knowledge base service with lower threshold first
    let results = await knowledgeDB.searchSimilarDocuments(queryEmbedding, SIMILARITY_THRESHOLD, limit);

    // If no results, try with lower threshold
    if (!results || results.length === 0) {
      console.log('🔍 No results with standard threshold, trying lower threshold...');
      results = await knowledgeDB.searchSimilarDocuments(queryEmbedding, 0.3, limit);
    }

    console.log(`📊 Found ${results?.length || 0} results`);
    if (results && results.length > 0) {
      console.log('📝 Top result similarity:', results[0].similarity);
      console.log('📝 Top result:', results[0].content?.substring(0, 100) + '...');
    }

    return results || [];
  } catch (error) {
    console.error('❌ Knowledge base search error:', error);
    return [];
  }
}

// ========== INTELLIGENT HANDOFF DETECTION ========== //
async function analyzeHandoffIntent(message, conversationHistory = []) {
  try {
    const context = `
    Analyze if this customer message indicates they want to speak with a human sales representative.

    If the message is a greeting or pleasantry (e.g., 'hi', 'hello', 'how are you', 'good morning', 'hey', 'greetings', 'how's it going', 'good day', etc.), set needsHuman to false and reason to 'Greeting message'.

    Consider these scenarios as requiring human handoff:
    - Explicit requests for human help, agent, representative, sales person, "talk to someone"
    - Ready to purchase or buy something ("I want to buy", "how much does it cost", "pricing")
    - Complex product questions that need detailed explanation
    - Custom requirements or enterprise solutions
    - Complaints or frustration with previous responses
    - Account-specific issues requiring authorization
    - Expressions of dissatisfaction with AI responses
    - Questions about implementation, setup, or technical integration
    - Requests for demos, trials, or consultations

    Recent conversation context:
    ${conversationHistory.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

    Current message: "${message}"

    Respond with only a JSON object:
    {
      "needsHuman": true/false,
      "confidence": 0.0-1.0,
      "reason": "brief explanation",
      "suggestedResponse": "friendly message to offer human connection"
    }
    `;

    const result = await model.generateContent(context);
    const responseText = result.response.text().trim();

    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      return {
        needsHuman: analysis.needsHuman || false,
        confidence: analysis.confidence || 0,
        reason: analysis.reason || '',
        suggestedResponse: analysis.suggestedResponse || ''
      };
    }

    return { needsHuman: false, confidence: 0, reason: 'Failed to analyze', suggestedResponse: '' };
  } catch (error) {
    console.error('Handoff analysis error:', error);
    return { needsHuman: false, confidence: 0, reason: 'Analysis error', suggestedResponse: '' };
  }
}

// ========== AI-POWERED INTENT CLASSIFICATION ========== //
async function classifyIntent(message, conversationHistory = []) {
  try {
    const context = `Analyze this customer message and classify the intent. Consider the conversation context if provided.

Available intent categories:
- pricing_inquiry: Questions about cost, pricing, budget, quotes
- product_inquiry: Questions about services, features, capabilities, what you offer
- demo_request: Requests for demos, trials, testing, previews
- technical_support: Help with problems, issues, errors, bugs, troubleshooting
- implementation_help: Setup, installation, configuration, deployment, integration
- account_management: Billing, payments, subscriptions, account issues
- complaint: Expressions of frustration, disappointment, anger, dissatisfaction
- human_request: Explicit requests to talk to humans, agents, representatives
- hr_policy: Questions about company policies, leaves, work rules, employee guidelines
- greeting: Simple greetings and pleasantries
- general_inquiry: General questions that don't fit other categories

Conversation context:
${conversationHistory.slice(-2).map(msg => `${msg.role}: ${msg.content}`).join('\n')}

Customer message: "${message}"

Respond with only a JSON object:
{
  "intent": "category_name",
  "category": "main_category", 
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

    const result = await model.generateContent(context);
    const responseText = result.response.text().trim();
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const classification = JSON.parse(jsonMatch[0]);
      return {
        intent: classification.intent || 'general_inquiry',
        category: classification.category || 'general',
        confidence: Math.min(Math.max(classification.confidence || 0.5, 0), 1),
        reasoning: classification.reasoning || ''
      };
    }
    
    // Fallback if JSON parsing fails
    return { intent: 'general_inquiry', category: 'general', confidence: 0.5, reasoning: 'AI classification failed' };
  } catch (error) {
    console.error('AI intent classification error:', error);
    return { intent: 'general_inquiry', category: 'general', confidence: 0.5, reasoning: 'Classification error' };
  }
}

// ========== ENHANCED AI RESPONSE GENERATION ========== //
async function generateAIResponse(userMessage, conversationHistory = []) {
  try {
    // Classify intent using AI
    const intentClassification = await classifyIntent(userMessage, conversationHistory);
    
    // Handle greeting messages
    const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'];
    const isGreeting = greetings.some(greeting => 
      userMessage.toLowerCase().trim() === greeting || userMessage.toLowerCase().includes(greeting + ' ') || userMessage.toLowerCase().includes(' ' + greeting)
    ) && userMessage.length < 30;

    if (isGreeting) {
      return {
        type: 'ai_response',
        message: "Hi there! 👋 How can I help you today?",
        sources: [],
        intent: 'greeting',
        category: 'general'
      };
    }

    // Handle meta questions about capabilities
    const metaQuestions = ['what else do you know', 'what can you help', 'what do you know', 'what topics', 'what can you answer'];
    const isMetaQuestion = metaQuestions.some(meta => 
      userMessage.toLowerCase().includes(meta)
    );

    if (isMetaQuestion) {
      return {
        type: 'ai_response',
        message: "I can help you with questions about company policies, office procedures, employee guidelines, and workplace information. Feel free to ask me anything specific!",
        sources: []
      };
    }

    // Check if AI classified this as a human request
    if (intentClassification.intent === 'human_request' && intentClassification.confidence > 0.7) {
      return {
        type: 'handoff_suggestion',
        message: "Sure! I'll connect you with one of our support representatives right away. They'll be able to provide personalized assistance.",
        reason: `AI detected human request (confidence: ${intentClassification.confidence})`,
        intent: intentClassification.intent,
        category: intentClassification.category,
        confidence: intentClassification.confidence
      };
    }

    // Handle service/product questions with company information
    const serviceKeywords = ['services', 'products', 'what do you do', 'what do you offer', 'solutions', 'consulting'];
    const isServiceQuestion = serviceKeywords.some(keyword => 
      userMessage.toLowerCase().includes(keyword)
    );

    if (isServiceQuestion) {
      return {
        type: 'ai_response',
        message: "We are Vanguard Business Consulting, specializing in ERP solutions and digital transformation. Our main services include:\n\n• **SAP S/4HANA** - Next-generation ERP for large enterprises\n• **SAP Business One** - ERP solution for SMBs\n• **Odoo ERP** - Open-source business management\n• **Cadena HRM** - Human resource management\n• **Implementation & Support** - End-to-end services\n• **Business Intelligence** - Analytics and reporting\n\nWould you like to know more about any specific service or connect with our sales team?",
        sources: []
      };
    }

    // Check if it's a question
    const isQuestion = userMessage.includes('?') || 
                      userMessage.toLowerCase().startsWith('what') ||
                      userMessage.toLowerCase().startsWith('how') ||
                      userMessage.toLowerCase().startsWith('when') ||
                      userMessage.toLowerCase().startsWith('where') ||
                      userMessage.toLowerCase().startsWith('why') ||
                      userMessage.toLowerCase().startsWith('can') ||
                      userMessage.toLowerCase().startsWith('do') ||
                      userMessage.toLowerCase().startsWith('does') ||
                      userMessage.toLowerCase().startsWith('is') ||
                      userMessage.toLowerCase().startsWith('are');

    // For non-questions, respond conversationally without knowledge base
    if (!isQuestion) {
      return {
        type: 'ai_response',
        message: "I'm here to help answer your questions about company policies and procedures. What would you like to know?",
        sources: []
      };
    }

    // For questions, search knowledge base with intent-aware expansion
    const knowledgeResults = await searchKnowledgeBaseWithIntent(userMessage, intentClassification);
    console.log(`📊 Knowledge search results: ${knowledgeResults.length} found`);
    if (knowledgeResults.length > 0) {
      console.log(`📝 Top result preview: ${knowledgeResults[0].content.substring(0, 150)}...`);
    }

    // Improved relevance checking with lower thresholds
    let relevantResults = [];
    if (knowledgeResults.length > 0) {
      // Use AI intent classification to determine relevance threshold
      const isHRQuestion = intentClassification.category === 'hr_policy' || intentClassification.intent === 'hr_policy';
      const isHighConfidence = intentClassification.confidence > 0.8;
      const minSimilarity = isHRQuestion ? 0.2 : (isHighConfidence ? 0.25 : 0.3);
      
      relevantResults = knowledgeResults.filter(result => {
        return result.similarity > minSimilarity;
      });
      
      console.log(`📊 Filtered to ${relevantResults.length} relevant results (min similarity: ${minSimilarity})`);
    }

    // If no relevant knowledge found, try one more search with original query
    if (relevantResults.length === 0 && knowledgeResults.length === 0) {
      console.log(`🔄 No results found, trying fallback search: "${userMessage}"`);
      const originalResults = await searchKnowledgeBase(userMessage, 3);
      if (originalResults.length > 0) {
        relevantResults = originalResults.filter(r => r.similarity > 0.2);
      }
    }
    
    // If still no relevant knowledge found, suggest human handoff
    if (relevantResults.length === 0) {
      console.log(`🔄 No relevant results found for: "${userMessage}"`);
      console.log(`📊 Original results: ${knowledgeResults.length}, Filtered: ${relevantResults.length}`);
      if (knowledgeResults.length > 0) {
        console.log(`📝 Top result was: ${knowledgeResults[0].content.substring(0, 150)}...`);
        console.log(`📊 Top similarity: ${knowledgeResults[0].similarity}`);
      }
      return {
        type: 'handoff_suggestion',
        message: "I don't have specific information about that in my knowledge base. Would you like me to connect you with one of our support representatives who can provide more detailed assistance?",
        reason: "No relevant knowledge found for this specific question",
        intent: intentClassification.intent,
        category: intentClassification.category,
        confidence: intentClassification.confidence
      };
    }

    // Use relevant knowledge base results
    console.log(`📋 Using ${relevantResults.length} relevant knowledge base results for: "${userMessage}"`);

    // Generate response using relevant knowledge base information with better context
    const context = `You are a helpful company assistant. Answer the customer's question using the information provided below. Be direct and helpful.

Relevant company information:
${relevantResults.map(item => `- ${item.content}`).join('\n')}

Customer question: "${userMessage}"

Instructions:
- If the question asks about "types of" something, summarize all the different types mentioned in the information
- If the question uses different words but asks about the same topic, understand the intent and answer appropriately
- Be comprehensive - if multiple related policies are mentioned, include them all
- Provide a clear, helpful answer based on the company information above
- Do NOT say "I don't have information" or "not available" - just answer based on what's provided`;

    const result = await model.generateContent(context);
    const responseText = result.response.text();

    // Check if AI response indicates no information available
    const noInfoIndicators = [
      'i don\'t have', 'no information', 'not contain', 'does not contain',
      'i am sorry', 'i\'m sorry', 'no details', 'not available',
      'cannot find', 'no specific information'
    ];
    
    const hasNoInfoResponse = noInfoIndicators.some(indicator => 
      responseText.toLowerCase().includes(indicator)
    );
    
    if (hasNoInfoResponse) {
      // AI couldn't answer with available knowledge, suggest handoff
      return {
        type: 'handoff_suggestion',
        message: "I don't have specific information about that in my knowledge base. Would you like me to connect you with one of our support representatives who can provide more detailed assistance?",
        reason: "AI generated no-information response",
        intent: intentClassification.intent,
        category: intentClassification.category,
        confidence: intentClassification.confidence
      };
    }

    // Calculate enhanced confidence score
    const avgSimilarity = relevantResults.reduce((sum, r) => sum + r.similarity, 0) / relevantResults.length;
    const enhancedConfidence = Math.min(intentClassification.confidence + (avgSimilarity * 0.3), 1.0);
    
    return {
      type: 'ai_response',
      message: responseText,
      sources: relevantResults.map(item => ({
        content: item.content.substring(0, 100) + '...',
        similarity: item.similarity
      })),
      intent: intentClassification.intent,
      category: intentClassification.category,
      confidence: enhancedConfidence
    };

  } catch (error) {
    console.error('AI generation error:', error);
    return {
      type: 'handoff_suggestion',
      message: "I'm having trouble processing your request right now. Would you like to connect with human support?",
      reason: "AI processing error"
    };
  }
}

// ========== UTILITY FUNCTIONS (keeping existing ones) ========== //
function setupCustomerTimeout(sessionId) {
  clearCustomerTimeout(sessionId);

  const timeoutId = setTimeout(() => {
    const conversation = conversations.get(sessionId);
    if (conversation && !conversation.hasHuman) {
      const index = waitingQueue.indexOf(sessionId);
      if (index > -1) {
        waitingQueue.splice(index, 1);

        humanAgents.forEach((agentData, agentId) => {
          if (agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
            agentData.ws.send(JSON.stringify({
              type: 'customer_timeout',
              sessionId,
              remainingQueue: waitingQueue.length
            }));
          }
        });

        console.log(`Customer ${sessionId} timed out and removed from queue`);
      }
    }
    customerTimeouts.delete(sessionId);
  }, CUSTOMER_TIMEOUT);

  customerTimeouts.set(sessionId, timeoutId);
}

function clearCustomerTimeout(sessionId) {
  const timeoutId = customerTimeouts.get(sessionId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    customerTimeouts.delete(sessionId);
  }
}

function setupCustomerIdleTimeout(sessionId) {
  clearCustomerIdleTimeout(sessionId);

  const timeoutId = setTimeout(() => {
    const conversation = conversations.get(sessionId);
    if (conversation) {
      console.log(`Customer ${sessionId} idle timeout - ending session`);
      
      if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
        conversation.customerWs.send(JSON.stringify({
          type: 'session_timeout',
          message: 'Your session has ended due to inactivity. Feel free to start a new conversation!'
        }));
      }

      if (conversation.hasHuman) {
        handleEndChat(sessionId, 'customer_idle');
      } else {
        // Clean up AI-only session
        conversations.delete(sessionId);
        const queueIndex = waitingQueue.indexOf(sessionId);
        if (queueIndex > -1) {
          waitingQueue.splice(queueIndex, 1);
        }
      }
    }
    customerIdleTimeouts.delete(sessionId);
  }, CUSTOMER_IDLE_TIMEOUT);

  customerIdleTimeouts.set(sessionId, timeoutId);
}

function clearCustomerIdleTimeout(sessionId) {
  const timeoutId = customerIdleTimeouts.get(sessionId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    customerIdleTimeouts.delete(sessionId);
  }
}

function saveChatHistory(sessionId, endReason = 'completed') {
  const conversation = conversations.get(sessionId);
  if (!conversation) return;

  const historyRecord = {
    sessionId,
    messages: [...conversation.messages],
    startTime: conversation.startTime || new Date(),
    endTime: new Date(),
    agentId: conversation.assignedAgent,
    agentName: conversation.agentName || 'Unknown',
    endReason,
    customerSatisfaction: null
  };

  chatHistory.push(historyRecord);
  console.log(`Chat history saved for session ${sessionId}`);
  return historyRecord;
}

// Keep all existing agent reconnection and session management functions...
function handleAgentReconnection(agentId, ws, user) {
  console.log(`Attempting to reconnect agent ${agentId}`);

  if (agentReconnectTimeouts.has(agentId)) {
    clearTimeout(agentReconnectTimeouts.get(agentId));
    agentReconnectTimeouts.delete(agentId);
  }

  const previousSessionId = agentSessions.get(agentId);
  console.log(`Previous session for agent ${agentId}: ${previousSessionId}`);

  if (previousSessionId) {
    const conversation = conversations.get(previousSessionId);
    console.log(`Conversation exists: ${!!conversation}`);

    if (conversation && conversation.hasHuman && conversation.assignedAgent === agentId) {
      console.log(`Restoring connection for agent ${agentId} to session ${previousSessionId}`);

      conversation.agentWs = ws;
      humanAgents.set(agentId, {
        ws,
        user,
        status: 'busy',
        sessionId: previousSessionId
      });

      ws.send(JSON.stringify({
        type: 'connection_restored',
        sessionId: previousSessionId,
        message: 'Connection restored. You can continue the conversation.',
        history: conversation.messages.slice(-10)
      }));

      if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
        conversation.customerWs.send(JSON.stringify({
          type: 'agent_reconnected',
          message: `${user.name} has reconnected and is back online.`
        }));
      }

      console.log(`Agent ${user.name} (${agentId}) successfully reconnected to session ${previousSessionId}`);
      return true;
    } else {
      console.log(`Session ${previousSessionId} is no longer valid for agent ${agentId}`);
      agentSessions.delete(agentId);
      sessionAgentMap.delete(previousSessionId);
    }
  }

  console.log(`No valid session found for agent ${agentId} to reconnect to`);
  return false;
}

function handleCustomerSessionRestore(ws, sessionId, customerInfo = null) {
  console.log(`Customer attempting to restore session: ${sessionId}`);
  if (customerInfo) {
    console.log('Customer info provided during restore:', customerInfo);
  }

  const conversation = conversations.get(sessionId);
  if (conversation) {
    conversation.customerWs = ws;
    
    // Store customer info if provided
    if (customerInfo) {
      conversation.customerInfo = customerInfo;
      console.log('✅ Stored customer info during session restore:', customerInfo);
    }
    
    // Reset idle timeout on session restore
    setupCustomerIdleTimeout(sessionId);

    ws.send(JSON.stringify({
      type: 'session_restored',
      sessionId: sessionId,
      isConnectedToHuman: conversation.hasHuman,
      agentName: conversation.agentName || null,
      message: conversation.hasHuman
        ? `Session restored. You're connected to ${conversation.agentName}.`
        : 'Session restored. You can continue chatting with our AI assistant.'
    }));

    if (conversation.hasHuman && conversation.agentWs && conversation.agentWs.readyState === WebSocket.OPEN) {
      conversation.agentWs.send(JSON.stringify({
        type: 'customer_reconnected',
        sessionId: sessionId,
        message: 'Customer has reconnected to the chat.'
      }));
    }

    console.log(`Session ${sessionId} restored successfully`);
  } else {
    conversations.set(sessionId, {
      customerWs: ws,
      messages: [],
      hasHuman: false,
      agentWs: null,
      startTime: new Date(),
      customerInfo: customerInfo || null
    });

    if (customerInfo) {
      console.log('✅ Stored customer info in new session:', customerInfo);
    }

    ws.send(JSON.stringify({
      type: 'session_restored',
      sessionId: sessionId,
      isConnectedToHuman: false,
      message: 'New session created.'
    }));

    setupCustomerTimeout(sessionId);
    setupCustomerIdleTimeout(sessionId);
    console.log(`New session ${sessionId} created for customer`);
  }
}

function setupAgentReconnectTimeout(agentId, sessionId) {
  console.log(`Setting up reconnect timeout for agent ${agentId}, session ${sessionId}`);

  const timeoutId = setTimeout(() => {
    console.log(`Agent ${agentId} reconnect timeout expired, ending session ${sessionId}`);

    const conversation = conversations.get(sessionId);
    if (conversation && conversation.assignedAgent === agentId) {
      handleEndChat(sessionId, 'agent_timeout');
    }

    agentSessions.delete(agentId);
    sessionAgentMap.delete(sessionId);
    agentReconnectTimeouts.delete(agentId);
  }, AGENT_RECONNECT_WINDOW);

  agentReconnectTimeouts.set(agentId, timeoutId);
}

function sendSatisfactionSurvey(customerWs, sessionId, interactionType = 'human_agent') {
  if (customerWs && customerWs.readyState === WebSocket.OPEN) {
    customerWs.send(JSON.stringify({
      type: 'satisfaction_survey',
      sessionId,
      interactionType,
      message: interactionType === 'ai_only' 
        ? 'How was your experience with our AI assistant?' 
        : 'How was your experience with our support?',
      options: [
        { value: 5, label: '😊 Excellent' },
        { value: 4, label: '🙂 Good' },
        { value: 3, label: '😐 Okay' },
        { value: 2, label: '😕 Poor' },
        { value: 1, label: '😞 Very Poor' }
      ]
    }));
  }
}

// ========== ENHANCED MESSAGE HANDLERS ========== //
async function handleCustomerMessage(ws, sessionId, message) {
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, {
      customerWs: ws,
      messages: [],
      hasHuman: false,
      agentWs: null,
      startTime: new Date(),
      customerInfo: null
    });
    setupCustomerTimeout(sessionId);
  }

  const conversation = conversations.get(sessionId);
  conversation.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date()
  });

  clearCustomerTimeout(sessionId);
  setupCustomerTimeout(sessionId);

  // If already connected to human agent, forward message
  if (conversation.hasHuman && conversation.agentWs) {
    if (conversation.agentWs.readyState === WebSocket.OPEN) {
      conversation.agentWs.send(JSON.stringify({
        type: 'customer_message',
        sessionId,
        message,
        timestamp: new Date()
      }));
    } else {
      const agentId = conversation.assignedAgent;
      console.log(`Agent ${agentId} connection lost for session ${sessionId}`);

      if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
        conversation.customerWs.send(JSON.stringify({
          type: 'agent_disconnected_temp',
          message: 'Your agent seems to have lost connection. Please wait while they reconnect...'
        }));
      }

      if (!agentReconnectTimeouts.has(agentId)) {
        setupAgentReconnectTimeout(agentId, sessionId);
      }
    }
    return;
  }

  try {
    const aiResponse = await generateAIResponse(message, conversation.messages);

    if (aiResponse.type === 'handoff_suggestion' || aiResponse.type === 'no_knowledge') {
      // Log customer intent with customer info
      console.log('🔍 Logging handoff intent with customer info:', conversation.customerInfo);
      await knowledgeDB.logCustomerIntent(
        sessionId,
        message,
        aiResponse.intent || 'unknown',
        aiResponse.category || 'general',
        aiResponse.confidence || 0,
        [],
        aiResponse.type,
        conversation.customerInfo
      );

      // Show AI response directly in handoff popup
      ws.send(JSON.stringify({
        type: 'handoff_offer',
        sessionId,
        message: aiResponse.message,
        reason: aiResponse.reason
      }));

      return;
    }

    if (aiResponse.type === 'ai_response') {
      conversation.messages.push({
        role: 'assistant',
        content: aiResponse.message,
        timestamp: new Date()
      });

      // Log customer intent with customer info
      console.log('🔍 Logging AI response intent with customer info:', conversation.customerInfo);
      await knowledgeDB.logCustomerIntent(
        sessionId,
        message,
        aiResponse.intent || 'general',
        aiResponse.category || 'general',
        aiResponse.confidence || aiResponse.sources?.[0]?.similarity || 0,
        aiResponse.sources || [],
        'ai_response',
        conversation.customerInfo
      );

      ws.send(JSON.stringify({
        type: 'ai_response',
        message: aiResponse.message,
        sessionId,
        sources: aiResponse.sources
      }));
    } else {
      // Error case
      conversation.messages.push({
        role: 'assistant',
        content: aiResponse.message,
        timestamp: new Date()
      });

      ws.send(JSON.stringify({
        type: 'error',
        message: aiResponse.message,
        sessionId
      }));
    }
  } catch (error) {
    console.error('AI error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Sorry, I encountered an error. Would you like to connect with a human agent?'
    }));
  }
}

// Keep all existing handler functions (handleAgentJoin, handleAcceptRequest, etc.)
function handleAgentJoin(ws, data) {
  const { agentId, token } = data;

  let user;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: userData } = await supabase
      .from('agent_users')
      .select('*')
      .eq('id', decoded.agentId)
      .eq('is_active', true)
      .single();
    user = userData;
    if (!user || !user.isActive) {
      ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid user account' }));
      ws.close();
      return;
    }
  } catch (error) {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
    ws.close();
    return;
  }

  console.log(`Agent ${user.name} (${user.username}) attempting to connect`);

  const wasReconnected = handleAgentReconnection(agentId, ws, user);

  if (!wasReconnected) {
    // If agent already exists, just update the WebSocket (don't create duplicate)
    if (humanAgents.has(agentId)) {
      const existingAgent = humanAgents.get(agentId);
      existingAgent.ws = ws;
      console.log(`Updated WebSocket for existing agent ${user.name}`);
    } else {
      humanAgents.set(agentId, {
        ws,
        user,
        status: 'online',
        sessionId: null
      });
    }
  }

  ws.send(JSON.stringify({
    type: 'agent_status',
    message: wasReconnected ? `Welcome back, ${user.name}! Connection restored.` : `Welcome, ${user.name}! You're now online.`,
    waitingCustomers: waitingQueue.length,
    totalAgents: humanAgents.size,
    status: wasReconnected ? 'reconnected' : 'online',
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role
    }
  }));

  if (!wasReconnected) {
    waitingQueue.forEach((sessionId, index) => {
      const conversation = conversations.get(sessionId);
      if (conversation) {
        ws.send(JSON.stringify({
          type: 'pending_request',
          sessionId,
          position: index + 1,
          totalInQueue: waitingQueue.length,
          lastMessage: conversation.messages.slice(-1)[0]?.content || "New request"
        }));
      }
    });

    humanAgents.forEach((agentData, otherId) => {
      if (otherId !== agentId && agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
        agentData.ws.send(JSON.stringify({
          type: 'agent_joined',
          agentId: agentId,
          agentName: user.name,
          totalAgents: humanAgents.size
        }));
      }
    });
  }
}

function handleAcceptRequest(sessionId, agentId) {
  const conversation = conversations.get(sessionId);
  const agentData = humanAgents.get(agentId);

  if (!conversation || !agentData) {
    console.log('Cannot accept request - conversation or agent not found');
    return;
  }

  if (conversation.hasHuman) {
    if (agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
      agentData.ws.send(JSON.stringify({
        type: 'request_already_taken',
        message: 'This customer has already been assigned to another agent',
        sessionId
      }));
    }
    return;
  }

  conversation.hasHuman = true;
  conversation.agentWs = agentData.ws;
  conversation.assignedAgent = agentId;
  conversation.agentName = agentData.user.name;

  agentSessions.set(agentId, sessionId);
  sessionAgentMap.set(sessionId, agentId);

  agentData.status = 'busy';
  agentData.sessionId = sessionId;

  clearCustomerTimeout(sessionId);

  const index = waitingQueue.indexOf(sessionId);
  if (index > -1) waitingQueue.splice(index, 1);

  humanAgents.forEach((otherAgentData, otherId) => {
    if (otherId !== agentId && otherAgentData.ws && otherAgentData.ws.readyState === WebSocket.OPEN) {
      otherAgentData.ws.send(JSON.stringify({
        type: 'request_taken',
        sessionId,
        takenBy: agentData.user.name,
        remainingQueue: waitingQueue.length
      }));
    }
  });

  if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
    conversation.customerWs.send(JSON.stringify({
      type: 'human_joined',
      message: `${agentData.user.name} has joined the chat!`
    }));
  }

  if (agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
    agentData.ws.send(JSON.stringify({
      type: 'customer_assigned',
      sessionId,
      history: conversation.messages,
      queuePosition: 0,
      cannedResponses: [
        "Thank you for contacting us! How can I assist you today?",
        "I understand your concern. Let me look into this for you right away.",
        "Is there anything else I can help you with?",
        "Let me transfer you to a specialist who can better assist you.",
        "Thank you for your patience. I have the information you need.",
        "I apologize for any inconvenience. Let me resolve this for you.",
        "Your issue has been resolved. Is there anything else you need help with?"
      ]
    }));
    console.log(`✅ Customer assigned message sent to agent ${agentData.user.name}`);
  } else {
    console.log(`❌ Agent WebSocket not available for ${agentData.user.name}`);
  }

  console.log(`Agent ${agentData.user.name} accepted request for session ${sessionId}. Queue now: ${waitingQueue.length}`);
}

function handleAgentMessage(sessionId, message, messageType = 'text') {
  console.log(`\n=== AGENT MESSAGE DEBUG ===`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Message: ${message}`);
  
  const conversation = conversations.get(sessionId);
  if (!conversation) {
    console.log('❌ Cannot send agent message - conversation not found');
    console.log(`Available conversations: ${Array.from(conversations.keys()).join(', ')}`);
    return;
  }
  
  console.log(`✅ Conversation found`);
  console.log(`Has human: ${conversation.hasHuman}`);
  console.log(`Assigned agent: ${conversation.assignedAgent}`);
  console.log(`Agent name: ${conversation.agentName}`);

  if (!conversation.customerWs) {
    console.log('❌ Cannot send agent message - customer not connected');
    return;
  }
  
  console.log(`✅ Customer WebSocket exists`);
  console.log(`Customer WebSocket state: ${conversation.customerWs.readyState}`);

  conversation.messages.push({
    role: 'agent',
    content: message,
    messageType,
    timestamp: new Date()
  });

  if (conversation.customerWs.readyState === WebSocket.OPEN) {
    conversation.customerWs.send(JSON.stringify({
      type: 'agent_message',
      message,
      messageType,
      timestamp: new Date()
    }));
    console.log(`✅ Agent message sent successfully to customer`);
  } else {
    console.log(`❌ Customer WebSocket not open (state: ${conversation.customerWs.readyState})`);
  }
  console.log(`=== END DEBUG ===\n`);
}

function handleEndChat(sessionId, endReason = 'agent_ended') {
  const conversation = conversations.get(sessionId);
  if (!conversation) return;

  const agentId = conversation.assignedAgent;
  const agentData = humanAgents.get(agentId);

  saveChatHistory(sessionId, endReason);

  // Notify customer and show survey if session had human agent
  if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN && endReason !== 'agent_timeout') {
    if (endReason === 'agent_ended' || endReason === 'customer_ended') {
      sendSatisfactionSurvey(conversation.customerWs, sessionId, 'human_agent');
    }

    setTimeout(() => {
      if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
        const message = endReason === 'agent_timeout'
          ? 'Your agent has been disconnected for too long. The chat has been ended. Feel free to start a new conversation!'
          : endReason === 'customer_ended'
          ? 'Session ended. Thank you for chatting with us!'
          : 'The agent has ended the chat. Feel free to ask me anything else!';

        conversation.customerWs.send(JSON.stringify({
          type: 'agent_left',
          message: message
        }));
      }
    }, endReason === 'customer_ended' ? 0 : 5000);
  }

  // Notify agent if session ended by customer
  if (conversation.agentWs && conversation.agentWs.readyState === WebSocket.OPEN && endReason === 'customer_ended') {
    conversation.agentWs.send(JSON.stringify({
      type: 'session_ended_by_customer',
      sessionId,
      message: 'Customer has ended the session.'
    }));
  }

  // Clean up conversation state
  conversation.hasHuman = false;
  conversation.agentWs = null;
  conversation.assignedAgent = null;
  conversation.agentName = null;

  if (agentId) {
    if (agentData) {
      agentData.status = 'online';
      agentData.sessionId = null;
    }
    agentSessions.delete(agentId);
    sessionAgentMap.delete(sessionId);

    if (agentReconnectTimeouts.has(agentId)) {
      clearTimeout(agentReconnectTimeouts.get(agentId));
      agentReconnectTimeouts.delete(agentId);
    }
  }

  // Notify other agents
  humanAgents.forEach((otherAgentData, otherId) => {
    if (otherId !== agentId && otherAgentData.ws && otherAgentData.ws.readyState === WebSocket.OPEN) {
      otherAgentData.ws.send(JSON.stringify({
        type: 'chat_ended',
        sessionId,
        endedBy: endReason === 'customer_ended' ? 'Customer' : (agentData ? agentData.user.name : 'Unknown'),
        endReason,
        totalQueue: waitingQueue.length
      }));
    }
  });

  console.log(`Chat ended for session ${sessionId} by ${endReason}. Agent: ${agentData ? agentData.user.name : 'Unknown'}`);
}

async function handleHumanRequest(sessionId, customerInfo = null) {
  console.log('🔍 handleHumanRequest called with:', { sessionId, customerInfo });
  const conversation = conversations.get(sessionId);
  if (!conversation) {
    console.log('❌ No conversation found for session:', sessionId);
    return;
  }

  // Use provided customer info or existing stored info
  const finalCustomerInfo = customerInfo || conversation.customerInfo;
  
  if (finalCustomerInfo) {
    console.log('✅ Using customer info:', finalCustomerInfo);
    conversation.customerInfo = finalCustomerInfo;
    
    // Log customer intent with info
    await knowledgeDB.logCustomerIntent(
      sessionId,
      'Customer requested human support',
      'human_request',
      'support',
      0,
      [],
      'human_request',
      finalCustomerInfo
    );
    console.log('✅ Customer intent logged with info');
  } else {
    console.log('⚠️ No customer info available');
    // Log human request without customer info
    await knowledgeDB.logCustomerIntent(
      sessionId,
      'Customer requested human support',
      'human_request',
      'support',
      0,
      [],
      'human_request'
    );
    console.log('✅ Customer intent logged without info');
  }

  // Get all agents with active WebSocket connections for notifications
  const connectedAgents = Array.from(humanAgents.values()).filter(agent => 
    agent.ws && agent.ws.readyState === WebSocket.OPEN
  );

  // Check if any agents are available with active connections
  if (connectedAgents.length === 0) {
    conversation.customerWs.send(JSON.stringify({
      type: 'no_agents_available',
      message: 'Sorry, no human agents are currently available. Please try again later or continue chatting with me!'
    }));
    return;
  }

  if (!waitingQueue.includes(sessionId)) {
    waitingQueue.push(sessionId);
  }

  const queuePosition = waitingQueue.indexOf(sessionId) + 1;

  // Send notifications to agents with active WebSocket connections
  connectedAgents.forEach((agentData) => {
    agentData.ws.send(JSON.stringify({
      type: 'pending_request',
      sessionId,
      position: queuePosition,
      totalInQueue: waitingQueue.length,
      lastMessage: conversation.messages.slice(-1)[0]?.content || "Customer wants to speak with human"
    }));
  });

  if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
    conversation.customerWs.send(JSON.stringify({
      type: 'waiting_for_human',
      message: `You've been added to the queue (position ${queuePosition}). A human agent will be with you shortly.`
    }));
  }

  console.log(`Human request added to queue for session ${sessionId}, position ${queuePosition}`);
}

// ========== ENHANCED MESSAGE HANDLING ========== //
async function handleWebSocketMessage(ws, data) {
  try {
    console.log('Received message:', data.type);

    switch(data.type) {
      case 'customer_message':
        await handleCustomerMessage(ws, data.sessionId, data.message);
        break;
      case 'agent_join':
        handleAgentJoin(ws, data);
        break;
      case 'agent_message':
        console.log(`Received agent_message for session ${data.sessionId}`);
        handleAgentMessage(data.sessionId, data.message);
        break;
      case 'request_human':
        console.log('🔍 Received request_human message:', data);
        // Store customer info in conversation if provided
        if (data.customerInfo) {
          const conversation = conversations.get(data.sessionId);
          if (conversation) {
            conversation.customerInfo = data.customerInfo;
            console.log('✅ Stored customer info in conversation:', data.customerInfo);
          }
        }
        await handleHumanRequest(data.sessionId, data.customerInfo);
        break;
      case 'customer_info_submitted':
        // Handle customer info submission
        console.log('🔍 Received customer_info_submitted:', data);
        const infoConversation = conversations.get(data.sessionId);
        if (infoConversation && data.customerInfo) {
          infoConversation.customerInfo = data.customerInfo;
          console.log('✅ Stored customer info from submission:', data.customerInfo);
        }
        break;
      case 'accept_request':
        console.log(`Agent ${data.agentId} accepting request ${data.sessionId}`);
        handleAcceptRequest(data.sessionId, data.agentId);
        break;
      case 'end_chat':
        handleEndChat(data.sessionId);
        break;
      case 'restore_session':
        handleCustomerSessionRestore(ws, data.sessionId, data.customerInfo);
        break;
      case 'handoff_response':
        // Handle customer's response to handoff offer
        if (data.accepted) {
          // Directly connect using stored customer info
          await handleHumanRequest(data.sessionId, null);
        } else {
          const conversation = conversations.get(data.sessionId);
          if (conversation && conversation.customerWs) {
            // Reset AI state - don't add to history to avoid loop
            conversation.customerWs.send(JSON.stringify({
              type: 'ai_response',
              message: "No problem! I'm here to help. What else can I assist you with?",
              sessionId: data.sessionId
            }));
          }
        }
        break;
      case 'end_session':
        // Handle customer ending session
        const conversation = conversations.get(data.sessionId);
        if (conversation) {
          if (conversation.hasHuman) {
            // End chat with human agent
            handleEndChat(data.sessionId, 'customer_ended');
          } else {
            // Show survey for AI-only conversations if they had meaningful interaction
            if (conversation.messages && conversation.messages.length > 2) {
              sendSatisfactionSurvey(conversation.customerWs, data.sessionId, 'ai_only');
              
              setTimeout(() => {
                // Clear the session for AI-only conversations after survey
                conversations.delete(data.sessionId);
                clearCustomerTimeout(data.sessionId);
                
                // Remove from waiting queue if present
                const queueIndex = waitingQueue.indexOf(data.sessionId);
                if (queueIndex > -1) {
                  waitingQueue.splice(queueIndex, 1);
                  
                  // Notify agents about queue update
                  humanAgents.forEach((agentData, agentId) => {
                    if (agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
                      agentData.ws.send(JSON.stringify({
                        type: 'customer_left_queue',
                        sessionId: data.sessionId,
                        remainingQueue: waitingQueue.length
                      }));
                    }
                  });
                }
              }, 10000); // Give time for survey completion
            } else {
              // No meaningful interaction, just end session
              conversations.delete(data.sessionId);
              clearCustomerTimeout(data.sessionId);
            }

            if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
              conversation.customerWs.send(JSON.stringify({
                type: 'session_ended',
                message: 'Session ended. Thank you for chatting with us!'
              }));
            }
          }
        }
        break;
      case 'file_uploaded':
        // Handle file upload notification
        const fileConversation = conversations.get(data.sessionId);
        if (fileConversation && fileConversation.agentWs && fileConversation.agentWs.readyState === WebSocket.OPEN) {
          fileConversation.agentWs.send(JSON.stringify({
            type: 'customer_file_uploaded',
            sessionId: data.sessionId,
            fileInfo: data.fileInfo
          }));
        }
        break;
      case 'satisfaction_response':
        // Handle satisfaction survey response
        await saveFeedbackToDatabase(data);
        const historyIndex = chatHistory.findIndex(h => h.sessionId === data.sessionId);
        if (historyIndex !== -1) {
          chatHistory[historyIndex].customerSatisfaction = {
            rating: data.rating,
            feedback: data.feedback,
            timestamp: new Date()
          };
          console.log(`Satisfaction response saved for session ${data.sessionId}: ${data.rating}/5`);
        }
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('Message handling error:', error);
  }
}

// ========== WEBSOCKET SETUP ========== //
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('Message parse error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');

    // Clean up disconnected agents
    for (const [agentId, agentData] of humanAgents) {
      if (agentData.ws === ws) {
        const sessionId = agentSessions.get(agentId);

        if (sessionId) {
          const conversation = conversations.get(sessionId);
          if (conversation && conversation.hasHuman) {
            console.log(`Agent ${agentData.user.name} disconnected from session ${sessionId}`);

            if (!agentReconnectTimeouts.has(agentId)) {
              setupAgentReconnectTimeout(agentId, sessionId);
            }

            if (conversation.customerWs && conversation.customerWs.readyState === WebSocket.OPEN) {
              conversation.customerWs.send(JSON.stringify({
                type: 'agent_disconnected_temp',
                message: 'Your agent seems to have lost connection. They should be back shortly...'
              }));
            }
          }
        }

        // Don't delete agent, just mark WebSocket as null to keep them available
        agentData.ws = null;
        console.log(`Agent ${agentData.user.name} (${agentId}) WebSocket disconnected but keeping agent available`);
        break;
      }
    }

    // Clean up disconnected customers
    for (const [sessionId, conversation] of conversations) {
      if (conversation.customerWs === ws) {
        console.log(`Customer ${sessionId} disconnected`);

        clearCustomerTimeout(sessionId);
        clearCustomerIdleTimeout(sessionId);

        const queueIndex = waitingQueue.indexOf(sessionId);
        if (queueIndex > -1) {
          waitingQueue.splice(queueIndex, 1);

          humanAgents.forEach((agentData, agentId) => {
            if (agentData.ws && agentData.ws.readyState === WebSocket.OPEN) {
              agentData.ws.send(JSON.stringify({
                type: 'customer_left_queue',
                sessionId,
                remainingQueue: waitingQueue.length
              }));
            }
          });
        }

        if (conversation.hasHuman) {
          saveChatHistory(sessionId, 'customer_disconnected');
        }

        break;
      }
    }
  });
});

// ========== AUTHENTICATION ROUTES ========== //
app.post('/api/agent/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await UserService.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        agentId: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/agent/validate', verifyToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('agent_users')
      .select('*')
      .eq('id', req.user.agentId)
      .eq('is_active', true)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid user account' });
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ========== KNOWLEDGE BASE API ROUTES ========== //
const multer = require('multer');
const PDFIngestionService = require('./knowledge-base/ingest-pdf');

// Configure multer for knowledge base uploads
const kbUpload = multer({ 
  dest: './temp/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/plain' // .txt
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, Excel, and text files are allowed'));
    }
  }
});

// Configure multer for customer attachments
const upload = multer({
  dest: './uploads/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

const pdfIngestionService = new PDFIngestionService();

// Upload documents endpoint
app.post('/api/knowledge-base/upload', verifyToken, kbUpload.array('documents', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const title = req.body.title || '';
    const results = [];
    let successCount = 0;

    for (const file of req.files) {
      try {
        // Determine file type and process accordingly
        const fileExt = file.originalname.split('.').pop().toLowerCase();
        const cleanTitle = title || file.originalname.replace(/\.[^/.]+$/, '');
        
        const result = await pdfIngestionService.ingestDocument(file.path, cleanTitle, fileExt);
        results.push({ filename: file.originalname, ...result });
        if (result.success) successCount++;
        
        // Clean up uploaded file
        require('fs').unlinkSync(file.path);
      } catch (error) {
        console.error(`Failed to process ${file.originalname}:`, error);
        results.push({ 
          filename: file.originalname, 
          success: false, 
          error: error.message 
        });
        
        // Clean up uploaded file even on error
        try {
          require('fs').unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Failed to cleanup file:', cleanupError);
        }
      }
    }

    res.json({
      success: true,
      processedFiles: successCount,
      totalFiles: req.files.length,
      results: results
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all documents
app.get('/api/knowledge-base/documents', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const documents = await knowledgeDB.getGroupedDocuments(limit);
    res.json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete document
app.delete('/api/knowledge-base/documents/:id', verifyToken, async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.id);
    console.log('Delete request for identifier:', identifier);
    
    // Check if it's a numeric ID (single chunk) or title (document group)
    if (/^\d+$/.test(identifier)) {
      // Delete single chunk by ID
      const id = parseInt(identifier);
      console.log('Deleting single chunk with ID:', id);
      await knowledgeDB.deleteDocument(id);
    } else {
      // Delete entire document group by title
      console.log('Deleting document group with title:', identifier);
      await knowledgeDB.deleteDocumentGroup(identifier);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get knowledge base statistics
app.get('/api/knowledge-base/stats', verifyToken, async (req, res) => {
  try {
    const stats = await knowledgeDB.getDocumentStats();
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== FEEDBACK STORAGE ========== //
async function saveFeedbackToDatabase(data) {
  try {
    const conversation = conversations.get(data.sessionId);
    const historyRecord = chatHistory.find(h => h.sessionId === data.sessionId);
    
    // Use customer info from conversation if available
    const customerInfo = conversation?.customerInfo;
    
    const { error } = await supabase
      .from('customer_feedback')
      .insert({
        session_id: data.sessionId,
        customer_name: customerInfo?.company || null,
        customer_email: customerInfo?.email || null,
        rating: data.rating,
        feedback_text: data.feedback || null,
        interaction_type: data.interactionType || 'human_agent',
        agent_id: conversation?.assignedAgent || historyRecord?.agentId || null,
        agent_name: conversation?.agentName || historyRecord?.agentName || null
      });

    if (error) {
      console.error('Error saving feedback to database:', error);
    } else {
      console.log(`Feedback saved to database for session ${data.sessionId}`);
    }
  } catch (error) {
    console.error('Database error saving feedback:', error);
  }
}

// ========== ROUTES ========== //
app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/agent-dashboard.html'));
});

app.get('/kb-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/kb-login.html'));
});

app.get('/knowledge-base', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/knowledge-base.html'));
});

app.get('/feedback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/feedback-dashboard.html'));
});

app.get('/intents', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/intents-dashboard.html'));
});

app.get('/files', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/file-history.html'));
});

// Test knowledge base endpoint
app.get('/test-kb', async (req, res) => {
  try {
    const query = req.query.q || 'pricing';
    console.log('Testing knowledge base with query:', query);
    
    // Test direct database query first
    const { data: allDocs, error: countError } = await supabase
      .from('documents')
      .select('id, content, metadata')
      .limit(5);
    
    if (countError) {
      return res.json({ error: 'Database connection failed', details: countError });
    }
    
    console.log(`Found ${allDocs?.length || 0} total documents in database`);
    
    // Test embedding search
    const results = await searchKnowledgeBase(query, 3);
    
    // Test direct function call
    const queryEmbedding = await generateEmbedding(query);
    const { data: directResults, error: directError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0,
      match_count: 3
    });
    
    console.log('Direct function test:', directResults?.length || 0, 'results');
    if (directError) console.log('Direct function error:', directError);
    
    res.json({
      query,
      totalDocuments: allDocs?.length || 0,
      sampleDocuments: allDocs?.map(doc => ({ id: doc.id, preview: doc.content?.substring(0, 100) + '...' })) || [],
      searchResults: results.length,
      results: results.map(r => ({ 
        similarity: r.similarity, 
        preview: r.content?.substring(0, 100) + '...' 
      })),
      directResults: directResults?.map(r => ({
        similarity: r.similarity,
        preview: r.content?.substring(0, 100) + '...'
      })) || [],
      threshold: SIMILARITY_THRESHOLD,
      embeddingLength: queryEmbedding?.length
    });
  } catch (error) {
    console.error('Test KB error:', error);
    res.json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    agents: humanAgents.size,
    queue: waitingQueue.length,
    conversations: conversations.size,
    activeAgents: Array.from(humanAgents.values()).filter(agent => agent.status === 'online').length,
    activeSessions: agentSessions.size
  });
});

app.get('/analytics', verifyToken, (req, res) => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentChats = chatHistory.filter(chat => chat.endTime >= last24h);
  const avgSatisfaction = recentChats
    .filter(chat => chat.customerSatisfaction?.rating)
    .reduce((sum, chat, _, arr) => sum + (chat.customerSatisfaction.rating / arr.length), 0);

  const avgChatDuration = recentChats.length > 0
    ? recentChats.reduce((sum, chat, _, arr) => {
        const duration = chat.endTime - chat.startTime;
        return sum + (duration / arr.length);
      }, 0) / 1000 / 60
    : 0;

  res.json({
    totalChats: chatHistory.length,
    last24hChats: recentChats.length,
    averageSatisfaction: Math.round(avgSatisfaction * 100) / 100,
    averageChatDuration: Math.round(avgChatDuration * 100) / 100,
    currentQueue: waitingQueue.length,
    activeAgents: humanAgents.size,
    agentStatuses: Object.fromEntries([...humanAgents.entries()].map(([id, data]) => [id, {
      name: data.user.name,
      username: data.user.username,
      status: data.status,
      sessionId: data.sessionId
    }])),
    pendingReconnections: agentSessions.size
  });
});

app.get('/chat-history', verifyToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentChats = chatHistory
    .slice(-limit)
    .map(chat => ({
      sessionId: chat.sessionId,
      startTime: chat.startTime,
      endTime: chat.endTime,
      agentId: chat.agentId,
      agentName: chat.agentName,
      messageCount: chat.messages.length,
      satisfaction: chat.customerSatisfaction?.rating || null,
      endReason: chat.endReason
    }));

  res.json(recentChats);
});

// Get customer feedback with filters
app.get('/api/feedback', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    let query = supabase
      .from('customer_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (req.query.interaction_type) {
      query = query.eq('interaction_type', req.query.interaction_type);
    }
    if (req.query.rating) {
      query = query.eq('rating', parseInt(req.query.rating));
    }
    if (req.query.date_from) {
      query = query.gte('created_at', req.query.date_from);
    }
    if (req.query.date_to) {
      query = query.lte('created_at', req.query.date_to + 'T23:59:59');
    }

    const { data, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// File upload endpoint
app.post('/api/upload-attachment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID required' });
    }

    // Store file info in database
    const { error } = await supabase
      .from('customer_attachments')
      .insert({
        session_id: sessionId,
        filename: req.file.filename,
        original_filename: req.file.originalname,
        file_size: req.file.size,
        file_type: req.file.mimetype,
        file_url: `/uploads/${req.file.filename}`
      });

    if (error) {
      console.error('Error saving attachment:', error);
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    res.json({
      success: true,
      fileInfo: {
        filename: req.file.originalname,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get attachments for session
app.get('/api/attachments/:sessionId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_attachments')
      .select('*')
      .eq('session_id', req.params.sessionId)
      .order('uploaded_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve uploaded files with original filename
app.get('/uploads/:filename', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('customer_attachments')
      .select('original_filename')
      .eq('filename', req.params.filename)
      .single();

    if (error || !data) {
      return res.status(404).send('File not found');
    }

    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.download(filePath, data.original_filename);
  } catch (error) {
    res.status(500).send('Error downloading file');
  }
});

// Get customer intents with filters
app.get('/api/intents', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    let query = supabase
      .from('customer_intents')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (req.query.intent_category) {
      query = query.eq('intent_category', req.query.intent_category);
    }
    if (req.query.response_type) {
      query = query.eq('response_type', req.query.response_type);
    }
    if (req.query.date_from) {
      query = query.gte('created_at', req.query.date_from);
    }
    if (req.query.date_to) {
      query = query.lte('created_at', req.query.date_to + 'T23:59:59');
    }

    if (req.query.customer_company) {
      query = query.ilike('customer_company', `%${req.query.customer_company}%`);
    }
    if (req.query.customer_email) {
      query = query.ilike('customer_email', `%${req.query.customer_email}%`);
    }

    const { data, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching intents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get file history with filters
app.get('/api/file-history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    let query = supabase
      .from('customer_attachments')
      .select('*')
      .order('uploaded_at', { ascending: false });

    // Apply filters
    if (req.query.session_id) {
      query = query.eq('session_id', req.query.session_id);
    }
    if (req.query.file_type) {
      query = query.like('file_type', `${req.query.file_type}%`);
    }
    if (req.query.date_from) {
      query = query.gte('uploaded_at', req.query.date_from);
    }
    if (req.query.date_to) {
      query = query.lte('uploaded_at', req.query.date_to + 'T23:59:59');
    }

    const { data, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching file history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete selected attachments
app.delete('/api/delete-attachments', verifyToken, async (req, res) => {
  try {
    const { fileIds } = req.body;
    
    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'No file IDs provided' });
    }

    // Get file info before deletion for cleanup
    const { data: files, error: fetchError } = await supabase
      .from('customer_attachments')
      .select('filename')
      .in('id', fileIds);

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('customer_attachments')
      .delete()
      .in('id', fileIds);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    // Delete physical files
    const fs = require('fs');
    const path = require('path');
    
    files.forEach(file => {
      try {
        const filePath = path.join(__dirname, 'uploads', file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Error deleting file ${file.filename}:`, error);
      }
    });

    res.json({ success: true, deletedCount: fileIds.length });
  } catch (error) {
    console.error('Error deleting attachments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Initialize and start server
async function startServer() {
  await initializeDefaultUsers();
  
  // Feedback table should already exist from setup-complete-database.sql
  console.log('✅ Using existing feedback table from database setup');

  server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
    console.log('✅ Database-based user authentication initialized');
    console.log('Default credentials:');
    console.log('- Username: admin, Password: ChangeMe123! (change via ADMIN_PASSWORD env var)');
    console.log('- Username: saw.andrew, Password: Agent123! (change via AGENT_PASSWORD env var)');
    console.log('- Username: blaze.hein, Password: Agent123! (change via AGENT_PASSWORD env var)');
  });
}

startServer();