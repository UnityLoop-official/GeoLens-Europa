"""
Copernicus ETL Module

High-level functions for fetching DEM and Land Cover data from Copernicus
Data Space using the generic Copernicus API client.

Environment Variables (in addition to client requirements):
    COPERNICUS_DEM_COLLECTION_ID - Collection ID for DEM products
    COPERNICUS_LC_COLLECTION_ID - Collection ID for Land Cover products

Usage:
    from copernicus_etl import fetch_dem_for_bbox, fetch_landcover_for_bbox

    # Fetch DEM
    dem_path = fetch_dem_for_bbox(
        bbox=(-10.0, 35.0, 40.0, 72.0),
        out_path=Path("data/raw/copernicus/dem/europe_dem.tif")
    )

    # Fetch Land Cover
    lc_path = fetch_landcover_for_bbox(
        bbox=(-10.0, 35.0, 40.0, 72.0)
    )
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

from .copernicus_client import CopernicusClient, CopernicusConfig

logger = logging.getLogger("geolens.copernicus")


def _bbox_hash(bbox: tuple[float, float, float, float]) -> str:
    """
    Generate a short hash from bounding box coordinates

    Args:
        bbox: (min_lon, min_lat, max_lon, max_lat)

    Returns:
        8-character hex hash
    """
    bbox_str = f"{bbox[0]:.4f}_{bbox[1]:.4f}_{bbox[2]:.4f}_{bbox[3]:.4f}"
    return hashlib.sha256(bbox_str.encode()).hexdigest()[:8]


def _validate_bbox(bbox: tuple[float, float, float, float]) -> None:
    """
    Validate bounding box coordinates

    Args:
        bbox: (min_lon, min_lat, max_lon, max_lat)

    Raises:
        ValueError: If bbox is invalid
    """
    min_lon, min_lat, max_lon, max_lat = bbox

    # Check order
    if min_lon >= max_lon:
        raise ValueError(f"Invalid bbox: min_lon ({min_lon}) >= max_lon ({max_lon})")
    if min_lat >= max_lat:
        raise ValueError(f"Invalid bbox: min_lat ({min_lat}) >= max_lat ({max_lat})")

    # Check reasonable ranges (EPSG:4326)
    if not (-180 <= min_lon <= 180):
        raise ValueError(f"min_lon out of range: {min_lon}")
    if not (-180 <= max_lon <= 180):
        raise ValueError(f"max_lon out of range: {max_lon}")
    if not (-90 <= min_lat <= 90):
        raise ValueError(f"min_lat out of range: {min_lat}")
    if not (-90 <= max_lat <= 90):
        raise ValueError(f"max_lat out of range: {max_lat}")


def _select_best_product(products: list[dict], dataset_type: str) -> dict:
    """
    Select the best product from search results

    Selection policy:
    - DEM: Highest resolution, then most recent
    - Land Cover: Most recent date

    Args:
        products: List of STAC feature dictionaries
        dataset_type: "dem" or "landcover"

    Returns:
        Selected product feature dictionary

    Raises:
        RuntimeError: If no suitable product found
    """
    if not products:
        raise RuntimeError(f"No {dataset_type} products found for specified bbox")

    logger.info(f"[ETL] Selecting best product from {len(products)} candidates")

    if dataset_type == "dem":
        # DEM: prefer higher resolution
        # TODO: Parse resolution from properties or assets metadata
        # For now, take the first product (assuming API returns best first)
        selected = products[0]

    elif dataset_type == "landcover":
        # Land Cover: prefer most recent
        # Sort by datetime property (descending)
        def get_datetime(product):
            props = product.get("properties", {})
            dt_str = props.get("datetime") or props.get("start_datetime", "")
            return dt_str

        sorted_products = sorted(products, key=get_datetime, reverse=True)
        selected = sorted_products[0]

    else:
        # Default: first product
        selected = products[0]

    product_id = selected.get("id", "unknown")
    logger.info(f"[ETL] Selected product: {product_id}")

    return selected


def _get_asset_href(product: dict, asset_key: str = "data") -> str:
    """
    Extract asset download URL from product

    Args:
        product: STAC feature dictionary
        asset_key: Asset key to look for (default: "data")

    Returns:
        Asset download URL

    Raises:
        RuntimeError: If asset not found
    """
    assets = product.get("assets", {})

    # Try specified key first
    if asset_key in assets:
        href = assets[asset_key].get("href")
        if href:
            return href

    # Fallback: look for common keys
    for key in ["data", "visual", "image", "geotiff", "tif"]:
        if key in assets:
            href = assets[key].get("href")
            if href:
                logger.debug(f"[ETL] Using asset key: {key}")
                return href

    # Last resort: first asset with href
    for key, asset in assets.items():
        href = asset.get("href")
        if href:
            logger.warning(f"[ETL] Fallback to first available asset: {key}")
            return href

    raise RuntimeError(f"No valid asset found in product: {product.get('id')}")


def get_copernicus_client() -> CopernicusClient:
    """
    Create and return a configured Copernicus API client

    Returns:
        Initialized CopernicusClient

    Raises:
        ValueError: If required environment variables missing
    """
    config = CopernicusConfig.from_env()
    return CopernicusClient(config)


def fetch_dem_for_bbox(
    bbox: tuple[float, float, float, float],
    out_path: Optional[Path] = None,
    resolution_preference: Optional[str] = None
) -> Path:
    """
    Fetch Digital Elevation Model (DEM) for specified bounding box

    Selection Policy:
    - Prefers highest available resolution
    - Falls back to most recent product if resolution unavailable

    Args:
        bbox: Bounding box (min_lon, min_lat, max_lon, max_lat) in EPSG:4326
        out_path: Output file path (optional, auto-generated if None)
        resolution_preference: Preferred resolution (e.g., "30m", "90m") - reserved for future use

    Returns:
        Path to downloaded DEM GeoTIFF

    Raises:
        ValueError: If bbox invalid
        RuntimeError: If download fails

    Example:
        >>> dem_path = fetch_dem_for_bbox(
        ...     bbox=(8.0, 44.0, 13.0, 47.0),
        ...     out_path=Path("data/raw/copernicus/dem/italy_dem.tif")
        ... )
    """
    _validate_bbox(bbox)

    # Get collection ID from environment
    collection_id = os.getenv("COPERNICUS_DEM_COLLECTION_ID")
    if not collection_id:
        raise ValueError(
            "COPERNICUS_DEM_COLLECTION_ID environment variable required. "
            "Example: 'COP-DEM-GLO-30'"
        )

    logger.info(f"[ETL:DEM] Fetching DEM for bbox: {bbox}")
    logger.info(f"[ETL:DEM] Collection: {collection_id}")

    # Create client
    client = get_copernicus_client()

    # Search for products
    products = client.search_products(
        collection_id=collection_id,
        bbox=bbox,
        limit=50
    )

    # Select best product
    selected_product = _select_best_product(products, dataset_type="dem")

    # Get asset URL
    asset_href = _get_asset_href(selected_product)
    logger.info(f"[ETL:DEM] Asset URL: {asset_href}")

    # Determine output path
    if out_path is None:
        bbox_hash = _bbox_hash(bbox)
        out_path = Path(f"data/raw/copernicus/dem/dem_{bbox_hash}.tif")

    # Download
    logger.info(f"[ETL:DEM] Downloading to: {out_path}")
    final_path = client.download_asset(asset_href, out_path)

    logger.info(f"[ETL:DEM] ✅ DEM downloaded successfully: {final_path}")
    return final_path


def fetch_landcover_for_bbox(
    bbox: tuple[float, float, float, float],
    out_path: Optional[Path] = None,
    year: Optional[int] = None
) -> Path:
    """
    Fetch Land Cover classification for specified bounding box

    Selection Policy:
    - Prefers most recent year available
    - If year specified, attempts to find matching product

    Args:
        bbox: Bounding box (min_lon, min_lat, max_lon, max_lat) in EPSG:4326
        out_path: Output file path (optional, auto-generated if None)
        year: Preferred year (optional, e.g., 2018 for CLC2018)

    Returns:
        Path to downloaded Land Cover GeoTIFF

    Raises:
        ValueError: If bbox invalid
        RuntimeError: If download fails

    Example:
        >>> lc_path = fetch_landcover_for_bbox(
        ...     bbox=(8.0, 44.0, 13.0, 47.0),
        ...     year=2018
        ... )
    """
    _validate_bbox(bbox)

    # Get collection ID from environment
    collection_id = os.getenv("COPERNICUS_LC_COLLECTION_ID")
    if not collection_id:
        raise ValueError(
            "COPERNICUS_LC_COLLECTION_ID environment variable required. "
            "Example: 'CORINE'"
        )

    logger.info(f"[ETL:LC] Fetching Land Cover for bbox: {bbox}")
    logger.info(f"[ETL:LC] Collection: {collection_id}")
    if year:
        logger.info(f"[ETL:LC] Preferred year: {year}")

    # Create client
    client = get_copernicus_client()

    # Search for products
    # TODO: Add temporal filter if year specified
    products = client.search_products(
        collection_id=collection_id,
        bbox=bbox,
        limit=50
    )

    # Select best product
    selected_product = _select_best_product(products, dataset_type="landcover")

    # Get asset URL
    asset_href = _get_asset_href(selected_product)
    logger.info(f"[ETL:LC] Asset URL: {asset_href}")

    # Determine output path
    if out_path is None:
        bbox_hash = _bbox_hash(bbox)
        out_path = Path(f"data/raw/copernicus/landcover/lc_{bbox_hash}.tif")

    # Download
    logger.info(f"[ETL:LC] Downloading to: {out_path}")
    final_path = client.download_asset(asset_href, out_path)

    logger.info(f"[ETL:LC] ✅ Land Cover downloaded successfully: {final_path}")
    return final_path


# ============================================================================
# OPTIONAL: Raster Processing Utilities
# ============================================================================
# TODO: Integration with existing COG/PMTiles pipeline
#
# These functions should be implemented to integrate with existing geospatial
# processing utilities in the GeoLens project.


def to_cog(src_tif: Path, dest_cog: Optional[Path] = None) -> Path:
    """
    Convert GeoTIFF to Cloud-Optimized GeoTIFF (COG)

    Args:
        src_tif: Source GeoTIFF path
        dest_cog: Destination COG path (optional, defaults to src_tif with _cog suffix)

    Returns:
        Path to COG file

    TODO: Implement using GDAL or rasterio with COG driver
    TODO: Reuse existing COG conversion utilities if available in the project
    """
    raise NotImplementedError(
        "COG conversion not yet implemented. "
        "TODO: Integrate with existing raster processing pipeline or implement using GDAL."
    )


def to_pmtiles(src_tif: Path, dest_pmtiles: Optional[Path] = None) -> Path:
    """
    Convert GeoTIFF to PMTiles format for efficient web serving

    Args:
        src_tif: Source GeoTIFF path
        dest_pmtiles: Destination PMTiles path (optional)

    Returns:
        Path to PMTiles file

    TODO: Implement using rio-mbtiles or similar tool
    TODO: Reuse existing PMTiles generation pipeline if available
    """
    raise NotImplementedError(
        "PMTiles conversion not yet implemented. "
        "TODO: Integrate with existing tile generation pipeline or implement using rio-mbtiles."
    )
