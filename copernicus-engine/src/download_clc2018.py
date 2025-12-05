#!/usr/bin/env python3
"""
Download CLC2018 from Copernicus Land Monitoring Service

Simple script to download CORINE Land Cover 2018 dataset using
the configured JWT authentication.

Usage:
    python -m src.download_clc2018 [--output PATH]

Environment Variables (configured in .env):
    COPERNICUS_CLIENT_ID
    COPERNICUS_PRIVATE_KEY
    COPERNICUS_TOKEN_URI
"""

import argparse
import logging
import sys
from pathlib import Path

from .land_copernicus_client import CLMSClient, CLMSConfig


def setup_logging(verbose: bool = False):
    """Configure logging"""
    level = logging.DEBUG if verbose else logging.INFO

    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(
        description="Download CORINE Land Cover 2018 from Copernicus Land Monitoring Service",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download to default location
  python -m src.download_clc2018

  # Download to custom location
  python -m src.download_clc2018 --output data/raw/clc/CLC2018_100m.tif

  # Verbose logging
  python -m src.download_clc2018 -v

Environment Setup:
  Ensure copernicus-engine/.env is configured with:
  - COPERNICUS_CLIENT_ID
  - COPERNICUS_PRIVATE_KEY (RSA PEM format)
  - COPERNICUS_TOKEN_URI

Note:
  This downloads the FULL European CLC2018 dataset (~2GB).
  Download time depends on your internet connection speed.
        """
    )

    parser.add_argument(
        "--output",
        type=str,
        metavar="PATH",
        default="data/raw/clc/CLC2018_100m.tif",
        help="Output file path (default: data/raw/clc/CLC2018_100m.tif)"
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging (DEBUG level)"
    )

    args = parser.parse_args()

    # Setup logging
    setup_logging(verbose=args.verbose)

    print("=" * 70)
    print("CORINE Land Cover 2018 Download")
    print("Copernicus Land Monitoring Service")
    print("=" * 70)
    print(f"Output: {args.output}")
    print("=" * 70)
    print()

    try:
        # Load configuration from environment
        print("[1/4] Loading configuration from .env...")
        config = CLMSConfig.from_env()
        print("[OK] Configuration loaded")
        print()

        # Initialize client
        print("[2/4] Initializing CLMS API client...")
        client = CLMSClient(config)
        print("[OK] Client initialized")
        print()

        # Download CLC2018
        print("[3/4] Searching and downloading CLC2018 via CLMS API...")
        print("[WARN] This may download multiple files (~2GB total)")
        print()

        out_dir = Path(args.output).parent
        downloaded_paths = client.download_clc2018(output_dir=out_dir)

        print()
        print("=" * 70)
        print("[SUCCESS] Download Complete!")
        print("=" * 70)
        print(f"Files downloaded: {len(downloaded_paths)}")
        total_size = sum(p.stat().st_size for p in downloaded_paths) / 1024 / 1024
        print(f"Total size: {total_size:.2f} MB")
        print()
        print("Downloaded files:")
        for path in downloaded_paths:
            print(f"  - {path.name} ({path.stat().st_size / 1024 / 1024:.2f} MB)")
        print("=" * 70)
        print()
        print("Next Steps:")
        print("1. Verify files exist and are not corrupted")
        print("2. Restart the GeoLens backend to detect the new datasets")
        print("3. Test frontend to see land cover data in risk calculations")
        print()

    except ValueError as e:
        print(f"\n[ERROR] Configuration Error: {e}", file=sys.stderr)
        print("\nPlease check your copernicus-engine/.env file", file=sys.stderr)
        sys.exit(1)

    except RuntimeError as e:
        print(f"\n[ERROR] Download Failed: {e}", file=sys.stderr)
        sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n[WARN] Download interrupted by user", file=sys.stderr)
        sys.exit(130)

    except Exception as e:
        print(f"\n[ERROR] Unexpected Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
