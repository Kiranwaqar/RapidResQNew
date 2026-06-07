const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');

dotenv.config();

// Lazily import and initialize Groq (ESM) to avoid require-time ESM errors on serverless
let groq = null;
const getGroq = async () => {
  if (groq) return groq;
  try {
    // Try several possible import paths to be robust across installs
    let mod;
    const candidates = ['groq-sdk/index.mjs', 'groq-sdk', 'groq', '@groq/sdk'];
    for (const candidate of candidates) {
      try {
        mod = await import(candidate);
        break;
      } catch (e) {
        // continue
      }
    }

    if (!mod) {
      throw new Error('groq-sdk not found');
    }

    const Groq = mod.default || mod;
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groq;
  } catch (e) {
    console.error('Failed to load groq-sdk:', e);
    throw e;
  }
};

// Keep last 5 messages for context per conversation
const conversations = new Map();

// Emergency keywords
const dangerWords = [
  'bleeding',
  'stabbed',
  'fire',
  'trapped',
  'danger',
  'hurt'
];

// System prompt for the chatbot
const systemPrompt = {
  role: 'system',
  content: `You are a kind and helpful Crisis Helper Bot. 
Help people calmly with emergencies like panic attacks, disasters, or unsafe situations. 
Give short step-by-step instructions. 
If life-threatening, tell them to call local emergency services. 
Do not answer unrelated questions. 
Always respond in the same language the user is writing in. 
Example responses: 
- Panic attack: 'Stay with me 💙. Try inhale 4s, hold 4s, exhale 6s. Repeat 3 times.' 
- Earthquake: 'Stay calm 🙏. Drop, cover your head, hold on. Are you indoors or outdoors?' 
- Unsafe home: 'Call local emergency services if in danger. Can I share helpline numbers?'`
};

// POST /api/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Use userId for conversation tracking, default to 'default'
    const conversationId = userId || 'default';

    // Get or create conversation memory
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, [systemPrompt]);
    }

    const memory = conversations.get(conversationId);

    // Add user message to memory
    memory.push({
      role: 'user',
      content: message
    });

    // Keep last 5 messages + system prompt
    if (memory.length > 6) {
      // Keep system prompt at index 0, remove oldest user/assistant pairs
      const systemMsg = memory[0];
      memory.splice(0, memory.length);
      memory.push(systemMsg);
      memory.push(...conversations.get(conversationId).slice(-5));
    }

    // Get AI response from Groq
    let botReply = null;
    try {
      const client = await getGroq();
      const response = await client.chat.completions.create({
        model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
        messages: memory
      });

      botReply = response.choices[0].message.content;
    } catch (e) {
      console.error('Groq request failed, using fallback reply:', e && e.message ? e.message : e);
      // Fallback simple responder
      if (dangerWords.some(word => message.toLowerCase().includes(word))) {
        botReply = "If someone is in immediate danger, call local emergency services now. Provide your exact location and follow their instructions.";
      } else {
        botReply = "Hello — the AI assistant is temporarily unavailable. Please describe your emergency briefly and we will help as best as we can.";
      }
    }

    // Check for emergency keywords and prepend warning
    let finalReply = botReply;
    if (dangerWords.some(word => message.toLowerCase().includes(word))) {
      finalReply = '🚨 Please call local emergency services immediately!\n\n' + botReply;
    }

    // Add bot response to memory
    memory.push({
      role: 'assistant',
      content: finalReply
    });

    // Update conversation
    conversations.set(conversationId, memory);

    return res.json({
      success: true,
      reply: finalReply
    });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get chat response',
      error: error.message
    });
  }
});

// GET /api/chat/clear - Clear conversation history (optional)
router.get('/chat/clear/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    if (conversations.has(userId)) {
      conversations.delete(userId);
    }
    return res.json({
      success: true,
      message: 'Conversation cleared'
    });
  } catch (error) {
    console.error('Clear conversation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear conversation'
    });
  }
});

module.exports = router;