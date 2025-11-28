import { FastifyInstance } from 'fastify';
import { getH3ScoresForArea } from '../services/tileOrchestrator';
import { AreaRequest } from '../services/datasets/types';

export async function h3AreaRoutes(fastify: FastifyInstance) {
    fastify.get<{
        Querystring: {
            minLon: number;
            minLat: number;
            maxLon: number;
            maxLat: number;
            res?: number;
        }
    }>('/api/h3/area', async (request, reply) => {
        const { minLon, minLat, maxLon, maxLat, res } = request.query;

        if (minLon === undefined || minLat === undefined || maxLon === undefined || maxLat === undefined) {
            return reply.code(400).send({ error: 'Missing BBOX parameters' });
        }

        const area: AreaRequest = {
            minLon: Number(minLon),
            minLat: Number(minLat),
            maxLon: Number(maxLon),
            maxLat: Number(maxLat),
            resolution: Number(res) || 6
        };

        try {
            const cells = await getH3ScoresForArea(area);
            return { area, cells };
        } catch (error) {
            request.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
