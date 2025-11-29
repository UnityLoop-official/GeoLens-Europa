/**
 * In-Memory DataCube Backend
 *
 * Fast, ephemeral storage for:
 * - Testing
 * - Small datasets (< 1M points)
 * - Development/prototyping
 * - Temporary caching
 *
 * LIMITATIONS:
 * - No persistence (data lost on restart)
 * - Limited by available RAM
 * - No concurrent access control
 * - No indexing optimization (linear scans for some queries)
 *
 * PERFORMANCE:
 * - Write: O(1) per point (Map insert)
 * - Snapshot query: O(N) where N = total points (filtered)
 * - Time-series query: O(N) where N = total points (filtered)
 * - Memory: ~150-200 bytes per DataPoint (with V8 object overhead)
 *
 * FUTURE:
 * - Add spatial indexing (H3 → points Map)
 * - Add temporal indexing (timestamp ranges)
 * - Implement LRU eviction for bounded memory
 */

import {
  DataPoint,
  DataCubeBackend,
  SnapshotQuery,
  TimeSeriesQuery,
  TimeSeries
} from '../types';

/**
 * Composite key for unique data point identification
 * Format: "h3Index|timestamp|layer|variable"
 */
function makeKey(point: Pick<DataPoint, 'h3Index' | 'timestamp' | 'layer' | 'variable'>): string {
  return `${point.h3Index}|${point.timestamp}|${point.layer}|${point.variable}`;
}

/**
 * Parse composite key back to components
 */
function parseKey(key: string): { h3Index: string; timestamp: string; layer: string; variable: string } {
  const [h3Index, timestamp, layer, variable] = key.split('|');
  return { h3Index, timestamp, layer, variable };
}

/**
 * In-memory implementation of DataCubeBackend
 */
export class MemoryDataCube implements DataCubeBackend {
  /** Primary storage: composite key → DataPoint */
  private data: Map<string, DataPoint>;

  /** Spatial index: h3Index → Set<keys> */
  private spatialIndex: Map<string, Set<string>>;

  /** Layer index: layer → Set<keys> */
  private layerIndex: Map<string, Set<string>>;

  /** Variable index: variable → Set<keys> */
  private variableIndex: Map<string, Set<string>>;

  /** Temporal extent tracking */
  private minTimestamp: string | null = null;
  private maxTimestamp: string | null = null;

  constructor(initialCapacity: number = 10000) {
    this.data = new Map();
    this.spatialIndex = new Map();
    this.layerIndex = new Map();
    this.variableIndex = new Map();
  }

  /**
   * Write data points with upsert semantics
   */
  async writeDataPoints(points: DataPoint[]): Promise<void> {
    for (const point of points) {
      const key = makeKey(point);

      // If updating existing point, remove from indices first
      if (this.data.has(key)) {
        this.removeFromIndices(key, this.data.get(key)!);
      }

      // Store point
      this.data.set(key, { ...point }); // Clone to avoid external mutation

      // Update indices
      this.addToIndices(key, point);

      // Update temporal extent
      if (!this.minTimestamp || point.timestamp < this.minTimestamp) {
        this.minTimestamp = point.timestamp;
      }
      if (!this.maxTimestamp || point.timestamp > this.maxTimestamp) {
        this.maxTimestamp = point.timestamp;
      }
    }
  }

