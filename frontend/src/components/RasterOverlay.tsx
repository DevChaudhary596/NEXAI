"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { motion } from "motion/react";
import type { RasterOverlay as RasterOverlayType } from "@/types";

interface RasterOverlayProps {
  map: L.Map | null;
  overlays: RasterOverlayType[];
}

export default function RasterOverlay({ map, overlays }: RasterOverlayProps) {
  const layersRef = useRef<L.ImageOverlay[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear existing overlays
    layersRef.current.forEach((layer) => map.removeLayer(layer));
    layersRef.current = [];

    if (!overlays || overlays.length === 0) return;

    overlays.forEach((overlay) => {
      const [west, south, east, north] = overlay.bounds;
      const bounds: L.LatLngBoundsLiteral = [
        [south, west],
        [north, east],
      ];

      const imageOverlay = L.imageOverlay(overlay.url, bounds, {
        opacity: overlay.opacity,
        interactive: false,
        zIndex: 400,
      });

      imageOverlay.addTo(map);
      layersRef.current.push(imageOverlay);
    });

    return () => {
      layersRef.current.forEach((layer) => map.removeLayer(layer));
      layersRef.current = [];
    };
  }, [map, overlays]);

  // Render legend if any overlay has legend data
  const legendOverlay = overlays.find(
    (o) => o.legend && Object.keys(o.legend).length > 0
  );

  if (!legendOverlay) return null;

  return (
    <motion.div
      className="legend-widget pixel-frame"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="legend-widget__title">Legend</div>
      {Object.entries(legendOverlay.legend).map(([value, hexColor]) => (
        <div key={value} className="legend-widget__item">
          <div
            className="legend-widget__swatch"
            style={{ backgroundColor: hexColor }}
          />
          <span>{value}</span>
        </div>
      ))}
    </motion.div>
  );
}
