"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { ROI, BBox } from "@/types";

// Import leaflet-draw CSS (we'll handle this in layout)
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

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
        remove: {},
        edit: {},
      } as L.Control.DrawConstructorOptions["edit"],
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

  // Clear drawn items when roi is externally set to null
  useEffect(() => {
    if (!roi && drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
  }, [roi]);

  return null; // This component only has side effects on the map
}
