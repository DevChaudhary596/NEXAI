"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { RasterOverlay } from "@/types";

interface SwipeToolProps {
  map: L.Map | null;
  baseTileUrl: string | null;
  overlays: RasterOverlay[];
}

/**
 * Split-screen swipe comparison tool.
 *
 * Uses two panes — the base satellite imagery on the left and the first
 * raster overlay on the right — with a draggable divider.
 *
 * Note: This is a pure Leaflet implementation rather than the
 * leaflet-side-by-side plugin for better control and fewer deps.
 */
export default function SwipeTool({ map, baseTileUrl, overlays }: SwipeToolProps) {
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
      <button
        className={`swipe-toggle ${active ? "swipe-toggle--active" : ""}`}
        onClick={() => setActive(!active)}
      >
        <span className="swipe-toggle__icon">⇔</span>
        {active ? "Exit Swipe" : "Compare Swipe"}
      </button>

      {/* Swipe divider */}
      {active && (
        <div
          ref={containerRef}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${position * 100}%`,
            width: "4px",
            background: "white",
            cursor: "ew-resize",
            zIndex: 1001,
            boxShadow: "0 0 8px rgba(0,0,0,0.5)",
            transform: "translateX(-50%)",
          }}
          onMouseDown={handleMouseDown}
        >
          {/* Drag handle */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "24px",
              height: "40px",
              background: "white",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              fontSize: "10px",
              color: "#333",
            }}
          >
            ⋮⋮
          </div>
        </div>
      )}

      {/* Labels */}
      {active && (
        <>
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              zIndex: 1000,
              padding: "4px 12px",
              background: "rgba(10, 14, 26, 0.8)",
              backdropFilter: "blur(8px)",
              borderRadius: "6px",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "#f1f5f9",
              border: "1px solid rgba(148, 163, 184, 0.2)",
            }}
          >
            Base Imagery
          </div>
          <div
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              zIndex: 1000,
              padding: "4px 12px",
              background: "rgba(10, 14, 26, 0.8)",
              backdropFilter: "blur(8px)",
              borderRadius: "6px",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "#f1f5f9",
              border: "1px solid rgba(148, 163, 184, 0.2)",
            }}
          >
            Overlay
          </div>
        </>
      )}
    </>
  );
}
