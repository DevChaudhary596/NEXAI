import sys
import importlib

def check_environment():
    print("Checking SatQuery AI GIS Environment...")
    print(f"Python Version: {sys.version}")
    
    libraries = [
        "rasterio",
        "geopandas",
        "shapely",
        "numpy",
        "scipy",
        "pyproj",
        "PIL" # Pillow
    ]
    
    all_good = True
    for lib in libraries:
        try:
            module = importlib.import_module(lib)
            version = getattr(module, "__version__", "Unknown version")
            print(f"✅ {lib} is installed. Version: {version}")
        except ImportError as e:
            print(f"❌ ERROR: Could not import {lib}. ({e})")
            all_good = False
            
    if all_good:
        print("\nAll required GIS libraries are installed and importable. Environment is ready!")
        sys.exit(0)
    else:
        print("\nSome libraries are missing. Please check your environment setup.")
        sys.exit(1)

if __name__ == "__main__":
    check_environment()
