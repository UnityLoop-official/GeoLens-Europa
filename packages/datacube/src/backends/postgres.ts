import { Pool, PoolClient, PoolConfig } from 'pg';
import { DataCubeBackend, DataCubeConfig, DataPoint, SnapshotQuery, TimeSeriesQuery, TimeSeries } from '../types';

export class PostgresBackend implements DataCubeBackend {
    private pool: Pool;

    constructor(config: DataCubeConfig) {
        if (config.backend !== 'postgres') {
            throw new Error('Invalid backend type for PostgresBackend');
        }

        const poolConfig: PoolConfig = {
            connectionString: config.connection?.connectionString,
            ...config.connection
        };

        this.pool = new Pool(poolConfig);
    }

    async initialize(): Promise<void> {
        // Ensure table exists
        const client = await this.pool.connect();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS datacube_points (
            h3_index text NOT NULL,
            timestamp timestamptz NOT NULL,
            layer text NOT NULL,
            variable text NOT NULL,
            value_num double precision,
            value_str text,
            unit text,
            source text,
            quality double precision,
            metadata jsonb,
            PRIMARY KEY (h3_index, timestamp, layer, variable)
        );
        CREATE INDEX IF NOT EXISTS idx_datacube_h3 ON datacube_points (h3_index);
        CREATE INDEX IF NOT EXISTS idx_datacube_time ON datacube_points (timestamp);
        CREATE INDEX IF NOT EXISTS idx_datacube_layer ON datacube_points (layer);
      `);
        } finally {
            client.release();
        }
    }

    async writeDataPoints(points: DataPoint[]): Promise<void> {
        if (points.length === 0) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const query = `
        INSERT INTO datacube_points (
          h3_index, timestamp, layer, variable, value_num, value_str, unit, source, quality, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (h3_index, timestamp, layer, variable)
        DO UPDATE SET
          value_num = EXCLUDED.value_num,
          value_str = EXCLUDED.value_str,
          unit = EXCLUDED.unit,
          source = EXCLUDED.source,
          quality = EXCLUDED.quality,
          metadata = EXCLUDED.metadata
      `;

            for (const p of points) {
                const valueNum = typeof p.value === 'number' ? p.value : null;
                const valueStr = typeof p.value === 'string' ? p.value : null;

                await client.query(query, [
                    p.h3Index,
                    p.timestamp,
                    p.layer,
                    p.variable,
                    valueNum,
                    valueStr,
                    p.unit || null,
                    p.source || null,
                    p.quality || null,
                    p.metadata ? JSON.stringify(p.metadata) : null
                ]);
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async querySnapshot(query: SnapshotQuery): Promise<DataPoint[]> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        // Timestamp handling
        if (query.timestamp === 'latest') {
            // This is complex in SQL for multiple variables/cells. 
            // For now, let's assume specific timestamp or implement a window function approach later.
            // A simple approach for 'latest' is finding the max timestamp <= now
            // But usually 'latest' means "latest available for each cell/variable"
            throw new Error("Latest snapshot query not fully optimized yet in this implementation");
        } else {
            conditions.push(`timestamp = $${paramIdx++}`);
            params.push(query.timestamp);
        }

        if (query.h3Indices && query.h3Indices.length > 0) {
            conditions.push(`h3_index = ANY($${paramIdx++})`);
            params.push(query.h3Indices);
        }

        if (query.layers && query.layers.length > 0) {
            conditions.push(`layer = ANY($${paramIdx++})`);
            params.push(query.layers);
        }

        if (query.variables && query.variables.length > 0) {
            conditions.push(`variable = ANY($${paramIdx++})`);
            params.push(query.variables);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const sql = `
      SELECT h3_index, timestamp, layer, variable, value_num, value_str, unit, source, quality, metadata
      FROM datacube_points
      ${whereClause}
    `;

        const result = await this.pool.query(sql, params);

        return result.rows.map(row => ({
            h3Index: row.h3_index,
            timestamp: row.timestamp.toISOString(),
            layer: row.layer,
            variable: row.variable,
            value: row.value_num !== null ? row.value_num : row.value_str,
            unit: row.unit,
            source: row.source,
            quality: row.quality,
            metadata: row.metadata
        }));
    }

    async queryTimeSeries(query: TimeSeriesQuery): Promise<TimeSeries[]> {
        // This requires grouping by cell/layer/variable
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        conditions.push(`h3_index = ANY($${paramIdx++})`);
        params.push(query.h3Indices);

        conditions.push(`layer = ANY($${paramIdx++})`);
        params.push(query.layers);

        conditions.push(`variable = ANY($${paramIdx++})`);
        params.push(query.variables);

        if (query.timeRange) {
            conditions.push(`timestamp >= $${paramIdx++}`);
            params.push(query.timeRange.startTime);
            conditions.push(`timestamp <= $${paramIdx++}`);
            params.push(query.timeRange.endTime);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;
        const sql = `
      SELECT h3_index, timestamp, layer, variable, value_num, value_str, unit, source, quality
      FROM datacube_points
      ${whereClause}
      ORDER BY h3_index, layer, variable, timestamp ASC
    `;

        const result = await this.pool.query(sql, params);

        // Group results into TimeSeries objects
        const seriesMap = new Map<string, TimeSeries>();

        for (const row of result.rows) {
            const key = `${row.h3_index}:${row.layer}:${row.variable}`;
            if (!seriesMap.has(key)) {
                seriesMap.set(key, {
                    h3Index: row.h3_index,
                    layer: row.layer,
                    variable: row.variable,
                    unit: row.unit,
                    source: row.source,
                    points: []
                });
            }

            const series = seriesMap.get(key)!;
            series.points.push({
                timestamp: row.timestamp.toISOString(),
                value: row.value_num !== null ? row.value_num : row.value_str,
                quality: row.quality
            });
        }

        return Array.from(seriesMap.values());
    }

    async deleteDataPoints(criteria: {
        h3Indices?: string[];
        layers?: string[];
        variables?: string[];
        timeRange?: { startTime: string; endTime: string };
    }): Promise<number> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        if (criteria.h3Indices && criteria.h3Indices.length > 0) {
            conditions.push(`h3_index = ANY($${paramIdx++})`);
            params.push(criteria.h3Indices);
        }

        if (criteria.layers && criteria.layers.length > 0) {
            conditions.push(`layer = ANY($${paramIdx++})`);
            params.push(criteria.layers);
        }

        if (criteria.variables && criteria.variables.length > 0) {
            conditions.push(`variable = ANY($${paramIdx++})`);
            params.push(criteria.variables);
        }

        if (criteria.timeRange) {
            conditions.push(`timestamp >= $${paramIdx++}`);
            params.push(criteria.timeRange.startTime);
            conditions.push(`timestamp <= $${paramIdx++}`);
            params.push(criteria.timeRange.endTime);
        }

        if (conditions.length === 0) {
            throw new Error("Delete requires at least one criteria to prevent accidental wipe");
        }

        const sql = `DELETE FROM datacube_points WHERE ${conditions.join(' AND ')}`;
        const result = await this.pool.query(sql, params);
        return result.rowCount || 0;
    }

    async getCubeMetadata(): Promise<{
        totalPoints: number;
        layers: string[];
        variables: string[];
        spatialExtent: { h3Resolution: number[]; cellCount: number; };
        temporalExtent: { startTime: string; endTime: string; };
    }> {
        const client = await this.pool.connect();
        try {
            const countRes = await client.query('SELECT COUNT(*) as c FROM datacube_points');
            const totalPoints = parseInt(countRes.rows[0].c);

            const layersRes = await client.query('SELECT DISTINCT layer FROM datacube_points');
            const layers = layersRes.rows.map(r => r.layer);

            const varsRes = await client.query('SELECT DISTINCT variable FROM datacube_points');
            const variables = varsRes.rows.map(r => r.variable);

            const timeRes = await client.query('SELECT MIN(timestamp) as min_t, MAX(timestamp) as max_t FROM datacube_points');

            // Approximate spatial extent
            const spaceRes = await client.query('SELECT COUNT(DISTINCT h3_index) as c FROM datacube_points');

            return {
                totalPoints,
                layers,
                variables,
                spatialExtent: {
                    h3Resolution: [6], // Placeholder, would need to analyze indices
                    cellCount: parseInt(spaceRes.rows[0].c)
                },
                temporalExtent: {
                    startTime: timeRes.rows[0].min_t?.toISOString() || new Date().toISOString(),
                    endTime: timeRes.rows[0].max_t?.toISOString() || new Date().toISOString()
                }
            };
        } finally {
            client.release();
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
    }
}
