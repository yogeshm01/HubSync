const { calculateBackoff, isRetryableError } = require('../../src/utils/retryHelper');

describe('RetryHelper', () => {
    describe('calculateBackoff', () => {
        test('should return base delay for first retry', () => {
            const delay = calculateBackoff(0, 1000, 32000);
            // Should be around 1000 with ±10% jitter
            expect(delay).toBeGreaterThan(800);
            expect(delay).toBeLessThan(1200);
        });

        test('should double delay for each retry', () => {
            const delays = [0, 1, 2, 3].map(i => calculateBackoff(i, 1000, 32000));
            // Each should be roughly double the previous (within jitter)
            expect(delays[1]).toBeGreaterThan(delays[0] * 1.5);
            expect(delays[2]).toBeGreaterThan(delays[1] * 1.5);
        });

        test('should cap at max delay', () => {
            const delay = calculateBackoff(10, 1000, 32000);
            expect(delay).toBeLessThanOrEqual(35200); // 32000 + 10% jitter
        });
    });

    describe('isRetryableError', () => {
        test('should return true for rate limit errors', () => {
            const error = { response: { status: 429 } };
            expect(isRetryableError(error)).toBe(true);
        });

        test('should return true for server errors', () => {
            const error = { response: { status: 503 } };
            expect(isRetryableError(error)).toBe(true);
        });

        test('should return true for network errors', () => {
            const error = { code: 'ECONNRESET' };
            expect(isRetryableError(error)).toBe(true);
        });

        test('should return false for client errors', () => {
            const error = { response: { status: 400 } };
            expect(isRetryableError(error)).toBe(false);
        });
    });
});