  /**
   * Query snapshot at specific time
   */
  async querySnapshot(query: SnapshotQuery): Promise<DataPoint[]> {
    const { timestamp, h3Indices, layers, variables, timeTolerance = Infinity } = query;

    // Start with all keys, then filter progressively
    let candidateKeys: Set<string>;

    // Spatial filter (if specified)
    if (h3Indices && h3Indices.length > 0) {
      candidateKeys = new Set();
      for (const h3 of h3Indices) {
        const keys = this.spatialIndex.get(h3);
        if (keys) {
          keys.forEach(k => candidateKeys.add(k));
        }
      }
    } else {
      candidateKeys = new Set(this.data.keys());
    }

    // Layer filter
    if (layers && layers.length > 0) {
      const layerKeys = new Set<string>();
      for (const layer of layers) {
        const keys = this.layerIndex.get(layer);
        if (keys) {
          keys.forEach(k => {
            if (candidateKeys.has(k)) {
              layerKeys.add(k);
            }
          });
        }
      }
      candidateKeys = layerKeys;
    }

    // Variable filter
    if (variables && variables.length > 0) {
      const varKeys = new Set<string>();
      for (const variable of variables) {
        const keys = this.variableIndex.get(variable);
        if (keys) {
          keys.forEach(k => {
            if (candidateKeys.has(k)) {
              varKeys.add(k);
            }
          });
        }
      }
      candidateKeys = varKeys;
    }

    // Temporal filter
    const results: DataPoint[] = [];
    const isLatest = timestamp === 'latest';

    if (isLatest) {
      // For "latest", find most recent point for each (h3, layer, variable) combo
      const latestMap = new Map<string, DataPoint>();

      for (const key of candidateKeys) {
        const point = this.data.get(key)!;
        const comboKey = `${point.h3Index}|${point.layer}|${point.variable}`;

        const existing = latestMap.get(comboKey);
        if (!existing || point.timestamp > existing.timestamp) {
          // Check time tolerance from "now" (use maxTimestamp as proxy)
          if (timeTolerance === Infinity || !this.maxTimestamp ||
              this.timeDiffSeconds(point.timestamp, this.maxTimestamp) <= timeTolerance) {
            latestMap.set(comboKey, point);
          }
        }
      }

      results.push(...latestMap.values());

    } else {
      // Exact timestamp or within tolerance
      for (const key of candidateKeys) {
        const point = this.data.get(key)!;

        if (point.timestamp === timestamp) {
          results.push(point);
        } else if (timeTolerance < Infinity) {
          const diff = this.timeDiffSeconds(point.timestamp, timestamp);
          if (diff <= timeTolerance) {
            results.push(point);
          }
        }
      }
    }

    return results;
  }

  /**
   * Query time-series for specific cells/variables
   */
  async queryTimeSeries(query: TimeSeriesQuery): Promise<TimeSeries[]> {
    const { h3Indices, layers, variables, timeRange, maxPoints } = query;

    // Build time-series map: (h3, layer, variable) → points[]
    const seriesMap = new Map<string, Array<{ timestamp: string; value: number | string | null; quality?: number }>>();
    const seriesMetadata = new Map<string, Pick<DataPoint, 'unit' | 'source'>>();

    // Filter by h3Indices
    const candidateKeys = new Set<string>();
    for (const h3 of h3Indices) {
      const keys = this.spatialIndex.get(h3);
      if (keys) {
        keys.forEach(k => candidateKeys.add(k));
      }
    }

    // Filter by layers and variables
    for (const key of candidateKeys) {
      const point = this.data.get(key)!;

      if (!layers.includes(point.layer)) continue;
      if (!variables.includes(point.variable)) continue;

      // Time range filter
      if (timeRange) {
        if (point.timestamp < timeRange.startTime || point.timestamp > timeRange.endTime) {
          continue;
        }
      }

      const seriesKey = `${point.h3Index}|${point.layer}|${point.variable}`;

      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, []);
        seriesMetadata.set(seriesKey, {
          unit: point.unit,
          source: point.source
        });
      }

