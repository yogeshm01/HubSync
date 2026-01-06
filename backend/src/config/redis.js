const Redis = require('ioredis');
const logger = require('../utils/logger');

const createRedisClient = () => {
    const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
            // Retry indefinitely with exponential backoff capped at 2 seconds
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    });

    client.on('connect', () => {
        logger.info('Redis client connected');
    });

    client.on('error', (err) => {
        logger.error('Redis client error:', err);
    });

    return client;
};

module.exports = { createRedisClient };
