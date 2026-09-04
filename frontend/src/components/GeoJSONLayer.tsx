"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { FeatureCollection, FeatureSource } from "@/types";

interface GeoJSONLayerProps {
  map: L.Map | null;
  geojson: FeatureCollection | null;
  visibility: Record<FeatureSource, boolean>;
  opacity: Record<FeatureSource, number>;
}

/** Colour mapping per source type */
const SOURCE_COLORS: Record<FeatureSource, string> = {
  detection: "#fb923c",
  segmentation: "#34d399",
  spectral: "#60a5fa",
};

const SOURCE_FILL_COLORS: Record<FeatureSource, string> = {
  detection: "#fb923c",
  segmentation: "#34d399",
  spectral: "#60a5fa",
};

export default function GeoJSONLayer({
  map,
  geojson,
  visibility,
  opacity,
}: GeoJSONLayerProps) {
  const layersRef = useRef<Record<FeatureSource, L.GeoJSON | null>>({
    detection: null,
    segmentation: null,
    spectral: null,
  });

  useEffect(() => {
    if (!map) return;

    // Clear existing layers
    Object.values(layersRef.current).forEach((layer) => {
      if (layer) map.removeLayer(layer);
    });
    layersRef.current = { detection: null, segmentation: null, spectral: null };

    if (!geojson || geojson.features.length === 0) return;

    // Group features by source
    const grouped: Record<FeatureSource, GeoJSON.Feature[]> = {
      detection: [],
      segmentation: [],
      spectral: [],
    };

    geojson.features.forEach((f) => {
      const source = f.properties.source;
      if (grouped[source]) {
        grouped[source].push(f as unknown as GeoJSON.Feature);
      }
    });

    // Create a GeoJSON layer for each source type
    (Object.keys(grouped) as FeatureSource[]).forEach((source) => {
      if (grouped[source].length === 0) return;

      const featureCollection: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: grouped[source],
      };

      const color = SOURCE_COLORS[source];
      const fillColor = SOURCE_FILL_COLORS[source];

      const geoLayer = L.geoJSON(featureCollection, {
        style: (feature) => {
          const score = feature?.properties?.score ?? 0.5;
          const isPolygonType =
            source === "segmentation" || source === "spectral";

          return {
            color: color,
            weight: source === "detection" ? 2.5 : 2,
            opacity: opacity[source],
            fillColor: fillColor,
            fillOpacity: isPolygonType
              ? score * 0.4 * opacity[source]
              : 0.1 * opacity[source],
            dashArray: source === "detection" ? undefined : undefined,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          if (!props) return;

          const popupContent = `
            <div class="feature-popup">
              <div class="feature-popup__label">${props.label || "Unknown"}</div>
              ${
                props.score != null
                  ? `<div class="feature-popup__row">
                      <span class="feature-popup__key">Confidence</span>
                      <span class="feature-popup__value">${(props.score * 100).toFixed(1)}%</span>
                     </div>`
                  : ""
              }
              ${
                props.area_m2 != null
                  ? `<div class="feature-popup__row">
                      <span class="feature-popup__key">Area</span>
                      <span class="feature-popup__value">${props.area_m2.toLocaleString()} m²</span>
                     </div>`
                  : ""
              }
              <div class="feature-popup__row">
                <span class="feature-popup__key">Source</span>
                <span class="feature-popup__value">${props.source}</span>
              </div>
            </div>
          `;

          layer.bindPopup(popupContent, {
            className: "feature-popup-container",
            maxWidth: 250,
          });
        },
        pointToLayer: (feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: fillColor,
            color: color,
            weight: 2,
            opacity: opacity[source],
            fillOpacity: 0.6 * opacity[source],
          });
        },
      });

      if (visibility[source]) {
        geoLayer.addTo(map);
      }

      layersRef.current[source] = geoLayer;
    });

    return () => {
      Object.values(layersRef.current).forEach((layer) => {
        if (layer) map.removeLayer(layer);
      });
    };
    // Deliberately excludes opacity/visibility: rebuilding every GeoJSON layer
    // on each slider tick would flicker and defeat the point of the two
    // effects below, which patch live layers in place instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, geojson]);

  // Handle visibility changes
  useEffect(() => {
    if (!map) return;

    (Object.keys(layersRef.current) as FeatureSource[]).forEach((source) => {
      const layer = layersRef.current[source];
      if (!layer) return;

      if (visibility[source] && !map.hasLayer(layer)) {
        layer.addTo(map);
      } else if (!visibility[source] && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }, [map, visibility]);

  // Handle opacity changes
  useEffect(() => {
    (Object.keys(layersRef.current) as FeatureSource[]).forEach((source) => {
      const layer = layersRef.current[source];
      if (!layer) return;

      layer.setStyle((feature) => {
        const score = feature?.properties?.score ?? 0.5;
        const isPolygonType =
          source === "segmentation" || source === "spectral";

        return {
          opacity: opacity[source],
          fillOpacity: isPolygonType
            ? score * 0.4 * opacity[source]
            : 0.1 * opacity[source],
        };
      });
    });
  }, [opacity]);

  return null;
}
