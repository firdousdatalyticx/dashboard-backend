const mongoose = require('mongoose');

/* ------------ Embedded schema for individual messages ------------ */
const MessageSchema = new mongoose.Schema({
  sender:      { type: String, required: true },
  senderType:  { type: String, enum: ['user', 'customer'], required: true },
  senderName:  { type: String, required: true },
  content:     { type: String, required: true },
  timestamp:   { type: Date,   default: Date.now },
  read:        { type: Boolean, default: false }
});

/* ------------ Main schema (was “Chat”, now “Conversation”) ------------ */
const ConversationSchema = new mongoose.Schema({
  chatId:      { type: String, required: true, unique: true },
  customerId:  { type: String, required: true, ref: 'Customer' },
  userId:      { type: String, required: true },
  userName:    { type: String, required: true },

  status:      { type: String, enum: ['active', 'closed'], default: 'active' },

  messages:     [MessageSchema],
  unreadCount:  { type: Number, default: 0 },
  lastMessage:  { type: Date,   default: Date.now },

  createdAt:    { type: Date,   default: Date.now },
  updatedAt:    { type: Date,   default: Date.now }
});

/* -- Update timestamps before every save -- */
ConversationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  if (this.messages?.length) {
    this.lastMessage = this.messages[this.messages.length - 1].timestamp;
  }
  next();
});

/* -- Indexes for faster look-ups -- */
ConversationSchema.index({ customerId: 1, userId: 1 });
ConversationSchema.index({ chatId: 1 });
ConversationSchema.index({ lastMessage: -1 });

/* ------------ Export model (renamed) ------------ */
module.exports = mongoose.model('Conversation', ConversationSchema);
// If you need a fixed collection name, use:
// module.exports = mongoose.model('Conversation', ConversationSchema, 'yourCollectionName');
