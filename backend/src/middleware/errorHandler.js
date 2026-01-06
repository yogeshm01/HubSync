const logger = require('../utils/logger');

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    logger.error('Unhandled error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => ({
            field: e.path,
            message: e.message,
        }));
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return res.status(409).json({
            error: `Duplicate value for ${field}`
        });
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: `Invalid ${err.path}: ${err.value}`
        });
    }

    // HubSpot API errors
    if (err.response?.status) {
        const status = err.response.status;
        const message = err.response.data?.message || err.message;

        if (status === 429) {
            return res.status(429).json({
                error: 'Rate limit exceeded. Please try again later.'
            });
        }
        if (status === 401 || status === 403) {
            return res.status(status).json({
                error: 'HubSpot authentication failed'
            });
        }
        if (status === 404) {
            return res.status(404).json({
                error: 'Resource not found in HubSpot'
            });
        }

        return res.status(status).json({ error: message });
    }

    // Default error
    res.status(500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
};

// 404 handler
const notFoundHandler = (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
};

module.exports = { errorHandler, notFoundHandler };
