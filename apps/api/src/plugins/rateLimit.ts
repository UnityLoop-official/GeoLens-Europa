import fp from 'fastify-plugin';
import rateLimit, { RateLimitPluginOptions } from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

/**
 * Rate Limiting Plugin
 * 
 * Protects the API from abuse by limiting the number of requests
 * a client can make within a time window.
 */
export default fp<RateLimitPluginOptions>(async (fastify: FastifyInstance) => {
    await fastify.register(rateLimit, {
        max: 5000, // Increased for tile requests
        timeWindow: '1 minute', // Window size

        // Custom error response
        errorResponseBuilder: (request, context) => {
            return {
                statusCode: 429,
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Try again in ${context.after}.`,
                retryAfter: context.after
            };
        },

        // Allow local loopback (for internal services/tests)
        // allowList: ['127.0.0.1', '::1'],

        // Key generator (IP-based by default, can be API key based later)
        keyGenerator: (request) => {
            return request.headers['x-forwarded-for'] as string || request.ip;
        }
    });
});
