import rasterio
from typing import Dict, Any
from pathlib import Path

def extract_metadata(file_path: str | Path) -> Dict[str, Any]:
    """
    Extracts comprehensive metadata from a GeoTIFF file.
    
    Args:
        file_path: Path to the GeoTIFF file.
        
    Returns:
        A dictionary containing structured raster metadata, suitable for JSON serialization.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Raster file not found: {path}")

    with rasterio.open(path) as dataset:
        bounds = dataset.bounds
        res = dataset.res
        
        # Determine EPSG if possible, otherwise string representation
        crs_str = dataset.crs.to_string() if dataset.crs else None
        
        metadata = {
            "file": path.name,
            "width": dataset.width,
            "height": dataset.height,
            "bands": dataset.count,
            "data_type": dataset.dtypes[0] if dataset.count > 0 else None,
            "crs": crs_str,
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top
            },
            "resolution": {
                "x": res[0],
                "y": res[1]
            },
            "transform": [
                dataset.transform.a, dataset.transform.b, dataset.transform.c,
                dataset.transform.d, dataset.transform.e, dataset.transform.f,
                dataset.transform.g, dataset.transform.h, dataset.transform.i
            ],
            "nodata": dataset.nodata,
            "band_descriptions": dataset.descriptions,
            "band_indexes": dataset.indexes,
            "spatial_dimensions": {
                "width": dataset.width,
                "height": dataset.height
            }
        }
        
    return metadata

if __name__ == "__main__":
    import argparse
    import json
    
    parser = argparse.ArgumentParser(description="Extract metadata from a GeoTIFF.")
    parser.add_argument("file_path", type=str, help="Path to the GeoTIFF image")
    
    args = parser.parse_args()
    try:
        meta = extract_metadata(args.file_path)
        print(json.dumps(meta, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
