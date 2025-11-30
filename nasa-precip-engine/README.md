# NASA IMERG Precipitation Microservice

Python microservice providing real-time precipitation data from NASA GPM IMERG for GeoLens H3 hexagons.

## Overview

This service:
- ✅ Fetches real-time precipitation from NASA GPM IMERG via OPeNDAP
- ✅ Dynamically subsets to Europe bbox only (no massive downloads)
- ✅ Accumulates precipitation over 24h and 72h windows
- ✅ Samples precipitation at H3 hexagon centroids
- ✅ Caches data in-memory for 30 minutes
- ✅ Exposes REST API for GeoLens backend integration

## Data Source

**NASA GPM IMERG V07** (Integrated Multi-satellitE Retrievals for GPM)
- **Product**: GPM_3IMERGHH (Late Run, 4-18h latency)
- **Fallback**: GPM_3IMERGHHE (Early Run, 4-6h latency)
- **Resolution**: 0.1° (~10km at equator)
- **Temporal**: 30-minute intervals
- **Coverage**: 60°N-60°S (covers all of Europe)
- **Variable**: precipitationCal (calibrated precipitation rate, mm/hr)

## Installation

### 1. Prerequisites

- Python 3.11+
- NASA Earthdata account (free): https://urs.earthdata.nasa.gov/users/new

### 2. Install Dependencies

```bash
cd nasa-precip-engine

# Using pip
pip install -e .

# Or using requirements.txt (if you prefer)
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your NASA Earthdata credentials:

```bash
EARTHDATA_USERNAME=your_username
EARTHDATA_PASSWORD=your_password
```

## Usage

### Start Server

```bash
# Development mode (auto-reload)
uvicorn src.main:app --reload --host 0.0.0.0 --port 8001

# Production mode
uvicorn src.main:app --host 0.0.0.0 --port 8001 --workers 4
```

Server will start at: http://localhost:8001

### API Documentation

Interactive API docs (Swagger UI): http://localhost:8001/docs

### Endpoints

#### **POST /precip/h3** - Get precipitation for H3 cells

**Request:**
```json
{
  "h3_indices": ["872a1070fffffff", "872a1072fffffff"],
  "t_ref": "2024-03-15T12:00:00Z",
  "hours_24": true,
  "hours_72": true
}
```

**Response:**
```json
{
  "cells": [
    {
      "h3_index": "872a1070fffffff",
      "rain24h_mm": 12.4,
      "rain72h_mm": 34.8
    },
    {
      "h3_index": "872a1072fffffff",
      "rain24h_mm": 8.2,
      "rain72h_mm": 22.5
    }
  ],
  "source": "IMERG-Late",
  "t_ref": "2024-03-15T12:00:00",
  "cached": false
}
```

**Parameters:**
- `h3_indices`: List of H3 cell indices (any resolution, max 10,000)
- `t_ref`: Reference timestamp (ISO 8601). Defaults to current UTC time.
- `hours_24`: Include 24-hour precipitation (default: true)
- `hours_72`: Include 72-hour precipitation (default: true)

#### **GET /health** - Health check

```bash
curl http://localhost:8001/health
```

Response:
```json
{
  "status": "healthy",
  "service": "nasa-precip-engine",
  "version": "1.0.0"
}
```

#### **GET /cache/stats** - Cache statistics

```bash
curl http://localhost:8001/cache/stats
```

Response:
```json
{
  "total_entries": 5,
  "expired_entries": 1,
  "valid_entries": 4,
  "max_size": 50,
  "ttl_seconds": 1800
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│           NASA IMERG Precipitation Service          │
└─────────────────────────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
     ┌──────▼──────┐        ┌──────▼──────┐
     │ FastAPI App │        │ In-Memory   │
     │  (main.py)  │        │   Cache     │
     └──────┬──────┘        │ (cache.py)  │
            │               └─────────────┘
            │
     ┌──────▼──────────────────┐
     │    IMERG Client         │
     │  (imerg_client.py)      │
     │                         │
     │ - earthaccess auth      │
     │ - xarray OPeNDAP        │
     │ - Temporal aggregation  │
     └──────┬──────────────────┘
            │
     ┌──────▼──────────────────┐
     │    H3 Mapping           │
     │  (h3_mapping.py)        │
     │                         │
     │ - H3 → lat/lon          │
     │ - Nearest-neighbor      │
     │   sampling              │
     └─────────────────────────┘
```

## Configuration

All configuration in `src/config.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `LAT_MIN` | 35.0 | Europe bbox southern limit |
| `LAT_MAX` | 72.0 | Europe bbox northern limit |
| `LON_MIN` | -10.0 | Europe bbox western limit |
| `LON_MAX` | 40.0 | Europe bbox eastern limit |
| `CACHE_MAX_SIZE` | 50 | Max in-memory cache entries |
| `CACHE_TTL_SECONDS` | 1800 | Cache TTL (30 minutes) |
| `MAX_H3_CELLS_PER_REQUEST` | 10000 | Max H3 cells per API call |

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| **First request (24h)** | 10-30s | Downloads ~48 IMERG granules |
| **First request (72h)** | 30-90s | Downloads ~144 IMERG granules |
| **Cached request** | <100ms | Served from in-memory cache |
| **H3 sampling (100 cells)** | 50-200ms | Nearest-neighbor interpolation |

**Cache efficiency:**
- Cache hit rate: ~80% for repeated queries
- Memory usage: ~50-100MB per cached cube
- Automatic eviction: LRU when max size reached

## Integration with GeoLens

See [PHASE 2 Integration Guide](../docs/NASA_PRECIP_INTEGRATION.md) for:
- Creating `NasaPrecipProvider` in Node.js API
- Updating `tileOrchestrator` to call microservice
- Adding `rain24h_mm` / `rain72h_mm` to Water Risk Engine

## Troubleshooting

### Authentication Error

```
❌ NASA Earthdata authentication failed
```

**Solution:**
- Verify credentials in `.env`
- Test login at: https://urs.earthdata.nasa.gov/
- Check firewall/proxy settings

### No Data Available

```
ValueError: No IMERG data available for time window
```

**Solution:**
- IMERG has 4-6h latency (try `t_ref` 6 hours in past)
- Late Run has 18h latency (use `use_early=True` for recent data)
- Check if time window is within IMERG coverage (GPM mission started 2014)

### Out of Memory

```
MemoryError: Unable to allocate array
```

**Solution:**
- Reduce `CACHE_MAX_SIZE` in config.py
- Increase server RAM
- Use Docker with memory limits

## Docker Deployment (Optional)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install -e .

COPY src/ ./src/

ENV EARTHDATA_USERNAME=your_username
ENV EARTHDATA_PASSWORD=your_password

EXPOSE 8001

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

Build and run:
```bash
docker build -t nasa-precip-engine .
docker run -p 8001:8001 --env-file .env nasa-precip-engine
```

## License

MIT License - NASA data is public domain.

## Support

For issues:
1. Check logs: `LOG_LEVEL=DEBUG` in `.env`
2. Verify NASA Earthdata credentials
3. Test NASA access: https://disc.gsfc.nasa.gov/

## Credits

**Data Source:**
- NASA GPM Mission: https://gpm.nasa.gov/
- IMERG Algorithm: Huffman et al., 2019

**Libraries:**
- earthaccess: https://github.com/nsidc/earthaccess
- xarray: https://docs.xarray.dev/
- h3-py: https://github.com/uber/h3-py
