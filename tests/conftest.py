"""
PyTest global configuration and warning filters for SatQuery AI.
Suppresses benign upstream warnings from Starlette TestClient and Rasterio unreferenced synthetic rasters.
"""

import warnings
import pytest

# Filter benign third-party warnings
warnings.filterwarnings("ignore", message=".*Using `httpx` with `starlette.testclient` is deprecated.*")
try:
    from rasterio.errors import NotGeoreferencedWarning
    warnings.filterwarnings("ignore", category=NotGeoreferencedWarning)
except ImportError:
    pass
