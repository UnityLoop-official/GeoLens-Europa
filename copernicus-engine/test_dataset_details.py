#!/usr/bin/env python3
"""
Test script to inspect full dataset details from CLMS API
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
    print("CLMS Dataset Details Test")
    print("=" * 70)
    print()

    # Load config
    config = CLMSConfig.from_env()
    client = CLMSClient(config)

    # CLC2018 dataset URL from search results
    dataset_url = "https://land.copernicus.eu/api/en/products/corine-land-cover/clc2018"

    print(f"Fetching details for: {dataset_url}")
    print()

    # Get full details
    details = client.get_dataset_details(dataset_url)

    # Save to file
    output_file = Path("clc2018_full_details.json")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(details, f, indent=2, ensure_ascii=False)

    print(f"[SAVED] Full details saved to: {output_file}")
    print()

    # Print key fields
    print("=" * 70)
    print("KEY FIELDS:")
    print("=" * 70)
    print(f"UID: {details.get('UID')}")
    print(f"Title: {details.get('title')}")
    print(f"@id: {details.get('@id')}")
    print()

    # Check download information
    download_info = details.get('dataset_download_information')
    print(f"dataset_download_information type: {type(download_info)}")
    print(f"dataset_download_information value:")
    print(json.dumps(download_info, indent=2)[:1000])
    print()

    # Check if there are DataDownload items
    data_download = details.get('items')
    if data_download:
        print(f"items field exists with {len(data_download)} entries")
        print("First item:")
        print(json.dumps(data_download[0], indent=2)[:500])
    print()

    # List all top-level keys
    print("=" * 70)
    print("ALL TOP-LEVEL KEYS:")
    print("=" * 70)
    for key in sorted(details.keys()):
        value = details[key]
        value_type = type(value).__name__
        if isinstance(value, (list, dict)):
            value_preview = f"{value_type} with {len(value)} items"
        else:
            value_str = str(value)
            value_preview = value_str[:50] + "..." if len(value_str) > 50 else value_str
        print(f"  {key}: {value_preview}")

if __name__ == "__main__":
    main()