      seriesMap.get(seriesKey)!.push({
        timestamp: point.timestamp,
        value: point.value,
        quality: point.quality
      });
    }

    // Convert to TimeSeries objects
    const results: TimeSeries[] = [];

    for (const [seriesKey, points] of seriesMap.entries()) {
      const [h3Index, layer, variable] = seriesKey.split('|');
      const metadata = seriesMetadata.get(seriesKey)!;

      // Sort by timestamp
      points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Downsample if needed
      let finalPoints = points;
      if (maxPoints && points.length > maxPoints) {
        finalPoints = this.downsample(points, maxPoints);
      }

      // Compute stats (for numeric series)
      let stats: TimeSeries['stats'] | undefined;
      const numericValues = finalPoints
        .map(p => p.value)
        .filter((v): v is number => typeof v === 'number');

      if (numericValues.length > 0) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        const sum = numericValues.reduce((acc, v) => acc + v, 0);
        const mean = sum / numericValues.length;

        stats = {
          count: numericValues.length,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean,
          median: sorted[Math.floor(sorted.length / 2)],
          stddev: Math.sqrt(
            numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numericValues.length
          )
        };
      }

      results.push({
        h3Index,
        layer,
        variable,
        unit: metadata.unit,
        source: metadata.source,
        points: finalPoints,
        stats
      });
    }

    return results;
  }

  /**
   * Delete data points matching criteria
   */
  async deleteDataPoints(criteria: {
    h3Indices?: string[];
    layers?: string[];
    variables?: string[];
    timeRange?: { startTime: string; endTime: string };
  }): Promise<number> {
    const keysToDelete: string[] = [];

    for (const [key, point] of this.data.entries()) {
      let shouldDelete = true;

      if (criteria.h3Indices && !criteria.h3Indices.includes(point.h3Index)) {
        shouldDelete = false;
      }

      if (criteria.layers && !criteria.layers.includes(point.layer)) {
        shouldDelete = false;
      }

      if (criteria.variables && !criteria.variables.includes(point.variable)) {
        shouldDelete = false;
      }

      if (criteria.timeRange) {
        if (point.timestamp < criteria.timeRange.startTime ||
            point.timestamp > criteria.timeRange.endTime) {
          shouldDelete = false;
        }
      }

      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }

    // Delete and update indices
    for (const key of keysToDelete) {
      const point = this.data.get(key)!;
      this.removeFromIndices(key, point);
      this.data.delete(key);
    }

    // Recompute temporal extent if needed
    if (keysToDelete.length > 0) {
      this.recomputeTemporalExtent();
    }

    return keysToDelete.length;
  }

  /**
   * Get cube metadata
   */
  async getCubeMetadata(): Promise<{
    totalPoints: number;
    layers: string[];
    variables: string[];
    spatialExtent: { h3Resolution: number[]; cellCount: number };
    temporalExtent: { startTime: string; endTime: string };
  }> {
    const layers = Array.from(this.layerIndex.keys());
    const variables = Array.from(this.variableIndex.keys());
    const h3Cells = Array.from(this.spatialIndex.keys());

    // Infer H3 resolutions from cell indices
    const resolutions = new Set<number>();
    for (const h3 of h3Cells) {
      // H3 string length correlates with resolution (not perfect but heuristic)
      resolutions.add(h3.length === 15 ? 6 : 7); // Simplified - real impl should use h3.getResolution()
    }

    return {
      totalPoints: this.data.size,
      layers,
      variables,
      spatialExtent: {
        h3Resolution: Array.from(resolutions),
        cellCount: h3Cells.length
      },
      temporalExtent: {
        startTime: this.minTimestamp || '',
        endTime: this.maxTimestamp || ''
      }
    };
  }

  /**
   * Close (no-op for in-memory)
   */
  async close(): Promise<void> {
    // No resources to clean up
  }

  // ========== PRIVATE HELPER METHODS ==========

  private addToIndices(key: string, point: DataPoint): void {
    // Spatial index
    if (!this.spatialIndex.has(point.h3Index)) {
      this.spatialIndex.set(point.h3Index, new Set());
    }
    this.spatialIndex.get(point.h3Index)!.add(key);

    // Layer index
    if (!this.layerIndex.has(point.layer)) {
      this.layerIndex.set(point.layer, new Set());
    }
    this.layerIndex.get(point.layer)!.add(key);

    // Variable index
    if (!this.variableIndex.has(point.variable)) {
      this.variableIndex.set(point.variable, new Set());
    }
    this.variableIndex.get(point.variable)!.add(key);
  }

  private removeFromIndices(key: string, point: DataPoint): void {
    this.spatialIndex.get(point.h3Index)?.delete(key);
    this.layerIndex.get(point.layer)?.delete(key);
    this.variableIndex.get(point.variable)?.delete(key);
  }

  private recomputeTemporalExtent(): void {
    this.minTimestamp = null;
    this.maxTimestamp = null;

    for (const point of this.data.values()) {
      if (!this.minTimestamp || point.timestamp < this.minTimestamp) {
        this.minTimestamp = point.timestamp;
      }
      if (!this.maxTimestamp || point.timestamp > this.maxTimestamp) {
        this.maxTimestamp = point.timestamp;
      }
    }
  }

  private timeDiffSeconds(t1: string, t2: string): number {
    const d1 = new Date(t1).getTime();
    const d2 = new Date(t2).getTime();
    return Math.abs(d1 - d2) / 1000;
  }

  private downsample<T extends { timestamp: string }>(points: T[], targetCount: number): T[] {
    if (points.length <= targetCount) return points;

    const step = points.length / targetCount;
    const result: T[] = [];

    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step);
      result.push(points[index]);
    }

    return result;
  }
}
