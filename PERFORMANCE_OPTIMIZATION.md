# GeoLens Performance Optimization Plan

## Problemi Identificati

### 1. **API Response Size Eccessiva**
```typescript
// Attuale: /api/h3/tile ritorna TUTTI i dati per ogni cella
{
  h3Index, water, landslide, seismic, mineral, metadata
}
// ~500-800 bytes per cella × 1000 celle per tile = 500-800KB per tile
```

### 2. **Nessun Caching**
- Ogni tile viene ricalcolato ad ogni richiesta
- Stesso tile richiesto multiple volte durante pan/zoom

### 3. **Troppi Dati Non Necessari**
- Frontend usa solo `score` ma riceve tutto (stress, recharge, prospectivity, ecc.)
- Metadata non usati (lat, lon, elevation, biome)

### 4. **Manca Rate Limiting**
- Client può fare centinaia di richieste in pochi secondi

### 5. **Click Cell Lento**
- `getCellData` chiama endpoint che ricalcola tutto ogni volta
- Nessun debouncing

---

## Soluzione: Ottimizzazioni Multi-Livello

### LIVELLO 1: API Response Compression (Immediate Impact)

**Prima (Current):**
```json
{
  "h3Index": "872a1070fffffff",
  "water": { "stress": 0.5, "recharge": 0.5, "score": 0.67 },
  "landslide": { "susceptibility": 0.8, "history": false, "score": 0.82 },
  "seismic": { "pga": 0.25, "class": "HIGH", "score": 0.75 },
  "mineral": { "prospectivity": 0.3, "type": "None", "score": 0.25 },
  "metadata": { "lat": 41.9, "lon": 12.5, "elevation": 450, "biome": "Mediterranean" }
}
// ~350 bytes per cella
```

**Dopo (Optimized):**
```json
{
  "i": "872a1070fffffff",  // h3Index → i
  "w": 0.67,               // water.score → w
  "l": 0.82,               // landslide.score → l
  "s": 0.75,               // seismic.score → s
  "m": 0.25                // mineral.score → m
}
// ~80 bytes per cella → 77% reduction
```

### LIVELLO 2: Server-Side Caching

**Implementation:**
```typescript
// In-memory cache con TTL
const tileCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minuti

// Rate limiting
import rateLimit from '@fastify/rate-limit';
server.register(rateLimit, {
  max: 100, // 100 requests
  timeWindow: '1 minute'
});
```

### LIVELLO 3: Frontend Debouncing

**Click Handler con Debounce:**
```typescript
const debouncedClick = useMemo(
  () => debounce(async (info) => {
    if (!info.object) return;
    const cell = info.object;
    setSelectedCell(cell); // Optimistic

    try {
      const detailed = await getCellData(cell.h3Index);
      setSelectedCell(detailed);
    } catch (e) {
      console.error(e);
    }
  }, 300),
  []
);
```

### LIVELLO 4: Lazy Loading + Pagination

**Tile Endpoint with Pagination:**
```typescript
GET /api/h3/tile?x=...&y=...&z=...&limit=500&offset=0
// Ritorna max 500 celle per request
// Client può richiedere more se needed
```

### LIVELLO 5: Compression Middleware

```typescript
import compress from '@fastify/compress';
server.register(compress, {
  global: true,
  encodings: ['gzip', 'deflate']
});
```

---

## Implementation Priority

### ✅ IMMEDIATE (< 1 hour)

1. **Compact Response Format** - 77% size reduction
2. **Response Compression** - Additional 60-70% reduction
3. **Rate Limiting** - Prevent abuse
4. **Frontend Debouncing** - Reduce unnecessary calls

**Expected Impact:** 90% reduction in data transfer

### 🚀 HIGH PRIORITY (< 2 hours)

5. **Server-Side Tile Caching** - 95% faster repeat loads
6. **Cell Data Caching** - Instant clicks on cached cells

**Expected Impact:** 10x faster tile loading

### 📊 MEDIUM PRIORITY (< 4 hours)

7. **Pagination** - Handle large datasets
8. **Performance Monitoring** - Track metrics
9. **Preload Adjacent Tiles** - Predictive loading

**Expected Impact:** Smooth experience even with millions of cells

---

## Benchmarks (Estimated)

### Current Performance
```
Tile Load (1000 cells):
  - Data Transfer: 500KB
  - Time: 2-3 seconds
  - Clicks: 300-500ms each

Total for 10 tiles: 5MB, 20-30s
```

### After Optimization
```
Tile Load (1000 cells):
  - Data Transfer: 80KB (gzipped: 15KB)
  - Time (first): 200-300ms
  - Time (cached): 10-20ms
  - Clicks: 50-100ms (debounced + cached)

Total for 10 tiles: 150KB, 2-3s (first load), <1s (cached)
```

**Improvement:** 97% less data, 90% faster

---

## Next Actions

Implementiamo nell'ordine:
1. Compact response format
2. Compression middleware
3. Rate limiting
4. Tile caching
5. Frontend debouncing
