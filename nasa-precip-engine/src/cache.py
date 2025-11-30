"""
In-memory cache for IMERG precipitation data

PURPOSE:
- Avoid redundant downloads of same time window
- Multiple H3 queries for same time period reuse cached cube
- Automatic expiration after TTL

CACHE KEY:
- (t_ref_date, hours) tuple
- Example: ('2024-03-15', 24) → precipitation cube for last 24h on 2024-03-15

CACHE STRUCTURE:
- PrecipCube: DataArray + metadata
- PRECIP_CACHE: global dict with LRU-like eviction
"""

import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Tuple, Optional
import xarray as xr

from config import CACHE_MAX_SIZE, CACHE_TTL_SECONDS


@dataclass
class PrecipCube:
    """Cached precipitation data cube"""
    data: xr.DataArray  # Precipitation array [lat, lon] in mm
    t_ref: datetime
    hours: int
    cached_at: float  # Unix timestamp
    source: str  # "IMERG-Late" or "IMERG-Early"

    def is_expired(self) -> bool:
        """Check if cache entry is expired"""
        return (time.time() - self.cached_at) > CACHE_TTL_SECONDS


# Global cache: {(date_key, hours): PrecipCube}
PRECIP_CACHE: Dict[Tuple[str, int], PrecipCube] = {}


def get_cache_key(t_ref: datetime, hours: int) -> Tuple[str, int]:
    """
    Generate cache key from reference time and accumulation window

    Args:
        t_ref: Reference timestamp (end of accumulation window)
        hours: Accumulation window (24 or 72)

    Returns:
        Tuple (date_string, hours) for use as cache key
    """
    date_key = t_ref.strftime('%Y-%m-%d')
    return (date_key, hours)


def get_cached_cube(t_ref: datetime, hours: int) -> Optional[PrecipCube]:
    """
    Retrieve cached precipitation cube if available and not expired

    Args:
        t_ref: Reference timestamp
        hours: Accumulation window

    Returns:
        PrecipCube if cached and valid, None otherwise
    """
    key = get_cache_key(t_ref, hours)

    if key not in PRECIP_CACHE:
        return None

    cube = PRECIP_CACHE[key]

    if cube.is_expired():
        # Remove expired entry
        del PRECIP_CACHE[key]
        return None

    return cube


def set_cached_cube(
    t_ref: datetime,
    hours: int,
    data: xr.DataArray,
    source: str
) -> None:
    """
    Store precipitation cube in cache

    Args:
        t_ref: Reference timestamp
        hours: Accumulation window
        data: Precipitation DataArray
        source: Data source identifier
    """
    key = get_cache_key(t_ref, hours)

    # Evict oldest entry if cache is full
    if len(PRECIP_CACHE) >= CACHE_MAX_SIZE:
        oldest_key = min(PRECIP_CACHE.keys(), key=lambda k: PRECIP_CACHE[k].cached_at)
        del PRECIP_CACHE[oldest_key]

    cube = PrecipCube(
        data=data,
        t_ref=t_ref,
        hours=hours,
        cached_at=time.time(),
        source=source
    )

    PRECIP_CACHE[key] = cube


def clear_cache() -> None:
    """Clear all cached precipitation data"""
    PRECIP_CACHE.clear()


def get_cache_stats() -> dict:
    """
    Get cache statistics

    Returns:
        Dict with cache size, expired entries count
    """
    total = len(PRECIP_CACHE)
    expired = sum(1 for cube in PRECIP_CACHE.values() if cube.is_expired())

    return {
        "total_entries": total,
        "expired_entries": expired,
        "valid_entries": total - expired,
        "max_size": CACHE_MAX_SIZE,
        "ttl_seconds": CACHE_TTL_SECONDS
    }
