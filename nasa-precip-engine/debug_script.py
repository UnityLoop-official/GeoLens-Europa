
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
    print("--- NASA GPM IMERG Debug Tool ---")
    
    # 1. Test Authentication
    print("\n[1] Testing Authentication...")
    try:
        import earthaccess
        auth = earthaccess.login()
        if auth.authenticated:
            print("✅ Authentication SUCCESS")
            print(f"User: {auth.username}")
        else:
            print("❌ Authentication FAILED")
            print("Check EARTHDATA_USERNAME and EARTHDATA_PASSWORD environment variables.")
            return
    except Exception as e:
        print(f"❌ Authentication Error: {e}")
        return

    # 2. Test Data Availability (24h ago)
    print("\n[2] Testing Data Availability (24h ago)...")
    
    t_ref = datetime.utcnow() - timedelta(hours=24)
    print(f"Reference Time: {t_ref}")

    try:
        # Call the actual function to verify the fix
        data, source = load_imerg_cube(t_ref, 24, use_early=True)
        
        print(f"✅ SUCCESS: Loaded data from {source}")
        print(f"Shape: {data.shape}")
        print(f"Min: {data.min().values}, Max: {data.max().values}")
        
        # Check for non-zero values
        non_zero = (data > 0).sum().values
        print(f"Non-zero cells: {non_zero}")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_internal()
