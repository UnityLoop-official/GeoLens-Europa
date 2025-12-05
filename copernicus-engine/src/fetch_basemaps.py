#!/usr/bin/env python3
"""
CLI Script: Fetch Copernicus Basemaps

Command-line tool for downloading DEM and Land Cover data from Copernicus
Data Space API.

Usage:
    # Fetch DEM for Europe
    python -m src.fetch_basemaps dem --bbox -10.0 35.0 40.0 72.0

    # Fetch Land Cover for Italy
    python -m src.fetch_basemaps landcover --bbox 8.0 44.0 13.0 47.0

    # Specify output path
    python -m src.fetch_basemaps dem --bbox 8.0 44.0 13.0 47.0 \\
        --output data/raw/copernicus/dem/italy_dem.tif

Environment Variables Required:
    COPERNICUS_API_BASE_URL - Base URL for Copernicus API
    COPERNICUS_API_TOKEN or OAuth2 credentials
    COPERNICUS_DEM_COLLECTION_ID - Collection ID for DEM
    COPERNICUS_LC_COLLECTION_ID - Collection ID for Land Cover

See README.md for detailed setup instructions.
"""

import argparse
import logging
import sys
from pathlib import Path

from .copernicus_etl import fetch_dem_for_bbox, fetch_landcover_for_bbox


def setup_logging(verbose: bool = False) -> None:
    """Configure logging"""
    level = logging.DEBUG if verbose else logging.INFO

    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def validate_bbox(args: argparse.Namespace) -> tuple[float, float, float, float]:
    """
    Validate and parse bounding box from CLI arguments

    Args:
        args: Parsed arguments with bbox attribute

    Returns:
        Validated bbox tuple (min_lon, min_lat, max_lon, max_lat)

    Raises:
        SystemExit: If bbox is invalid
    """
    bbox = tuple(args.bbox)

    if len(bbox) != 4:
        print(f"❌ Error: BBOX must have exactly 4 values, got {len(bbox)}")
        sys.exit(1)

    min_lon, min_lat, max_lon, max_lat = bbox

    # Validate ranges
    if not (-180 <= min_lon <= 180) or not (-180 <= max_lon <= 180):
        print(f"❌ Error: Longitude must be in range [-180, 180]")
        print(f"   Got: min_lon={min_lon}, max_lon={max_lon}")
        sys.exit(1)

    if not (-90 <= min_lat <= 90) or not (-90 <= max_lat <= 90):
        print(f"❌ Error: Latitude must be in range [-90, 90]")
        print(f"   Got: min_lat={min_lat}, max_lat={max_lat}")
        sys.exit(1)

    # Validate order
    if min_lon >= max_lon:
        print(f"❌ Error: min_lon ({min_lon}) must be < max_lon ({max_lon})")
        sys.exit(1)

    if min_lat >= max_lat:
        print(f"❌ Error: min_lat ({min_lat}) must be < max_lat ({max_lat})")
        sys.exit(1)

    return bbox


