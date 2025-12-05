#!/usr/bin/env python3
"""
Test script to inspect CLMS search API responses
"""

import json
import logging
from pathlib import Path

from src.land_copernicus_client import CLMSClient, CLMSConfig

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def main():
    print("=" * 70)
    print("CLMS Search API Test")
    print("=" * 70)
    print()

    # Load config
    print("[1/3] Loading configuration...")
    config = CLMSConfig.from_env()
    print("[OK] Configuration loaded")
    print()

    # Initialize client
    print("[2/3] Initializing CLMS client...")
    client = CLMSClient(config)
    print("[OK] Client initialized")
    print()

    # Test 1: Search for CLC/CORINE datasets
    print("[3/3] Searching for CORINE/CLC datasets...")
    print()

    queries = [
        "CORINE 2018",
        "CLC2018",
        "Corine Land Cover",
        "clc"
    ]

    for query in queries:
        print(f"\n{'='*70}")
        print(f"Query: '{query}'")
        print('='*70)

        try:
            results = client.search_datasets(
                query=query,
                metadata_fields=["UID", "title", "description", "dataset_full_format", "dataset_download_information", "@id", "review_state"]
            )

            print(f"Found {len(results)} results\n")

            for i, item in enumerate(results[:5], 1):  # Show first 5
                print(f"\n--- Result {i} ---")
                print(f"Title: {item.get('title', 'N/A')}")
                print(f"UID: {item.get('UID', 'N/A')}")
                print(f"@id: {item.get('@id', 'N/A')}")
                print(f"Review State: {item.get('review_state', 'N/A')}")
                print(f"Description: {item.get('description', 'N/A')[:100]}...")

                # Check download info
                download_info = item.get('dataset_download_information')
                if download_info:
                    print(f"Download Info Available: YES")
                    print(f"Download Info Type: {type(download_info)}")
                    if isinstance(download_info, list):
                        print(f"Download Info Count: {len(download_info)}")
                        if download_info:
                            print(f"First Download Info: {json.dumps(download_info[0], indent=2)}")
                    else:
                        print(f"Download Info: {json.dumps(download_info, indent=2)}")
                else:
                    print(f"Download Info Available: NO")

                # Check format
                format_info = item.get('dataset_full_format')
                if format_info:
                    print(f"Format: {format_info}")

                print()

            # Save full results to file for inspection
            output_file = Path(f"search_results_{query.replace(' ', '_')}.json")
            with open(output_file, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n[SAVED] Full results saved to: {output_file}")

        except Exception as e:
            print(f"[ERROR] Search failed: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 70)
    print("[COMPLETE] Search test finished")
    print("=" * 70)

if __name__ == "__main__":
    main()
