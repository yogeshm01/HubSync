// Retry helper with exponential backoff

const logger = require('./logger');

// Calculate delay for exponential backoff
const calculateBackoff = (retryCount, baseDelay = 1000, maxDelay = 32000) => {
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
};

// Execute function with retry logic
const withRetry = async (fn, options = {}) => {
    const {
        maxRetries = 5,
        baseDelay = 1000,
        maxDelay = 32000,
        shouldRetry = () => true,
        onRetry = () => { },
        context = 'operation',
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
                logger.error(`${context} failed after ${attempt + 1} attempts:`, error);
                throw error;
            }

            const delay = calculateBackoff(attempt, baseDelay, maxDelay);
            logger.warn(`${context} failed (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);

            await onRetry(error, attempt, delay);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
};

// Check if error is retryable (network errors, rate limits, server errors)
const isRetryableError = (error) => {
    // Rate limit errors (429)
    if (error.response?.status === 429) return true;

    // Server errors (5xx)
    if (error.response?.status >= 500) return true;

    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        return true;
    }

    // HubSpot specific retryable errors
    if (error.message?.includes('rate limit') || error.message?.includes('temporarily unavailable')) {
        return true;
    }

    return false;
};

module.exports = {
    calculateBackoff,
    withRetry,
    isRetryableError,
};
