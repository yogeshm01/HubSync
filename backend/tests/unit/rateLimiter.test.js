const { RateLimiter } = require('../../src/services/rateLimiter');

describe('RateLimiter', () => {
    let rateLimiter;

    beforeEach(() => {
        rateLimiter = new RateLimiter({
            maxTokens: 5,
            refillWindowMs: 1000,
        });
    });

    test('should allow requests within limit', async () => {
        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push(await rateLimiter.execute(() => Promise.resolve(i)));
        }
        expect(results).toEqual([0, 1, 2, 3, 4]);
    });

    test('should report correct status', () => {
        const status = rateLimiter.getStatus();
        expect(status.availableTokens).toBe(5);
        expect(status.maxTokens).toBe(5);
        expect(status.queueLength).toBe(0);
    });

    test('should decrement tokens on execute', async () => {
        await rateLimiter.execute(() => Promise.resolve('test'));
        const status = rateLimiter.getStatus();
        expect(status.availableTokens).toBe(4);
    });
});
