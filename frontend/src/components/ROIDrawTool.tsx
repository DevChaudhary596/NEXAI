"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { ROI, BBox } from "@/types";

// Import leaflet-draw CSS (we'll handle this in layout)
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

// Prevent Leaflet.draw strict-mode "Uncaught ReferenceError: type is not defined" in readableArea
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).type = undefined;
}

interface ROIDrawToolProps {
  map: L.Map | null;
  roi: ROI | null;
  onROIChange: (roi: ROI | null) => void;
}

export default function ROIDrawTool({ map, roi, onROIChange }: ROIDrawToolProps) {
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create a feature group to hold drawn items
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Add draw control with only rectangle
    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        rectangle: {
          showArea: false,
          shapeOptions: {
            color: "#f59e0b",
            weight: 2,
            fillOpacity: 0.08,
            dashArray: "6, 4",
            className: "roi-rectangle",
          },
        },
        polygon: false,
        polyline: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
        edit: true,
      } as unknown as L.Control.DrawConstructorOptions["edit"],
    });

    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    // Handle draw created event
    const onDrawCreated = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created;
      // Clear previous ROI
      drawnItems.clearLayers();
      // Add new rectangle
      drawnItems.addLayer(event.layer);

      // Extract bounds
      const bounds = (event.layer as L.Rectangle).getBounds();
      const bbox: BBox = {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };

      onROIChange({
        type: "bbox",
        bbox,
        crs: "EPSG:4326",
      });
    };

    // Handle draw deleted event
    const onDrawDeleted = () => {
      onROIChange(null);
    };

    // Handle draw edited event
    const onDrawEdited = (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Edited;
      const layers = event.layers;
      layers.eachLayer((layer) => {
        const bounds = (layer as L.Rectangle).getBounds();
        const bbox: BBox = {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        };
        onROIChange({
          type: "bbox",
          bbox,
          crs: "EPSG:4326",
        });
      });
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);
    map.on(L.Draw.Event.DELETED, onDrawDeleted);
    map.on(L.Draw.Event.EDITED, onDrawEdited);

    return () => {
      map.off(L.Draw.Event.CREATED, onDrawCreated);
      map.off(L.Draw.Event.DELETED, onDrawDeleted);
      map.off(L.Draw.Event.EDITED, onDrawEdited);
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
      }
      if (drawnItemsRef.current) {
        map.removeLayer(drawnItemsRef.current);
      }
    };
  }, [map, onROIChange]);

  // Synchronize drawn items when roi changes
  useEffect(() => {
    if (!drawnItemsRef.current || !map) return;
    if (!roi) {
      drawnItemsRef.current.clearLayers();
    } else if (roi.bbox && drawnItemsRef.current.getLayers().length === 0) {
      const b = roi.bbox;
      const bounds = L.latLngBounds([b.south, b.west], [b.north, b.east]);
      const rect = L.rectangle(bounds, {
        color: "#f59e0b",
        weight: 2,
        fillOpacity: 0.08,
        dashArray: "6, 4",
        className: "roi-rectangle",
      });
      drawnItemsRef.current.addLayer(rect);
    }
  }, [roi, map]);

  return null; // This component only has side effects on the map
}
