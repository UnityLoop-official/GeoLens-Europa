
import sys
import os
import logging
from datetime import datetime

# Add nasa-precip-engine/src to path
sys.path.append(os.path.join(os.getcwd(), 'nasa-precip-engine', 'src'))

# Configure logging
logging.basicConfig(level=logging.INFO)

try:
    from imerg_client import load_imerg_cube
    from config import EARTHDATA_USERNAME, EARTHDATA_PASSWORD
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

def test_internal():
    print("Testing NASA Logic Internally...")
    print(f"Username present: {bool(EARTHDATA_USERNAME)}")
    print(f"Password present: {bool(EARTHDATA_PASSWORD)}")

    try:
        # Try to load 24h data for now
        t_ref = datetime.utcnow()
        print(f"Loading data for {t_ref}...")
        
        data, source = load_imerg_cube(t_ref, 24, use_early=True)
        
        print(f"SUCCESS: Loaded data from {source}")
        print(f"Shape: {data.shape}")
        print(f"Min: {data.min().values}, Max: {data.max().values}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_internal()
