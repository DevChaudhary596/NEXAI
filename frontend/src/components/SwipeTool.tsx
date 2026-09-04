"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeftRight, GripVertical } from "lucide-react";
import type { RasterOverlay } from "@/types";

interface SwipeToolProps {
  map: L.Map | null;
  overlays: RasterOverlay[];
}

/**
 * Split-screen swipe comparison tool.
 *
 * The base satellite/scene imagery is already the map's own tile layers;
 * this overlays the first raster result on top and clip-paths it to the
 * right of a draggable divider, so the left side reads as "base" and the
 * right as "base + overlay" — no separate base layer needed.
 *
 * Note: This is a pure Leaflet implementation rather than the
 * leaflet-side-by-side plugin for better control and fewer deps.
 */
export default function SwipeTool({ map, overlays }: SwipeToolProps) {
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState(0.5); // 0..1
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayLayerRef = useRef<L.ImageOverlay | null>(null);
  const isDragging = useRef(false);

  const firstOverlay = overlays.length > 0 ? overlays[0] : null;

  useEffect(() => {
    if (!map || !active || !firstOverlay) return;

    // Add the overlay image
    const [west, south, east, north] = firstOverlay.bounds;
    const bounds: L.LatLngBoundsLiteral = [
      [south, west],
      [north, east],
    ];

    const overlayLayer = L.imageOverlay(firstOverlay.url, bounds, {
      opacity: firstOverlay.opacity,
      zIndex: 500,
    });

    overlayLayer.addTo(map);
    overlayLayerRef.current = overlayLayer;

    return () => {
      if (overlayLayerRef.current) {
        map.removeLayer(overlayLayerRef.current);
        overlayLayerRef.current = null;
      }
    };
  }, [map, active, firstOverlay]);

  // Apply clipping to simulate swipe
  useEffect(() => {
    if (!map || !active || !overlayLayerRef.current) return;

    const mapContainer = map.getContainer();
    const containerWidth = mapContainer.clientWidth;
    const clipX = containerWidth * position;

    const el = overlayLayerRef.current.getElement();
    if (el) {
      el.style.clipPath = `inset(0 0 0 ${clipX}px)`;
    }
  }, [map, active, position]);

  // Handle map resize
  useEffect(() => {
    if (!map || !active) return;

    const onResize = () => {
      if (!overlayLayerRef.current) return;
      const el = overlayLayerRef.current.getElement();
      if (!el) return;
      const containerWidth = map.getContainer().clientWidth;
      const clipX = containerWidth * position;
      el.style.clipPath = `inset(0 0 0 ${clipX}px)`;
    };

    map.on("resize", onResize);
    map.on("move", onResize);
    map.on("zoom", onResize);

    return () => {
      map.off("resize", onResize);
      map.off("move", onResize);
      map.off("zoom", onResize);
    };
  }, [map, active, position]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !map) return;
    const mapContainer = map.getContainer();
    const rect = mapContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0.05, Math.min(0.95, x / rect.width));
    setPosition(ratio);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  // Can only swipe if we have overlays
  if (!firstOverlay) return null;

  return (
    <>
      {/* Toggle button */}
      <motion.button
        className={`swipe-toggle pixel-notch ${active ? "swipe-toggle--active" : ""}`}
        onClick={() => setActive(!active)}
        whileTap={{ scale: 0.96 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <span className="swipe-toggle__icon">
          <ArrowLeftRight size={14} />
        </span>
        {active ? "Exit Swipe" : "Compare Swipe"}
      </motion.button>

      <AnimatePresence>
        {active && (
          <>
            {/* Swipe divider */}
            <motion.div
              ref={containerRef}
              className="swipe-divider"
              style={{ left: `${position * 100}%` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={handleMouseDown}
            >
              <div className="swipe-divider__handle">
                <GripVertical size={14} />
              </div>
            </motion.div>

            {/* Labels */}
            <motion.div
              className="swipe-label swipe-label--left"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              Base Imagery
            </motion.div>
            <motion.div
              className="swipe-label swipe-label--right"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              Overlay
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
