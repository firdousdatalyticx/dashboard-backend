const io = require('socket.io-client');

// Constants
const CUSTOMER_ID = 453;
const SERVER_URL = 'http://localhost:3131';

// Create socket connections for two different users
const user1Socket = io(SERVER_URL, {
    auth: { userId: 'test-user-1' }
});

const user2Socket = io(SERVER_URL, {
    auth: { userId: 'test-user-2' }
});

// --- USER 1 SETUP ---
user1Socket.on('connect', () => {
    console.log('User 1 connected, socket id:', user1Socket.id);
    
    // First user initiates the chat
    console.log('\nUser 1: Initiating chat with customer', CUSTOMER_ID);
    user1Socket.emit('initiate_chat', {
        userId: 'test-user-1',
        customerId: CUSTOMER_ID,
        initialMessage: 'Hello customer, this is User 1 starting a new chat!',
        userName: 'User 1'  // Appending userName here
    });

    // Wait a bit and then send a message
    setTimeout(() => {
        console.log('\nUser 1: Sending follow-up message to customer', CUSTOMER_ID);
        user1Socket.emit('user_message', {
            userId: 'test-user-1',
            customerId: CUSTOMER_ID,
            content: 'This is User 1 sending a test message after chat initiation!',
            userName: 'User 1'  // Appending userName here
        });
    }, 2000);
});

// Listen for connection events - User 1
user1Socket.on('disconnect', () => {
    console.log('User 1 disconnected from server');
});

user1Socket.on('connect_error', (error) => {
    console.log('User 1 connection error:', error);
});

// Listen for any responses - User 1
user1Socket.on('new_message', ({ chatId, message }) => {
    console.log('\nUser 1 received response from customer:', {
        chatId,
        content: message.content,
        sender: message.sender,
        senderName: message.senderName,  // Logging senderName
        timestamp: message.timestamp
    });
});

// Error handler - User 1
user1Socket.on('error', (error) => {
    console.error('User 1 socket error:', error);
});

// --- USER 2 SETUP ---
user2Socket.on('connect', () => {
    console.log('User 2 connected, socket id:', user2Socket.id);
    
    // Wait a bit before second user joins and sends a message to the same customer
    setTimeout(() => {
        console.log('\nUser 2: Sending message to same customer', CUSTOMER_ID);
        user2Socket.emit('user_message', {
            userId: 'test-user-2',
            customerId: CUSTOMER_ID,
            content: 'Hello customer, this is User 2 joining the conversation!',
            userName: 'User 2'  // Appending userName here
        });
        
        // Send another message from User 2 after a delay
        setTimeout(() => {
            console.log('\nUser 2: Sending follow-up message');
            user2Socket.emit('user_message', {
                userId: 'test-user-2',
                customerId: CUSTOMER_ID,
                content: 'How can I assist you today? This is User 2 again.',
                userName: 'User 2'  // Appending userName here
            });
        }, 3000);
    }, 5000); // Give User 1 a head start
});

// Listen for connection events - User 2
user2Socket.on('disconnect', () => {
    console.log('User 2 disconnected from server');
});

user2Socket.on('connect_error', (error) => {
    console.log('User 2 connection error:', error);
});

// Listen for any responses - User 2
user2Socket.on('new_message', ({ chatId, message }) => {
    console.log('\nUser 2 received response from customer:', {
        chatId,
        content: message.content,
        sender: message.sender,
        senderName: message.senderName,  // Logging senderName
        timestamp: message.timestamp
    });
});

// Error handler - User 2
user2Socket.on('error', (error) => {
    console.error('User 2 socket error:', error);
});

// Keep the script running to receive responses
console.log('Starting multi-user test client... (Press Ctrl+C to exit)');

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\nClosing connections...');
    user1Socket.close();
    user2Socket.close();
    process.exit();
});
