"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ROIDrawTool from "./ROIDrawTool";
import GeoJSONLayer from "./GeoJSONLayer";
import LayerControls from "./LayerControls";
import RasterOverlayComponent from "./RasterOverlay";
import SwipeTool from "./SwipeTool";
import type {
  ROI,
  FeatureCollection,
  FeatureSource,
  RasterOverlay,
} from "@/types";
import { getTileUrl } from "@/lib/api";

interface MapPanelProps {
  sceneId: string | null;
  sceneBounds: number[] | null;
  roi: ROI | null;
  onROIChange: (roi: ROI | null) => void;
  geojson: FeatureCollection | null;
  overlays: RasterOverlay[];
}

// Fix leaflet default icon paths in Next.js
const fixLeafletIcons = () => {
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
};

export default function MapPanel({
  sceneId,
  sceneBounds,
  roi,
  onROIChange,
  geojson,
  overlays,
}: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const sceneTileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [visibility, setVisibility] = useState<Record<FeatureSource, boolean>>({
    detection: true,
    segmentation: true,
    spectral: true,
  });
  const [opacity, setOpacity] = useState<Record<FeatureSource, number>>({
    detection: 0.85,
    segmentation: 0.7,
    spectral: 0.65,
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    fixLeafletIcons();

    const map = L.map(mapContainerRef.current, {
      center: [20, 78], // India center
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    // ESRI World Imagery satellite basemap (free, no API key)
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }
    ).addTo(map);

    // Add labels layer on top of satellite
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        pane: "overlayPane",
      }
    ).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Add scene tile layer when scene changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove previous scene tile layer
    if (sceneTileLayerRef.current) {
      map.removeLayer(sceneTileLayerRef.current);
      sceneTileLayerRef.current = null;
    }

    if (!sceneId) return;

    // Add the backend tile layer for this scene
    const sceneTileLayer = L.tileLayer(getTileUrl(sceneId), {
      maxZoom: 20,
      tileSize: 256,
      zIndex: 300,
      opacity: 1,
    });

    sceneTileLayer.addTo(map);
    sceneTileLayerRef.current = sceneTileLayer;

    // Fly to scene bounds if available
    if (sceneBounds && sceneBounds.length === 4) {
      const [west, south, east, north] = sceneBounds;
      map.flyToBounds(
        [
          [south, west],
          [north, east],
        ],
        { padding: [30, 30], maxZoom: 16 }
      );
    }
  }, [sceneId, sceneBounds]);

  const handleROIChange = useCallback(
    (newRoi: ROI | null) => {
      onROIChange(newRoi);
    },
    [onROIChange]
  );

  const handleVisibilityChange = useCallback(
    (source: FeatureSource, visible: boolean) => {
      setVisibility((prev) => ({ ...prev, [source]: visible }));
    },
    []
  );

  const handleOpacityChange = useCallback(
    (source: FeatureSource, value: number) => {
      setOpacity((prev) => ({ ...prev, [source]: value }));
    },
    []
  );

  const baseTileUrl = sceneId ? getTileUrl(sceneId) : null;

  return (
    <div className="map-panel">
      <div ref={mapContainerRef} className="map-panel__container" />

      {/* ROI Drawing Tool */}
      {mapReady && (
        <ROIDrawTool
          map={mapRef.current}
          roi={roi}
          onROIChange={handleROIChange}
        />
      )}

      {/* GeoJSON Vector Layers */}
      {mapReady && (
        <GeoJSONLayer
          map={mapRef.current}
          geojson={geojson}
          visibility={visibility}
          opacity={opacity}
        />
      )}

      {/* Layer Controls */}
      <LayerControls
        geojson={geojson}
        visibility={visibility}
        opacity={opacity}
        onVisibilityChange={handleVisibilityChange}
        onOpacityChange={handleOpacityChange}
      />

      {/* Raster Overlays */}
      {mapReady && (
        <RasterOverlayComponent
          map={mapRef.current}
          overlays={overlays}
        />
      )}

      {/* Swipe Comparison Tool */}
      {mapReady && (
        <SwipeTool
          map={mapRef.current}
          baseTileUrl={baseTileUrl}
          overlays={overlays}
        />
      )}
    </div>
  );
}
