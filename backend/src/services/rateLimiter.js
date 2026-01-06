const logger = require('../utils/logger');

// Token Bucket Rate Limiter
class RateLimiter {
    constructor(options = {}) {
        this.maxTokens = options.maxTokens || parseInt(process.env.RATE_LIMIT_REQUESTS) || 100;
        this.refillWindowMs = options.refillWindowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 10000;
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }

    // Refill tokens based on time elapsed
    refillTokens() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;

        if (elapsed >= this.refillWindowMs) {
            const refillCount = Math.floor(elapsed / this.refillWindowMs);
            this.tokens = Math.min(this.maxTokens, this.tokens + (refillCount * this.maxTokens));
            this.lastRefill = now - (elapsed % this.refillWindowMs);
        }
    }

    // Get time until next token is available
    getWaitTime() {
        if (this.tokens > 0) return 0;
        return this.refillWindowMs - (Date.now() - this.lastRefill);
    }

    // Execute a function with rate limiting
    async execute(fn, name = 'request') {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, name, resolve, reject });
            this.processQueue();
        });
    }

    // Process queued requests
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;

        while (this.queue.length > 0) {
            this.refillTokens();

            if (this.tokens > 0) {
                const { fn, name, resolve, reject } = this.queue.shift();
                this.tokens--;

                logger.debug(`Rate limiter: Executing ${name}. Tokens remaining: ${this.tokens}`);

                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            } else {
                const waitTime = this.getWaitTime();
                logger.debug(`Rate limiter: Waiting ${waitTime}ms for token refill. Queue size: ${this.queue.length}`);
                await this.sleep(waitTime);
            }
        }

        this.processing = false;
    }

    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get current status
    getStatus() {
        this.refillTokens();
        return {
            availableTokens: this.tokens,
            maxTokens: this.maxTokens,
            queueLength: this.queue.length,
            waitTime: this.getWaitTime(),
        };
    }
}

// Singleton instance for HubSpot API calls
const hubspotRateLimiter = new RateLimiter();

module.exports = { RateLimiter, hubspotRateLimiter };
