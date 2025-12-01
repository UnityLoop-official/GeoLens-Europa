
import sys
import os
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)

# Ensure we can import from src
sys.path.append(os.getcwd())

try:
    from src.imerg_client import load_imerg_cube
    from src.config import EARTHDATA_USERNAME
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

def test_internal():
    print("Testing NASA Logic Internally...")
    print(f"Username present: {bool(EARTHDATA_USERNAME)}")

    try:
        # Try to load data from 2 days ago to avoid latency issues
        t_ref = datetime.utcnow() - timedelta(days=2)
        print(f"Loading data for {t_ref}...")
        
        # Use early run as it's more likely to be available for recent times
        data, source = load_imerg_cube(t_ref, 24, use_early=True)
        
        print(f"SUCCESS: Loaded data from {source}")
        print(f"Shape: {data.shape}")
        print(f"Min: {data.min().values}, Max: {data.max().values}")
        
        # Check for non-zero values
        non_zero = (data > 0).sum().values
        print(f"Non-zero cells: {non_zero}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_internal()