def cmd_dem(args: argparse.Namespace) -> None:
    """
    Handle 'dem' subcommand

    Args:
        args: Parsed CLI arguments
    """
    bbox = validate_bbox(args)

    print("=" * 60)
    print("Copernicus DEM Download")
    print("=" * 60)
    print(f"Bounding Box: {bbox}")
    if args.output:
        print(f"Output Path: {args.output}")
    print("=" * 60)

    try:
        output_path = Path(args.output) if args.output else None

        dem_path = fetch_dem_for_bbox(
            bbox=bbox,
            out_path=output_path
        )

        print("\n" + "=" * 60)
        print("✅ DEM Download Complete")
        print("=" * 60)
        print(f"File: {dem_path}")
        print(f"Size: {dem_path.stat().st_size / 1024 / 1024:.2f} MB")
        print("=" * 60)

        # TODO: COG conversion
        if args.cog:
            print("\n⚠️  --cog flag specified but COG conversion not yet implemented")
            print("TODO: Implement COG conversion or integrate with existing pipeline")

        # TODO: PMTiles generation
        if args.pmtiles:
            print("\n⚠️  --pmtiles flag specified but PMTiles generation not yet implemented")
            print("TODO: Implement PMTiles generation or integrate with existing pipeline")

    except Exception as e:
        print(f"\n❌ DEM download failed: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_landcover(args: argparse.Namespace) -> None:
    """
    Handle 'landcover' subcommand

    Args:
        args: Parsed CLI arguments
    """
    bbox = validate_bbox(args)

    print("=" * 60)
    print("Copernicus Land Cover Download")
    print("=" * 60)
    print(f"Bounding Box: {bbox}")
    if args.output:
        print(f"Output Path: {args.output}")
    if args.year:
        print(f"Preferred Year: {args.year}")
    print("=" * 60)

    try:
        output_path = Path(args.output) if args.output else None

        lc_path = fetch_landcover_for_bbox(
            bbox=bbox,
            out_path=output_path,
            year=args.year
        )

        print("\n" + "=" * 60)
        print("✅ Land Cover Download Complete")
        print("=" * 60)
        print(f"File: {lc_path}")
        print(f"Size: {lc_path.stat().st_size / 1024 / 1024:.2f} MB")
        print("=" * 60)

        # TODO: COG conversion
        if args.cog:
            print("\n⚠️  --cog flag specified but COG conversion not yet implemented")
            print("TODO: Implement COG conversion or integrate with existing pipeline")

        # TODO: PMTiles generation
        if args.pmtiles:
            print("\n⚠️  --pmtiles flag specified but PMTiles generation not yet implemented")
            print("TODO: Implement PMTiles generation or integrate with existing pipeline")

    except Exception as e:
        print(f"\n❌ Land Cover download failed: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """Main CLI entry point"""

    parser = argparse.ArgumentParser(
        description="Download DEM and Land Cover data from Copernicus Data Space",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download DEM for Europe
  python -m src.fetch_basemaps dem --bbox -10.0 35.0 40.0 72.0

  # Download Land Cover for Italy with custom output path
  python -m src.fetch_basemaps landcover --bbox 8.0 44.0 13.0 47.0 \\
      --output data/raw/italy_clc2018.tif

  # Download DEM with COG conversion (when implemented)
  python -m src.fetch_basemaps dem --bbox 8.0 44.0 13.0 47.0 --cog

Environment Variables:
  COPERNICUS_API_BASE_URL        Base URL for Copernicus API
  COPERNICUS_API_TOKEN           Static bearer token (or use OAuth2 below)
  COPERNICUS_OIDC_TOKEN_URL      OAuth2 token endpoint
  COPERNICUS_CLIENT_ID           OAuth2 client ID
  COPERNICUS_CLIENT_SECRET       OAuth2 client secret
  COPERNICUS_DEM_COLLECTION_ID   Collection ID for DEM products
  COPERNICUS_LC_COLLECTION_ID    Collection ID for Land Cover products

For detailed setup, see: README.md
        """
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging (DEBUG level)"
    )

    # Subcommands
    subparsers = parser.add_subparsers(
        dest="command",
        help="Dataset type to download",
        required=True
    )

    # ========== DEM subcommand ==========
    parser_dem = subparsers.add_parser(
        "dem",
        help="Download Digital Elevation Model (DEM)"
    )

    parser_dem.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        required=True,
        metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"),
        help="Bounding box in EPSG:4326 (WGS84) coordinates"
    )

    parser_dem.add_argument(
        "--output",
        type=str,
        metavar="PATH",
        help="Output file path (default: auto-generated in data/raw/copernicus/dem/)"
    )

    parser_dem.add_argument(
        "--cog",
        action="store_true",
        help="Convert to Cloud-Optimized GeoTIFF (COG) [TODO: not yet implemented]"
    )

    parser_dem.add_argument(
        "--pmtiles",
        action="store_true",
        help="Generate PMTiles archive [TODO: not yet implemented]"
    )

    parser_dem.set_defaults(func=cmd_dem)

    # ========== Land Cover subcommand ==========
    parser_lc = subparsers.add_parser(
        "landcover",
        help="Download Land Cover classification"
    )

    parser_lc.add_argument(
        "--bbox",
        type=float,
        nargs=4,
        required=True,
        metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"),
        help="Bounding box in EPSG:4326 (WGS84) coordinates"
    )

    parser_lc.add_argument(
        "--output",
        type=str,
        metavar="PATH",
        help="Output file path (default: auto-generated in data/raw/copernicus/landcover/)"
    )

    parser_lc.add_argument(
        "--year",
        type=int,
        metavar="YEAR",
        help="Preferred year (e.g., 2018 for CLC2018)"
    )

    parser_lc.add_argument(
        "--cog",
        action="store_true",
        help="Convert to Cloud-Optimized GeoTIFF (COG) [TODO: not yet implemented]"
    )

    parser_lc.add_argument(
        "--pmtiles",
        action="store_true",
        help="Generate PMTiles archive [TODO: not yet implemented]"
    )

    parser_lc.set_defaults(func=cmd_landcover)

    # Parse and execute
    args = parser.parse_args()

    # Setup logging
    setup_logging(verbose=args.verbose)

    # Execute subcommand
    args.func(args)


if __name__ == "__main__":
    main()
