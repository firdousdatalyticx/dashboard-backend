const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');

// Get all conversations for a customer
router.get('/customer/:customerId', chatController.getCustomerConversations);

// Get messages for a specific conversation
router.get('/conversation/:chatId', chatController.getConversationMessages);

// Get conversation between specific user and customer
router.get('/user/:userId/customer/:customerId', chatController.getUserCustomerConversation);

module.exports = router; 