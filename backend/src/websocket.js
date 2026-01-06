// WebSocket server
const { Server } = require('socket.io');
const logger = require('./utils/logger');

let io = null;

// Initialize WebSocket server
const initializeWebSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    io.on('connection', (socket) => {
        logger.info(`WebSocket client connected: ${socket.id}`);

        socket.on('subscribe', (room) => {
            socket.join(room);
            logger.debug(`Client ${socket.id} joined room: ${room}`);
        });

        socket.on('unsubscribe', (room) => {
            socket.leave(room);
            logger.debug(`Client ${socket.id} left room: ${room}`);
        });

        socket.on('disconnect', (reason) => {
            logger.info(`WebSocket client disconnected: ${socket.id} (${reason})`);
        });
    });

    logger.info('WebSocket server initialized');
    return io;
};

// Get the WebSocket server instance
const getIO = () => {
    if (!io) {
        throw new Error('WebSocket not initialized');
    }
    return io;
};

// Emit sync status update to all clients
const emitSyncStatus = (event, data) => {
    if (io) {
        io.emit(`sync:${event}`, data);
    }
};

// Emit conflict notification
const emitConflict = (event, data) => {
    if (io) {
        io.emit(`conflict:${event}`, data);
    }
};

module.exports = {
    initializeWebSocket,
    getIO,
    emitSyncStatus,
    emitConflict,
};
