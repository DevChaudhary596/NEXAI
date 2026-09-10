"""
GeoJSON models and BBox definition compliant with RFC 7946.
"""

from typing import Any, Dict, List, Optional, Sequence, Union
from pydantic import BaseModel, Field


class BBox:
    """
    Bounding box representation: [min_x, min_y, max_x, max_y].
    Supports pixel coordinates or geographic coordinates.
    """
    def __init__(
        self,
        min_x: Union[float, Sequence[float]],
        min_y: Optional[float] = None,
        max_x: Optional[float] = None,
        max_y: Optional[float] = None
    ):
        if isinstance(min_x, (list, tuple)):
            coords = min_x
            if len(coords) != 4:
                raise ValueError("BBox sequence must have 4 coordinates [min_x, min_y, max_x, max_y]")
            self.min_x = float(coords[0])
            self.min_y = float(coords[1])
            self.max_x = float(coords[2])
            self.max_y = float(coords[3])
        else:
            if min_y is None or max_x is None or max_y is None:
                raise ValueError("BBox requires min_x, min_y, max_x, max_y")
            self.min_x = float(min_x)
            self.min_y = float(min_y)
            self.max_x = float(max_x)
            self.max_y = float(max_y)

    @property
    def xmin(self) -> float:
        return self.min_x

    @property
    def ymin(self) -> float:
        return self.min_y

    @property
    def xmax(self) -> float:
        return self.max_x

    @property
    def ymax(self) -> float:
        return self.max_y

    @property
    def width(self) -> float:
        return max(0.0, self.max_x - self.min_x)

    @property
    def height(self) -> float:
        return max(0.0, self.max_y - self.min_y)

    def to_list(self) -> List[float]:
        return [self.min_x, self.min_y, self.max_x, self.max_y]

    def to_dict(self) -> Dict[str, float]:
        return {
            "min_x": self.min_x,
            "min_y": self.min_y,
            "max_x": self.max_x,
            "max_y": self.max_y
        }

    def __iter__(self):
        return iter([self.min_x, self.min_y, self.max_x, self.max_y])

    def __getitem__(self, index: int) -> float:
        return [self.min_x, self.min_y, self.max_x, self.max_y][index]

    def __len__(self) -> int:
        return 4

    def __repr__(self) -> str:
        return f"BBox(min_x={self.min_x}, min_y={self.min_y}, max_x={self.max_x}, max_y={self.max_y})"

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, BBox):
            return (self.min_x, self.min_y, self.max_x, self.max_y) == (other.min_x, other.min_y, other.max_x, other.max_y)
        if isinstance(other, (list, tuple)) and len(other) == 4:
            return list(self) == list(other)
        return False


class Geometry(BaseModel):
    type: str = "Polygon"
    coordinates: Any


class Feature(BaseModel):
    type: str = "Feature"
    geometry: Geometry
    properties: Dict[str, Any] = Field(default_factory=dict)
    id: Optional[Union[str, int]] = None

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)


class FeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[Feature] = Field(default_factory=list)
    bbox: Optional[List[float]] = None

    def __len__(self) -> int:
        return len(self.features)

    def __iter__(self):
        return iter(self.features)

    def __getitem__(self, item: Union[int, str]) -> Any:
        if isinstance(item, int):
            return self.features[item]
        return getattr(self, item)

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()
