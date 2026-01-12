require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');

const connectDB = require('./config/database');
const { hubSpotService } = require('./services/hubspotService');
const { initializeWebSocket } = require('./websocket');
const { initializeProcessors } = require('./queues/processors');
const {
    syncToHubspotQueue,
    syncFromHubspotQueue,
    pollingSyncQueue,
    addPollingSyncJob,
} = require('./queues/syncQueue');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Routes
const contactsRouter = require('./routes/contacts');
const companiesRouter = require('./routes/companies');
const syncRouter = require('./routes/sync');
const conflictsRouter = require('./routes/conflicts');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    console.log(res)
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/contacts', contactsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/conflicts', conflictsRouter);
app.use('/api/webhooks', webhooksRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Polling interval reference
let pollingInterval = null;

// Start polling fallback
const startPolling = () => {
    const intervalMs = parseInt(process.env.POLLING_INTERVAL_MS) || 300000; // 5 minutes

    pollingInterval = setInterval(async () => {
        try {
            logger.info('Running scheduled polling sync...');
            await addPollingSyncJob('all');
        } catch (error) {
            logger.error('Error scheduling polling sync:', error);
        }
    }, intervalMs);

    logger.info(`Polling fallback started (interval: ${intervalMs / 1000}s)`);
};

// Stop polling
const stopPolling = () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        logger.info('Polling fallback stopped');
    }
};

// Graceful shutdown
const gracefulShutdown = async () => {
    logger.info('Shutting down gracefully...');

    // Stop polling
    stopPolling();

    // Close server
    server.close(() => {
        logger.info('HTTP server closed');
    });

    // Close queues
    await Promise.all([
        syncToHubspotQueue.close(),
        syncFromHubspotQueue.close(),
        pollingSyncQueue.close(),
    ]);
    logger.info('Queues closed');

    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
const start = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Initialize HubSpot service
        hubSpotService.initialize();

        // Initialize WebSocket
        const io = initializeWebSocket(server);

        // Initialize queue processors
        initializeProcessors({
            syncToHubspotQueue,
            syncFromHubspotQueue,
            pollingSyncQueue,
        }, io);

        // Start polling fallback
        if (process.env.ENABLE_POLLING !== 'false') {
            startPolling();
        }

        // Start server
        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

start();

module.exports = app;
