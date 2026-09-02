"""
Orchestrator integration module for invoking CVService across aerial scenes.
"""

from typing import Optional
from app.models.geojson import BBox, FeatureCollection
from app.services.cv_impl import CVService


class Orchestrator:
    """
    Backend orchestrator that consumes CVService to process aerial imagery.
    """
    def __init__(self, cv_service: Optional[CVService] = None):
        self.cv_service = cv_service or CVService()

    def process_detection_task(
        self,
        scene_path: str,
        target: str,
        bbox: Optional[BBox] = None,
        confidence: float = 0.5
    ) -> FeatureCollection:
        """
        Invoke CVService.detect with strict parameter order and types.
        """
        return self.cv_service.detect(
            scene_path=scene_path,
            target=target,
            bbox=bbox,
            confidence=confidence
        )

    def process_segmentation_task(
        self,
        scene_path: str,
        target: str,
        bbox: Optional[BBox] = None
    ) -> FeatureCollection:
        """
        Invoke CVService.segment with strict parameter order and types.
        """
        return self.cv_service.segment(
            scene_path=scene_path,
            target=target,
            bbox=bbox
        )
