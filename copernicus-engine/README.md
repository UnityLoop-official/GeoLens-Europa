# Copernicus Engine

Automated data acquisition from **Copernicus Data Space** and **Copernicus Land Monitoring Service (CLMS)** for GeoLens Europa. This service provides programmatic access to DEM (Digital Elevation Model) and Land Cover datasets.

## Overview

**Copernicus Engine** is a Python-based ETL service that:
- Fetches DEM data from Copernicus Data Space API (STAC/OData)
- Interfaces with CLMS Download API for Land Cover datasets
- Supports OAuth2 JWT authentication for CLMS
- Provides a command-line interface for dataset downloads
- Is designed to integrate with GeoLens Europa's existing geospatial pipeline

## Architecture

```
copernicus-engine/
├── src/
│   ├── copernicus_client.py       # Copernicus Data Space client (STAC/OData)
│   ├── land_copernicus_client.py  # CLMS Download API client (JWT)
│   ├── copernicus_etl.py          # High-level ETL functions
│   ├── download_clc2018.py        # CLC2018 download script
│   └── fetch_basemaps.py          # CLI script for dataset downloads
├── requirements.txt               # Python dependencies
├── .env.example                  # Environment variables template
└── README.md                     # This file
```

## Prerequisites

1. **Python 3.11+**
2. **Copernicus Data Space Account** (free):
   - Register at: [https://dataspace.copernicus.eu/](https://dataspace.copernicus.eu/)
   - Obtain API credentials (Bearer token or OAuth2 client credentials)

3. **Environment Variables**: Configure access credentials (see Configuration section)

## Installation

1. **Install Python dependencies**:
   ```bash
   cd copernicus-engine
   pip install -r requirements.txt
   ```

2. **Configure credentials**:
   ```bash
   cp .env.example .env
   # Edit .env with your Copernicus API credentials
   ```

## Configuration

### Required Environment Variables

Create a `.env` file in the `copernicus-engine` directory:

```bash
# Base URL for Copernicus API
COPERNICUS_API_BASE_URL=https://catalogue.dataspace.copernicus.eu

# Authentication - Option 1: Static Token (recommended)
COPERNICUS_API_TOKEN=your_bearer_token_here

# Authentication - Option 2: OAuth2 (alternative)
# COPERNICUS_OIDC_TOKEN_URL=https://identity.cloudferro.com/auth/realms/DIAS/protocol/openid-connect/token
# COPERNICUS_CLIENT_ID=your_client_id
# COPERNICUS_CLIENT_SECRET=your_client_secret

# Dataset Collection IDs (check STAC catalog for exact IDs)
COPERNICUS_DEM_COLLECTION_ID=COP-DEM-GLO-30
COPERNICUS_LC_COLLECTION_ID=CORINE
```

### CLMS Download API Configuration

For Copernicus Land Monitoring Service (CLMS) datasets like CORINE Land Cover:

```bash
# CLMS API Authentication (JWT Bearer)
COPERNICUS_CLIENT_ID=your_client_id_from_service_key
COPERNICUS_USER_ID=your_user_id_from_service_key
COPERNICUS_TOKEN_URI=https://land.copernicus.eu/@@oauth2-token
COPERNICUS_PRIVATE_KEY_FILE=.copernicus_key.pem
```

**How to obtain CLMS credentials:**
1. Visit: https://land.copernicus.eu/en/how-to-guides/how-to-download-spatial-data/how-to-create-api-tokens
2. Create a service key (OAuth2 JWT)
3. Download the JSON file containing `client_id`, `user_id`, and RSA private key
4. Save the private key to `.copernicus_key.pem` in the `copernicus-engine` directory
5. Add `client_id` and `user_id` to `.env`

### Finding Collection IDs

Collection IDs vary by API provider. To find the correct IDs:

1. **Official Copernicus Data Space**:
   - Browse STAC catalog: [https://catalogue.dataspace.copernicus.eu/stac/](https://catalogue.dataspace.copernicus.eu/stac/)
   - Look for:
     - DEM: `COP-DEM-GLO-30` (30m) or `COP-DEM-GLO-90` (90m)
     - Land Cover: `CORINE` or `CGLS_LC100`

2. **CREODIAS Alternative**:
   - Base URL: `https://datahub.creodias.eu`
   - Browse collections: [https://datahub.creodias.eu/odata/v1/Collections](https://datahub.creodias.eu/odata/v1/Collections)

## CLMS Download API

The Copernicus Land Monitoring Service provides a REST API for programmatic data access. The `land_copernicus_client.py` module implements this API.

### How It Works

The CLMS Download API follows this workflow:

1. **Search Dataset**: Find datasets using `/api/@search` with filters
2. **Get Dataset Details**: Retrieve full metadata including available files
3. **Get Downloadable Files**: Extract file information from `dataset_download_information`
4. **Fetch URLs** (when supported): Use `/api/@get-download-file-urls` for dynamic datasets

### Usage Example

```python
from src.land_copernicus_client import CLMSClient, CLMSConfig

# Initialize client with credentials from .env
config = CLMSConfig.from_env()
client = CLMSClient(config)

# Step 1: Search for datasets
results = client.search_datasets(query="CLC2018")
print(f"Found {len(results)} datasets")

# Step 2: Get full dataset details
dataset_url = results[0]["url"]
details = client.get_dataset_details(dataset_url)

# Step 3: List downloadable files
files = client.get_downloadable_files(details)
for file_info in files:
    print(f"{file_info['name']}: {file_info['format']}, {file_info['collection']}")

# Step 4: Get download URLs (for dynamic/temporal datasets)
# Note: This may not work for all pre-packaged datasets
try:
    urls = client.get_download_file_urls(
        dataset_uid=details["UID"],
        download_information_id=files[0]["download_information_id"],
        date_from="2018-01-01",
        date_to="2018-12-31"
    )
    print(f"Download URLs: {urls}")
except ValueError as e:
    print(f"Cannot get URLs programmatically: {e}")
```

### CLC2018 (CORINE Land Cover, 100m) – Manual Download (Temporary)

**Programmatic download of CLC2018 is currently NOT supported** via the CLMS Download API. The `/api/@get-download-file-urls` endpoint requires temporal parameters that are not applicable to static pre-packaged datasets like CLC2018.

**Manual Download + Extraction Workflow:**

1. **Download the pre-packaged ZIP file:**
   - Visit: https://land.copernicus.eu/en/products/corine-land-cover/clc2018
   - Find the product **CORINE Land Cover 2018 (vector/raster 100 m)**
   - Download: `u2018_clc2018_v2020_20u1_raster100m.zip` (~125 MB)
   - Save to: `copernicus-engine/data/raw/clc/`

2. **Extract the GeoTIFF:**
   ```bash
   cd copernicus-engine
   python -m src.download_clc2018
   ```

   This will:
   - Verify the ZIP file exists
   - Extract the GeoTIFF from the ZIP
   - Rename it to `CLC2018_100m.tif` for consistency
   - Place it in `data/raw/clc/`

**Expected Output:**
```
======================================================================
CORINE Land Cover 2018 Extraction
Copernicus Land Monitoring Service
======================================================================
ZIP file: ../data/raw/clc/u2018_clc2018_v2020_20u1_raster100m.zip
Output directory: ../data/raw/clc
======================================================================

[1/2] Extracting CLC2018 GeoTIFF from ZIP...

======================================================================
[SUCCESS] Extraction Complete!
======================================================================
GeoTIFF extracted to: ../data/raw/clc/CLC2018_100m.tif
File size: 125.0 MB
======================================================================
```

**Custom Paths:**
```bash
# Custom ZIP location
python -m src.download_clc2018 --zip /path/to/clc2018.zip

# Custom output directory
python -m src.download_clc2018 --outdir /custom/output/dir

# Verbose logging
python -m src.download_clc2018 -v
```

### CLMS API Documentation

- Official API Docs: https://eea.github.io/clms-api-docs/download.html
- How-to Guide: https://land.copernicus.eu/en/how-to-guides/how-to-download-spatial-data/how-to-download-data-using-clms-api
- Token Creation: https://land.copernicus.eu/en/how-to-guides/how-to-download-spatial-data/how-to-create-api-tokens

## Usage

### CLI Script

The `fetch_basemaps.py` script provides a command-line interface for downloading datasets:

#### Download DEM

```bash
# Full Europe coverage
python -m src.fetch_basemaps dem --bbox -10.0 35.0 40.0 72.0

# Italy only
python -m src.fetch_basemaps dem --bbox 8.0 44.0 13.0 47.0

# Custom output path
python -m src.fetch_basemaps dem --bbox 8.0 44.0 13.0 47.0 \
    --output data/raw/copernicus/dem/italy_dem.tif

# Verbose logging
python -m src.fetch_basemaps dem --bbox 8.0 44.0 13.0 47.0 -v
```

#### Download Land Cover

```bash
# Full Europe coverage
python -m src.fetch_basemaps landcover --bbox -10.0 35.0 40.0 72.0

# Specific year (e.g., CLC2018)
python -m src.fetch_basemaps landcover --bbox 8.0 44.0 13.0 47.0 --year 2018

# Custom output path
python -m src.fetch_basemaps landcover --bbox 8.0 44.0 13.0 47.0 \
    --output data/raw/copernicus/landcover/italy_clc2018.tif
```

#### Help

```bash
# General help
python -m src.fetch_basemaps --help

# DEM-specific help
python -m src.fetch_basemaps dem --help

# Land Cover-specific help
python -m src.fetch_basemaps landcover --help
```

### Python API

You can also use the modules programmatically:

```python
from pathlib import Path
from src.copernicus_etl import fetch_dem_for_bbox, fetch_landcover_for_bbox

# Fetch DEM for Italy
dem_path = fetch_dem_for_bbox(
    bbox=(8.0, 44.0, 13.0, 47.0),
    out_path=Path("data/raw/copernicus/dem/italy_dem.tif")
)
print(f"DEM downloaded to: {dem_path}")

# Fetch Land Cover for Italy
lc_path = fetch_landcover_for_bbox(
    bbox=(8.0, 44.0, 13.0, 47.0),
    year=2018
)
print(f"Land Cover downloaded to: {lc_path}")
```

## Dataset Details

### Digital Elevation Model (DEM)

- **Product**: Copernicus DEM GLO-30
- **Resolution**: 30m (or 90m depending on configuration)
- **Coverage**: Global
- **Format**: GeoTIFF
- **CRS**: EPSG:4326 (WGS84)

### Land Cover

- **Product**: CORINE Land Cover (CLC)
- **Resolution**: 100m
- **Coverage**: Europe
- **Format**: GeoTIFF (raster classification)
- **Updates**: Every 6 years (latest: CLC2018)
- **Classes**: 44 land cover classes

## Integration with GeoLens

This service is designed to replace manual downloads documented in the main README:

**Before** (Manual):
1. Navigate to Copernicus website
2. Register and login
3. Search for products
4. Manually download ~2GB files
5. Place in correct directories

**After** (Automated):
```bash
python -m src.fetch_basemaps dem --bbox -10.0 35.0 40.0 72.0
python -m src.fetch_basemaps landcover --bbox -10.0 35.0 40.0 72.0
```

The downloaded files are automatically placed in the correct directory structure:
- DEM: `data/raw/copernicus/dem/`
- Land Cover: `data/raw/copernicus/landcover/`

## Troubleshooting

### Authentication Errors (401)

```
RuntimeError: Authentication failed. Check your COPERNICUS_API_TOKEN or OAuth2 credentials.
```

**Solutions**:
1. Verify your token in `.env` is correct and not expired
2. Try regenerating your token from Copernicus Data Space dashboard
3. Switch to OAuth2 authentication if static token fails

### Collection Not Found

```
RuntimeError: No dem products found for specified bbox
```

**Solutions**:
1. Verify `COPERNICUS_DEM_COLLECTION_ID` matches your API provider's STAC catalog
2. Check that the bounding box overlaps with dataset coverage
3. Try using the STAC browser to manually verify collection IDs

### Network Timeouts

Large downloads (>1GB) may timeout on slow connections.

**Solutions**:
1. Use smaller bounding boxes
2. Increase timeout in `CopernicusConfig` (edit `copernicus_client.py`)
3. Resume download by re-running command (partially downloaded files are cleaned up)

## Future Enhancements

### Planned Features

1. **COG Conversion**: Automatic conversion to Cloud-Optimized GeoTIFF
   ```bash
   python -m src.fetch_basemaps dem --bbox ... --cog
   ```

2. **PMTiles Generation**: Integration with tile generation pipeline
   ```bash
   python -m src.fetch_basemaps dem --bbox ... --pmtiles
   ```

3. **Admin API Endpoint**: FastAPI endpoint for triggering downloads via HTTP
   ```
   GET /admin/copernicus/dem?bbox=-10,35,40,72
   ```

4. **Caching**: Avoid re-downloading identical bounding boxes

### TODO Items

See inline `TODO` comments in source code:
- `copernicus_etl.py`: COG/PMTiles conversion functions
- `fetch_basemaps.py`: Implement `--cog` and `--pmtiles` flags
- `copernicus_client.py`: Enhanced pagination logic for large result sets

## Architecture Patterns

This service follows the same patterns as the existing `nasa-precip-engine`:

1. **Configuration via Environment Variables** (dotenv)
2. **Clean Separation**: Client → ETL → CLI/API
3. **Type Hints**: Full type annotations (Python 3.11+)
4. **Structured Logging**: Using Python's `logging` module
5. **Error Handling**: Explicit error messages and HTTP status codes

## Related Documentation

- [GeoLens Europa Main README](../README.md)
- [NASA Precipitation Engine](../nasa-precip-engine/README.md)
- [Copernicus Data Space Documentation](https://documentation.dataspace.copernicus.eu/)

## License

Part of GeoLens Europa project. See main repository for license details.
