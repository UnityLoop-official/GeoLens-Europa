#!/usr/bin/env python3
"""
Test script to inspect @get-download-file-urls API response
"""

import json
import logging
from pathlib import Path

from src.land_copernicus_client import CLMSClient, CLMSConfig

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def main():
    print("=" * 70)
    print("CLMS Get Download URLs Test")
    print("=" * 70)
    print()

    # Load config
    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    # CLC2018 parameters
    dataset_uid = "0407d497d3c44bcd93ce8fd5bf78596a"
    download_information_id = "7bcdf9d1-6ba0-4d4e-afa8-01451c7316cb"

    print(f"Dataset UID: {dataset_uid}")
    print(f"Download Information ID: {download_information_id}")
    print()

    # Test get_download_urls
    print("Calling get_download_urls...")
    try:
        result = client.get_download_urls(
            dataset_uid=dataset_uid,
            download_information_id=download_information_id
        )

        print(f"\nResult type: {type(result)}")
        print(f"Result content:")
        print(json.dumps(result, indent=2))

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
