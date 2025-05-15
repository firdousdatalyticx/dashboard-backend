const Conversation = require('../models/Conversation');

const chatController = {
    // Get all conversations for a customer
    getCustomerConversations: async (req, res) => {
        try {
            const { customerId } = req.params;
            
            const conversations = await Conversation.find({ 
                customerId: customerId.toString(),
                status: 'active'
            })
            .sort({ lastMessage: -1 })
            .select({
                chatId: 1,
                userId: 1,
                userName: 1,
                messages: 1,
                lastMessage: 1,
                unreadCount: 1,
                createdAt: 1,
                updatedAt: 1
            });

            return res.status(200).json({
                success: true,
                conversations
            });
        } catch (error) {
            console.error('Error fetching customer conversations:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get messages for a specific conversation
    getConversationMessages: async (req, res) => {
        try {
            const { chatId } = req.params;
            
            const conversation = await Conversation.findOne({ 
                chatId: chatId
            })
            .select({
                chatId: 1,
                userId: 1,
                userName: 1,
                customerId: 1,
                messages: 1,
                status: 1
            });

            if (!conversation) {
                return res.status(404).json({
                    success: false,
                    error: 'Conversation not found'
                });
            }

            return res.status(200).json({
                success: true,
                conversation
            });
        } catch (error) {
            console.error('Error fetching conversation messages:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    },

    // Get all conversations between a specific user and customer
    getUserCustomerConversation: async (req, res) => {
        try {
            const { userId, customerId } = req.params;
            const chatId = `${userId}-${customerId}`;
            
            const conversation = await Conversation.findOne({ 
                chatId: chatId
            });

            if (!conversation) {
                return res.status(404).json({
                    success: false,
                    error: 'Conversation not found'
                });
            }

            return res.status(200).json({
                success: true,
                conversation
            });
        } catch (error) {
            console.error('Error fetching user-customer conversation:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
};

module.exports = chatController;
