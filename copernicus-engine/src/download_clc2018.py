#!/usr/bin/env python3
"""
Extract CLC2018 from manually downloaded ZIP file

This script extracts CORINE Land Cover 2018 GeoTIFF from the pre-packaged
ZIP file downloaded manually from Copernicus Land Monitoring Service.

Usage:
    python -m src.download_clc2018 [--zip PATH] [--outdir PATH]

Manual Download Required:
    1. Visit: https://land.copernicus.eu/en/products/corine-land-cover/clc2018
    2. Download: u2018_clc2018_v2020_20u1_raster100m.zip (~125 MB)
    3. Place in: data/raw/clc/
    4. Run this script to extract the GeoTIFF
"""

import argparse
import logging
import sys
import zipfile
import shutil
from pathlib import Path


def setup_logging(verbose: bool = False):
    """Configure logging"""
    level = logging.DEBUG if verbose else logging.INFO

    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def extract_clc2018_zip(zip_path: Path, output_dir: Path) -> Path:
    """
    Extract CLC2018 GeoTIFF from manually downloaded ZIP file

    Args:
        zip_path: Path to the manually downloaded CLC2018 ZIP file
        output_dir: Directory where the GeoTIFF will be extracted

    Returns:
        Path to the extracted GeoTIFF file

    Raises:
        FileNotFoundError: If ZIP file doesn't exist
        RuntimeError: If ZIP contains no .tif files or multiple .tif files
    """
    logger = logging.getLogger(__name__)

    # Check ZIP exists
    if not zip_path.exists():
        raise FileNotFoundError(
            f"CLC2018 ZIP not found: {zip_path}\n\n"
            "Please download it manually:\n"
            "1. Visit: https://land.copernicus.eu/en/products/corine-land-cover/clc2018\n"
            "2. Download: u2018_clc2018_v2020_20u1_raster100m.zip (~125 MB)\n"
            f"3. Place it at: {zip_path}"
        )

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Extracting CLC2018 from: {zip_path}")
    logger.info(f"Output directory: {output_dir}")

    # Open ZIP and find GeoTIFF files
    with zipfile.ZipFile(zip_path, "r") as z:
        # List all .tif files in ZIP
        tif_files = [name for name in z.namelist() if name.lower().endswith(".tif")]

        if not tif_files:
            raise RuntimeError(
                f"No .tif files found in CLC2018 ZIP: {zip_path}\n"
                "The ZIP file may be corrupted or incorrect. Please re-download it."
            )

        if len(tif_files) > 1:
            # Multiple TIFFs - extract all and inform user
            logger.warning(f"Found {len(tif_files)} GeoTIFF files in ZIP:")
            for name in tif_files:
                logger.warning(f"  - {name}")
                z.extract(name, output_dir)

            raise RuntimeError(
                f"Found multiple GeoTIFF files in CLC2018 ZIP: {tif_files}\n\n"
                "They have been extracted to the output directory.\n"
                "Please inspect them and update the ETL configuration to specify which file to use."
            )

        # Ideal case: single GeoTIFF
        tif_name = tif_files[0]
        logger.info(f"Extracting: {tif_name}")

        # Extract to temporary location
        tmp_path = output_dir / tif_name

        # Remove existing file if present
        if tmp_path.exists():
            logger.warning(f"Removing existing file: {tmp_path}")
            tmp_path.unlink()

        z.extract(tif_name, output_dir)

        # Rename to standard name if needed
        final_path = output_dir / "CLC2018_100m.tif"

        if tmp_path != final_path:
            if final_path.exists():
                logger.warning(f"Removing existing file: {final_path}")
                final_path.unlink()

            logger.info(f"Renaming to: {final_path.name}")
            shutil.move(str(tmp_path), str(final_path))
        else:
            final_path = tmp_path

        file_size_mb = final_path.stat().st_size / 1024 / 1024
        logger.info(f"Extraction complete: {final_path} ({file_size_mb:.1f} MB)")

        return final_path


def main():
    """Main entry point"""

    parser = argparse.ArgumentParser(
        description="Extract CORINE Land Cover 2018 from manually downloaded ZIP file",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract using default paths
  python -m src.download_clc2018

  # Specify custom ZIP location
  python -m src.download_clc2018 --zip /path/to/u2018_clc2018_v2020_20u1_raster100m.zip

  # Specify custom output directory
  python -m src.download_clc2018 --outdir ../data/processed/clc

  # Verbose logging
  python -m src.download_clc2018 -v

Manual Download Required:
  1. Visit: https://land.copernicus.eu/en/products/corine-land-cover/clc2018
  2. Download: u2018_clc2018_v2020_20u1_raster100m.zip (~125 MB)
  3. Place in: data/raw/clc/
  4. Run this script to extract the GeoTIFF

Note:
  This script extracts the pre-packaged CLC2018 GeoTIFF from the manually
  downloaded ZIP file. The programmatic CLMS Download API is not used due to
  limitations with pre-packaged static datasets.
        """
    )

    parser.add_argument(
        "--zip",
        type=str,
        metavar="PATH",
        default="../data/raw/clc/u2018_clc2018_v2020_20u1_raster100m.zip",
        help="Path to manually downloaded CLC2018 ZIP file (default: ../data/raw/clc/u2018_clc2018_v2020_20u1_raster100m.zip)"
    )

    parser.add_argument(
        "--outdir",
        type=str,
        metavar="PATH",
        default="../data/raw/clc",
        help="Directory where CLC2018 GeoTIFF will be extracted (default: ../data/raw/clc)"
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
    print("CORINE Land Cover 2018 Extraction")
    print("Copernicus Land Monitoring Service")
    print("=" * 70)
    print(f"ZIP file: {args.zip}")
    print(f"Output directory: {args.outdir}")
    print("=" * 70)
    print()

    try:
        # Extract CLC2018 from ZIP
        zip_path = Path(args.zip)
        output_dir = Path(args.outdir)

        print("[1/2] Extracting CLC2018 GeoTIFF from ZIP...")
        extracted_path = extract_clc2018_zip(zip_path, output_dir)

        print()
        print("=" * 70)
        print("[SUCCESS] Extraction Complete!")
        print("=" * 70)
        print(f"GeoTIFF extracted to: {extracted_path}")
        print(f"File size: {extracted_path.stat().st_size / 1024 / 1024:.1f} MB")
        print("=" * 70)
        print()
        print("Next Steps:")
        print("1. Verify the GeoTIFF can be opened with GDAL/rasterio")
        print("2. Update GeoLens backend configuration to use this file")
        print("3. Test land cover data in risk calculations")
        print()

    except FileNotFoundError as e:
        print(f"\n[ERROR] File Not Found: {e}", file=sys.stderr)
        print("\nPlease download the CLC2018 ZIP file manually first.", file=sys.stderr)
        sys.exit(1)

    except RuntimeError as e:
        print(f"\n[ERROR] Extraction Failed: {e}", file=sys.stderr)
        sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n[WARN] Extraction interrupted by user", file=sys.stderr)
        sys.exit(130)

    except Exception as e:
        print(f"\n[ERROR] Unexpected Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
