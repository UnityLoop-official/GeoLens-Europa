import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { h3Cache } from '../services/h3Cache';

export async function cellRoutes(fastify: FastifyInstance) {
    /**
     * GET /cell/:h3Index - Get detailed data for a specific cell
     */
    fastify.get<{
        Params: { h3Index: string };
    }>('/api/cell/:h3Index', async (request: FastifyRequest<{ Params: { h3Index: string } }>, reply: FastifyReply) => {
        const { h3Index } = request.params;

        if (!h3Index) {
            return reply.code(400).send({ error: 'Missing h3Index' });
        }

        console.log(`[API] Fetching cell data for: ${h3Index}`);
        const cached = h3Cache.get(h3Index);

        if (cached) {
            console.log(`[API] Cache HIT for ${h3Index}`);
            return cached;
        } else {
            console.log(`[API] Cache MISS for ${h3Index}`);
            return reply.code(404).send({ error: 'Cell data not found' });
        }
    });
}
