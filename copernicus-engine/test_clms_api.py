#!/usr/bin/env python3
"""
Test script for CLMS API client - clean high-level methods
"""

import json
import logging
from pathlib import Path

from src.land_copernicus_client import CLMSClient, CLMSConfig

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def test_search_datasets():
    """Test search_datasets with simplified output"""
    print("\n" + "="*70)
    print("TEST 1: search_datasets()")
    print("="*70)

    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    results = client.search_datasets(query="CLC2018")

    print(f"\nFound {len(results)} datasets")
    print("\nFirst result (simplified):")
    if results:
        print(json.dumps(results[0], indent=2))

    return results

def test_get_downloadable_files(dataset_url):
    """Test get_downloadable_files extraction"""
    print("\n" + "="*70)
    print("TEST 2: get_downloadable_files()")
    print("="*70)

    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    # Get full details first
    print(f"\nFetching dataset details from: {dataset_url}")
    details = client.get_dataset_details(dataset_url)

    # Extract downloadable files
    files = client.get_downloadable_files(details)

    print(f"\nFound {len(files)} downloadable files:")
    for i, file_info in enumerate(files, 1):
        print(f"\n{i}. {file_info['name']} - {file_info['format']}")
        print(f"   Collection: {file_info['collection']}")
        print(f"   ID: {file_info['id']}")

    return files

def test_get_download_file_urls(dataset_uid, download_info_id):
    """Test get_download_file_urls with error handling"""
    print("\n" + "="*70)
    print("TEST 3: get_download_file_urls()")
    print("="*70)

    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    print(f"\nDataset UID: {dataset_uid}")
    print(f"Download Info ID: {download_info_id}")

    try:
        urls = client.get_download_file_urls(
            dataset_uid=dataset_uid,
            download_information_id=download_info_id,
            date_from="2017-01-01",
            date_to="2018-12-31"
        )

        print(f"\nSuccess! Retrieved {len(urls)} URLs:")
        for url in urls[:3]:  # Show first 3
            print(f"  - {url}")

        return urls

    except ValueError as e:
        print(f"\nExpected ValueError (API error):")
        print(f"  {e}")
        return None
    except Exception as e:
        print(f"\nUnexpected error:")
        print(f"  {type(e).__name__}: {e}")
        return None

def test_download_clc2018():
    """Test download_clc2018 - should raise NotImplementedError"""
    print("\n" + "="*70)
    print("TEST 4: download_clc2018() - Expected NotImplementedError")
    print("="*70)

    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    try:
        client.download_clc2018(output_dir=Path("data/raw/clc"))
        print("\n[FAIL] Should have raised NotImplementedError!")
    except NotImplementedError as e:
        print("\n[PASS] NotImplementedError raised as expected")
        print("\nError message:")
        print("-" * 70)
        print(str(e))
        print("-" * 70)
    except Exception as e:
        print(f"\n[FAIL] Unexpected error: {type(e).__name__}: {e}")

def main():
    print("="*70)
    print("CLMS API Client - High-Level Methods Test")
    print("="*70)

    # Test 1: Search
    results = test_search_datasets()

    if not results:
        print("\n[ERROR] No search results - cannot continue tests")
        return

    # Find CLC2018
    clc2018 = None
    for item in results:
        if "corine land cover 2018" in item["title"].lower() and "change" not in item["title"].lower():
            clc2018 = item
            break

    if not clc2018:
        print("\n[ERROR] CLC2018 not found in results")
        return

    # Test 2: Get downloadable files
    files = test_get_downloadable_files(clc2018["url"])

    if not files:
        print("\n[ERROR] No downloadable files found")
        return

    # Find RASTER 100m
    raster_100m = None
    for f in files:
        if f["type"] == "RASTER" and f["collection"] == "100 m":
            raster_100m = f
            break

    if raster_100m:
        # Test 3: Get download URLs (will fail for CLC2018 pre-packaged)
        test_get_download_file_urls(
            clc2018["uid"],
            raster_100m["download_information_id"]
        )

    # Test 4: Download CLC2018 (should raise NotImplementedError)
    test_download_clc2018()

    print("\n" + "="*70)
    print("ALL TESTS COMPLETED")
    print("="*70)

if __name__ == "__main__":
    main()
