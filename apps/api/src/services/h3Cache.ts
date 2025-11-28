import fs from 'fs';
import path from 'path';
import { CellScore } from '@geo-lens/geocube';

// Simple file-based cache for MVP
// In production, use Redis or a proper DB
const CACHE_FILE = path.resolve(__dirname, '../../../../data/intermediate/h3_cache.json');

// Ensure directory exists
const cacheDir = path.dirname(CACHE_FILE);
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
}

export interface H3CacheRecord extends CellScore {
    updatedAt: string;
    sourceHash: string;
}

class H3CacheService {
    private cache: Map<string, H3CacheRecord>;
    private dirty: boolean = false;

    constructor() {
        this.cache = new Map();
        this.load();

        // Auto-save periodically
        setInterval(() => this.save(), 60000); // Every minute
    }

    private load() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
                if (Array.isArray(data)) {
                    data.forEach((record: H3CacheRecord) => {
                        this.cache.set(record.h3Index, record);
                    });
                    console.log(`[H3Cache] Loaded ${this.cache.size} records.`);
                }
            } catch (e) {
                console.error('[H3Cache] Failed to load cache:', e);
            }
        }
    }

    private save() {
        if (!this.dirty) return;
        try {
            const data = Array.from(this.cache.values());
            fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
            this.dirty = false;
            console.log(`[H3Cache] Saved ${data.length} records.`);
        } catch (e) {
            console.error('[H3Cache] Failed to save cache:', e);
        }
    }

    public get(h3Index: string): H3CacheRecord | undefined {
        return this.cache.get(h3Index);
    }

    public set(h3Index: string, record: H3CacheRecord) {
        this.cache.set(h3Index, record);
        this.dirty = true;
    }

    public has(h3Index: string): boolean {
        return this.cache.has(h3Index);
    }

    public getMulti(h3Indices: string[]): (H3CacheRecord | undefined)[] {
        return h3Indices.map(index => this.cache.get(index));
    }
}

export const h3Cache = new H3CacheService();
