// Simple in-memory chat session store
// In production, you might want to use Redis or a database
const chatSessions = new Map();

const createChatSession = (chat) => {
  const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  chatSessions.set(chatId, chat);
  return chatId;
};

const getChatSession = (chatId) => {
  return chatSessions.get(chatId);
};

const deleteChatSession = (chatId) => {
  return chatSessions.delete(chatId);
};

// Optional: Clean up old sessions (you can call this periodically)
const cleanupOldSessions = (maxAge = 24 * 60 * 60 * 1000) => { // 24 hours default
  const now = Date.now();
  for (const [chatId, chat] of chatSessions.entries()) {
    // If you have a createdAt timestamp, you can check it here
    // For now, we'll skip this as the chat object doesn't have timestamps
  }
};

module.exports = {
  createChatSession,
  getChatSession,
  deleteChatSession,
  cleanupOldSessions
};
