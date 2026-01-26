    require("dotenv").config(); // Load environment variables
    const express = require("express");
    const cors = require("cors");
    const morgan = require("morgan");
    const helmet = require("helmet");
    const routes = require('./routes');
    const topicCategoriesRoutes = require('./routes/topic-categories.routes');
    const chatRoutes = require('./routes/chat.route');
    const { swaggerDocs } = require('./config/swagger');
    const path = require('path');
    const startAllCronJobAlert = require('./controllers/startAllCronJobAlert');
    const { createServer } = require('http');
    const { Server } = require('socket.io');
    const setupChatSocket = require('./socket/chat.socket');
    const connectDB = require('./config/mongodb'); // MongoDB connection
    const videoRoutes = require('./routes/video.routes');

    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONT_END_URL || "*",
            methods: ["GET", "POST"]
        }
    });


    // CORS options to allow everything
    const corsOptions = {
        origin: '*', // Allow all origins
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'], // Allow all common HTTP methods
        allowedHeaders: ['*'], // Allow all headers
    };
    
    // Apply CORS globally
    app.use(cors(corsOptions));
    

    // Connect to MongoDB (for chat only)
    connectDB()
        .then(() => {
            console.log('MongoDB connection established for chat functionality');
        })
        .catch((err) => {
            console.error('MongoDB connection failed:', err);
            // Don't exit process as MongoDB is only for chat
            console.log('Continuing without MongoDB (chat functionality may be affected)');
        });

    // Setup Socket.IO
    setupChatSocket(io);

    // Middleware
    app.use(express.json({limit: '50mb'})); // Parse JSON request bodies with increased limit
    app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Parse URL-encoded data with increased limit
    app.use('/public', express.static(path.join(__dirname, 'public')));

    app.use(cors()); // Enable CORS for cross-origin requests
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": ["'self'", "data:", "https:"],
                "script-src": ["'self'", "'unsafe-inline'", "https:"]
            }
        }
    })); // Secure HTTP headers with exceptions for Swagger UI
    app.use(morgan("dev")); // Logging requests in dev mode

    // Serve static files
    app.use('/public', express.static(path.join(__dirname, 'public')));

    const PORT = process.env.PORT || 3131;

    // Routes
    app.use('/api', routes);
    app.use('/api/topic-categories', topicCategoriesRoutes);
    app.use('/api/chat', chatRoutes);
    app.use('/api/video', videoRoutes);


    // Initialize Swagger
    swaggerDocs(app);

    // 404 Route Handling
    app.use((req, res, next) => {
        res.status(404).json({ message: "Route not found" });
    });

    // Global Error Handling
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ message: "Internal Server Error" });
    });

    startAllCronJobAlert.index();

    // Start the server
    httpServer.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api/docs`);
        console.log(`WebSocket server is running on ws://localhost:${PORT}`);
    });
