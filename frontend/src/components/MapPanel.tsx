"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ROIDrawTool from "./ROIDrawTool";
import GeoJSONLayer from "./GeoJSONLayer";
import LayerControls from "./LayerControls";
import RasterOverlayComponent from "./RasterOverlay";
import SwipeTool from "./SwipeTool";
import MapSearch from "./MapSearch";
import SatelliteMetaPill from "./SatelliteMetaPill";
import type {
  ROI,
  FeatureCollection,
  FeatureSource,
  RasterOverlay,
  UploadResponse,
} from "@/types";
import { getTileUrl } from "@/lib/api";

interface MapPanelProps {
  sceneId: string | null;
  sceneBounds: number[] | null;
  scene: UploadResponse | null;
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
  scene,
  roi,
  onROIChange,
  geojson,
  overlays,
}: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // Internal-only guard against double-init; never read during render (see `map` state below).
  const mapInitGuardRef = useRef<L.Map | null>(null);
  const sceneTileLayerRef = useRef<L.TileLayer | null>(null);
  const sceneFrameRef = useRef<L.Rectangle | null>(null);
  const baseLayersRef = useRef<L.TileLayer[]>([]);
  // The Leaflet instance itself is render-relevant (passed to children), so it
  // lives in state rather than a ref — reading `ref.current` during render can
  // return stale data since ref writes don't schedule a re-render.
  const [map, setMap] = useState<L.Map | null>(null);

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
    if (!mapContainerRef.current || mapInitGuardRef.current) return;

    fixLeafletIcons();

    const leafletMap = L.map(mapContainerRef.current, {
      center: [20, 78], // India center
      zoom: 5,
      zoomControl: true,
      attributionControl: true,
    });

    // ESRI World Imagery satellite basemap (free, no API key)
    const worldImagery = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution:
          "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      }
    ).addTo(leafletMap);

    // Add labels layer on top of satellite
    const worldLabels = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        pane: "overlayPane",
      }
    ).addTo(leafletMap);

    baseLayersRef.current = [worldImagery, worldLabels];
    mapInitGuardRef.current = leafletMap;
    setMap(leafletMap);

    // Leaflet caches the container's pixel size at init time. Flex layout,
    // sidebar transitions, and dev-mode Fast Refresh can all change that size
    // afterwards without firing a window "resize" event, which leaves tiles
    // laid out against a stale size (they render squished/tiled). Keep the
    // map's internal size in sync with the container's real size.
    const container = mapContainerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      leafletMap.invalidateSize();
    });
    resizeObserver.observe(container);

    // Also correct for any mismatch from layout that settles just after init.
    const raf = requestAnimationFrame(() => leafletMap.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      leafletMap.remove();
      mapInitGuardRef.current = null;
      setMap(null);
    };
  }, []);

  // Add scene tile layer when scene changes
  useEffect(() => {
    if (!map) return;

    // Remove previous scene tile layer + frame
    if (sceneTileLayerRef.current) {
      map.removeLayer(sceneTileLayerRef.current);
      sceneTileLayerRef.current = null;
    }
    if (sceneFrameRef.current) {
      map.removeLayer(sceneFrameRef.current);
      sceneFrameRef.current = null;
    }

    if (!sceneId) {
      // No scene loaded: show the real-world basemap at full strength.
      baseLayersRef.current.forEach((layer) => layer.setOpacity(1));
      return;
    }

    // A scene is loaded: dim the surrounding basemap slightly so the scene
    // reads as the highlighted subject, but keep it clearly legible and
    // explorable — panning/zooming out should still show real roads,
    // labels, and imagery around the scene, not a blackout. The glowing
    // frame below (not darkness) is what marks the scene as "yours".
    baseLayersRef.current.forEach((layer) => layer.setOpacity(0.55));

    // Scene bounds, if available, both constrain the tile layer to its real
    // footprint (Leaflet tile layers otherwise tile infinitely across the
    // whole viewport with no notion of "outside the scene") and frame it
    // with a glowing outline so the extent reads as an intentional
    // "viewport" rather than an arbitrary rectangle floating on the map.
    const latLngBounds: L.LatLngBoundsExpression | undefined =
      sceneBounds && sceneBounds.length === 4
        ? (() => {
            const [west, south, east, north] = sceneBounds;
            return [
              [south, west],
              [north, east],
            ] as L.LatLngBoundsExpression;
          })()
        : undefined;

    // Add the backend tile layer for this scene
    const sceneTileLayer = L.tileLayer(getTileUrl(sceneId), {
      maxZoom: 20,
      tileSize: 256,
      zIndex: 300,
      opacity: 1,
      bounds: latLngBounds,
    });

    sceneTileLayer.addTo(map);
    sceneTileLayerRef.current = sceneTileLayer;

    if (latLngBounds) {
      const sceneFrame = L.rectangle(latLngBounds, {
        pane: "overlayPane",
        color: "#22d3ee",
        weight: 2,
        fill: false,
        interactive: false,
        className: "scene-frame",
      });
      sceneFrame.addTo(map);
      sceneFrameRef.current = sceneFrame;

      // Generous padding so the initial view shows real surrounding area
      // to explore, not just a tight crop of the scene itself.
      map.flyToBounds(latLngBounds, { padding: [140, 140], maxZoom: 15 });
    }
  }, [map, sceneId, sceneBounds]);

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

  return (
    <div className="map-panel">
      <div ref={mapContainerRef} className="map-panel__container" />

      {/* Place search — Google-Earth-style, shared with the 3D view */}
      {map && <MapSearch map={map} />}

      {/* Satellite provenance — only present for a live Sentinel-2 fetch */}
      <SatelliteMetaPill scene={scene} />

      {/* ROI Drawing Tool */}
      {map && (
        <ROIDrawTool map={map} roi={roi} onROIChange={handleROIChange} />
      )}

      {/* GeoJSON Vector Layers */}
      {map && (
        <GeoJSONLayer
          map={map}
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
      {map && <RasterOverlayComponent map={map} overlays={overlays} />}

      {/* Swipe Comparison Tool */}
      {map && <SwipeTool map={map} overlays={overlays} />}
    </div>
  );
}
