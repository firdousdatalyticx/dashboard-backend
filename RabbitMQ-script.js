const amqp = require('amqplib');

// RabbitMQ connection configuration
const rabbitConfig = {
    hostname: '74.162.40.87',
    port: 5672,
    username: 'datalyticx',
    password: 'datalyticxDXB@25!',
    vhost: '/'
};

// Queue configuration
const queueName = 'data_requests';

// Message payload for RabbitMQ
const messagePayload = {
    queries: ["arab region", "arab world"],
    start_date: "2020-01-01",
    end_date: "2021-12-31",
    source: ["Facebook", "Twitter"],
    request_type: "POST"  // POST to initiate collection, GET to collect and dump
};

async function publishToQueue() {
    let connection;
    try {
        console.log('Attempting to connect to RabbitMQ...');
        
        // Create RabbitMQ connection
        connection = await amqp.connect({
            protocol: 'amqp',
            hostname: rabbitConfig.hostname,
            port: rabbitConfig.port,
            username: rabbitConfig.username,
            password: rabbitConfig.password,
            vhost: rabbitConfig.vhost
        });
        
        console.log('Connected to RabbitMQ successfully');

        // Create channel
        const channel = await connection.createChannel();
        console.log('Channel created successfully');

        // Assert queue exists
        await channel.assertQueue(queueName, {
            durable: true
        });
        console.log('Queue asserted successfully');

        // Convert payload to Buffer
        const message = Buffer.from(JSON.stringify(messagePayload));

        // Publish message
        const result = channel.sendToQueue(queueName, message);
        console.log('Message published to queue:', messagePayload);
        console.log('Publish result:', result);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.code) {
            console.error('Error code:', error.code);
        }
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        // Close connection if it was established
        if (connection) {
            try {
                setTimeout(async () => {
                    await connection.close();
                    console.log('RabbitMQ connection closed');
                    process.exit(0);
                }, 500);
            } catch (error) {
                console.error('Error closing connection:', error);
                process.exit(1);
            }
        } else {
            process.exit(1);
        }
    }
}

// Run the test
console.log('Starting RabbitMQ test...');
publishToQueue();
