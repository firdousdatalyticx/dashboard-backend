/* ─────────  setupConversationSocket.js  ───────── */
const Conversation = require('../models/Conversation');  //  ← renamed
const Customer     = require('../models/Customer');

// Keep track of connected users and customers
const connectedUsers     = new Map();
const connectedCustomers = new Map();

const setupConversationSocket = (io) => {
  /* ------------ 1. Authenticate every socket ------------ */
  io.use((socket, next) => {
    const { userId, customerId } = socket.handshake.auth;
    if (customerId) socket.customerId = customerId.toString();
    if (userId)     socket.userId     = userId.toString();

    console.log('Auth attempt:', {
      userId  : socket.userId,
      customerId: socket.customerId,
      socketId  : socket.id
    });

    if (!socket.userId && !socket.customerId) {
      return next(new Error('Authentication error'));
    }
    next();
  });

  /* ------------ 2. New connection ------------ */
  io.on('connection', async (socket) => {
    console.log('New connection:', socket.id);

    /* ---- 2-a  User side ---- */
    if (socket.userId) {
      connectedUsers.set(socket.userId, socket.id);
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);
    }

    /* ---- 2-b  Customer side ---- */
    if (socket.customerId) {
      try {
        // Verify customer exists
        const customer = await Customer.findOne({ customerId: socket.customerId });
        if (!customer) {
          socket.disconnect();
          return;
        }

        connectedCustomers.set(socket.customerId, socket.id);
        console.log(`Customer ${socket.customerId} connected with socket ${socket.id}`);

        // Send active conversations
        const activeConversations = await Conversation.find({
          customerId: socket.customerId,
          status    : 'active'
        }).sort({ lastMessage: -1 });

        socket.emit('active_users_list',
          activeConversations.map(conv => ({
            chatId      : conv.chatId,
            userId      : conv.userId,
            userName    : conv.userName,
            lastMessage : conv.messages[conv.messages.length - 1],
            unreadCount : conv.unreadCount
          }))
        );
      } catch (err) {
        console.error('Error in customer connection:', err);
        socket.disconnect();
      }
    }

    /* ------------ 3. Initiate conversation ------------ */
    socket.on('initiate_chat', async ({ userId, customerId, initialMessage, userName }) => {
      try {
        userId     = userId.toString();
        customerId = customerId.toString();

        console.log('Initiate conversation:', { userId, customerId, initialMessage, userName });
        const chatId = `${userId}-${customerId}`;

        // Find or create conversation
        let conv = await Conversation.findOne({ chatId });
        if (!conv) {
          conv = new Conversation({
            chatId,
            customerId,
            userId,
            userName,
            messages: []
          });
        }

        // Push initial message
        const message = {
          sender     : userId,
          senderType : 'user',
          senderName : userName,
          content    : initialMessage,
          timestamp  : new Date()
        };

        conv.messages.push(message);
        conv.unreadCount++;
        await conv.save();

        // Notify customer if online
        const customerSocketId = connectedCustomers.get(customerId);
        if (customerSocketId) {
          io.to(customerSocketId).emit('new_chat_request', {
            chatId,
            userId,
            userName,
            message
          });

          // Send refreshed active list
          const activeConversations = await Conversation.find({
            customerId,
            status: 'active'
          }).sort({ lastMessage: -1 });

          io.to(customerSocketId).emit('active_users_list',
            activeConversations.map(conv => ({
              chatId      : conv.chatId,
              userId      : conv.userId,
              userName    : conv.userName,
              lastMessage : conv.messages[conv.messages.length - 1],
              unreadCount : conv.unreadCount
            }))
          );
        }
      } catch (err) {
        console.error('Error initiating chat:', err);
      }
    });

    /* ------------ 4. Message from user ------------ */
    socket.on('user_message', async ({ userId, customerId, content, userName }) => {
      try {
        userId     = userId.toString();
        customerId = customerId.toString();

        const chatId = `${userId}-${customerId}`;
        let conv = await Conversation.findOne({ chatId });
        if (!conv) {
          conv = new Conversation({
            chatId,
            customerId,
            userId,
            userName,
            messages: []
          });
        }

        const message = {
          sender     : userId,
          senderType : 'user',
          senderName : userName,
          content,
          timestamp  : new Date()
        };

        conv.messages.push(message);
        conv.unreadCount++;
        await conv.save();

        // Forward to customer
        const customerSocketId = connectedCustomers.get(customerId);
        if (customerSocketId) {
          io.to(customerSocketId).emit('new_message', { chatId, message, userId });

          // Update active list
          const activeConversations = await Conversation.find({
            customerId,
            status: 'active'
          }).sort({ lastMessage: -1 });

          io.to(customerSocketId).emit('active_users_list',
            activeConversations.map(conv => ({
              chatId      : conv.chatId,
              userId      : conv.userId,
              userName    : conv.userName,
              lastMessage : conv.messages[conv.messages.length - 1],
              unreadCount : conv.unreadCount
            }))
          );
        }
      } catch (err) {
        console.error('Error in user_message:', err);
      }
    });

    /* ------------ 5. Message from customer ------------ */
    socket.on('customer_message', async ({ userId, customerId, content, userName }) => {
      try {
        userId     = userId.toString();
        customerId = customerId.toString();

        const chatId = `${userId}-${customerId}`;
        const conv   = await Conversation.findOne({ chatId });
        if (!conv) {
          console.error('Conversation not found:', chatId);
          return;
        }

        const message = {
          sender     : customerId,
          senderType : 'customer',
          senderName : userName,
          content,
          timestamp  : new Date()
        };

        conv.messages.push(message);
        await conv.save();

        // Forward to user
        const userSocketId = connectedUsers.get(userId);
        if (userSocketId) {
          io.to(userSocketId).emit('new_message', { chatId, message });
        }
      } catch (err) {
        console.error('Error in customer_message:', err);
      }
    });

    /* ------------ 6. Mark messages read ------------ */
    socket.on('mark_messages_read', async ({ chatId }) => {
      try {
        const conv = await Conversation.findOne({ chatId });
        if (!conv) return;

        conv.unreadCount = 0;
        conv.messages.forEach(msg => { msg.read = true; });
        await conv.save();

        // Notify customer
        const customerSocketId = connectedCustomers.get(conv.customerId);
        if (customerSocketId) {
          const activeConversations = await Conversation.find({
            customerId: conv.customerId,
            status    : 'active'
          }).sort({ lastMessage: -1 });

          io.to(customerSocketId).emit('active_users_list',
            activeConversations.map(conv => ({
              chatId      : conv.chatId,
              userId      : conv.userId,
              userName    : conv.userName,
              lastMessage : conv.messages[conv.messages.length - 1],
              unreadCount : conv.unreadCount
            }))
          );
        }
      } catch (err) {
        console.error('Error marking read:', err);
      }
    });

    /* ------------ 7. Disconnect ------------ */
    socket.on('disconnect', () => {
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        console.log(`User ${socket.userId} disconnected (${socket.id})`);
      }
      if (socket.customerId) {
        connectedCustomers.delete(socket.customerId);
        console.log(`Customer ${socket.customerId} disconnected (${socket.id})`);
      }
    });
  });
};

module.exports = setupConversationSocket;
