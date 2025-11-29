/**
 * High-Performance Tile Cache
 *
 * In-memory caching layer for H3 tiles with:
 * - TTL expiration
 * - LRU eviction
 * - Compression
 * - Memory limits
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number; // Estimated size in bytes
}

export class TileCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = []; // For LRU tracking

  private readonly maxSize: number; // Max cache size in bytes
  private readonly ttl: number; // Time-to-live in milliseconds
  private currentSize: number = 0;

  // Stats
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0
  };

  constructor(options: { maxSizeMB?: number; ttlMinutes?: number } = {}) {
    this.maxSize = (options.maxSizeMB || 100) * 1024 * 1024; // Default 100MB
    this.ttl = (options.ttlMinutes || 5) * 60 * 1000; // Default 5 minutes
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update LRU
    this.updateAccessOrder(key);
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, data: T): void {
    const size = this.estimateSize(data);

    // Evict if needed
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }

    // Remove old entry if exists
    if (this.cache.has(key)) {
      const old = this.cache.get(key)!;
      this.currentSize -= old.size;
    }

    // Set new entry
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      size
    });

    this.currentSize += size;
    this.updateAccessOrder(key);
    this.stats.sets++;
  }

  /**
   * Delete entry
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.currentSize -= entry.size;
    this.removeFromAccessOrder(key);
    return true;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      entries: this.cache.size,
      sizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
      maxSizeMB: (this.maxSize / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Clear expired entries (can be called periodically)
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  // ========== PRIVATE METHODS ==========

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const keyToEvict = this.accessOrder[0];
    this.delete(keyToEvict);
    this.stats.evictions++;
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private estimateSize(data: T): number {
    // Rough estimation: JSON string length * 2 (for UTF-16)
    try {
      return JSON.stringify(data).length * 2;
    } catch {
      return 1000; // Fallback estimate
    }
  }
}

// Global tile cache instance
export const tileCache = new TileCache({
  maxSizeMB: 200, // 200MB cache
  ttlMinutes: 10  // 10 minutes TTL
});

// Periodic cleanup (every 5 minutes)
setInterval(() => {
  const cleared = tileCache.clearExpired();
  if (cleared > 0) {
    console.log(`[TileCache] Cleared ${cleared} expired entries`);
  }
}, 5 * 60 * 1000);
