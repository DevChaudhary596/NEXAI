"use client";

import { motion } from "motion/react";
import { Satellite, Calendar, Cloud, Ruler } from "lucide-react";
import type { UploadResponse } from "@/types";

interface SatelliteMetaPillProps {
  scene: UploadResponse | null;
}

/**
 * Proof-of-freshness pill for a live-fetched Sentinel-2 scene. `satellite`
 * is only ever set by the fetch-satellite route (see satellite_fetch.py) -
 * a manual GeoTIFF upload has no STAC item to pull capture date/cloud cover
 * from, so the pill simply doesn't render for one.
 */
export default function SatelliteMetaPill({ scene }: SatelliteMetaPillProps) {
  if (!scene?.satellite) return null;

  return (
    <motion.div
      className="satellite-meta-pill"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <span className="satellite-meta-pill__item satellite-meta-pill__item--primary">
        <Satellite size={12} /> {scene.satellite}
      </span>
      {scene.capture_date && (
        <span className="satellite-meta-pill__item">
          <Calendar size={11} /> {scene.capture_date}
        </span>
      )}
      {scene.cloud_cover_pct != null && (
        <span className="satellite-meta-pill__item">
          <Cloud size={11} /> {scene.cloud_cover_pct.toFixed(1)}% cloud
        </span>
      )}
      {scene.resolution_m != null && (
        <span className="satellite-meta-pill__item">
          <Ruler size={11} /> {scene.resolution_m}m/px
        </span>
      )}
    </motion.div>
  );
}
