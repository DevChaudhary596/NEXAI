"use client";

import { motion, AnimatePresence } from "motion/react";
import { Layers, Search, MapIcon, BarChart3 } from "lucide-react";
import type { FeatureSource, FeatureCollection } from "@/types";

interface LayerControlsProps {
  geojson: FeatureCollection | null;
  visibility: Record<FeatureSource, boolean>;
  opacity: Record<FeatureSource, number>;
  onVisibilityChange: (source: FeatureSource, visible: boolean) => void;
  onOpacityChange: (source: FeatureSource, value: number) => void;
}

const LAYER_META: Record<
  FeatureSource,
  { label: string; icon: typeof Search; dotClass: string }
> = {
  detection: {
    label: "Detections",
    icon: Search,
    dotClass: "layer-group__dot--detection",
  },
  segmentation: {
    label: "Segmentation",
    icon: MapIcon,
    dotClass: "layer-group__dot--segmentation",
  },
  spectral: {
    label: "Spectral",
    icon: BarChart3,
    dotClass: "layer-group__dot--spectral",
  },
};

export default function LayerControls({
  geojson,
  visibility,
  opacity,
  onVisibilityChange,
  onOpacityChange,
}: LayerControlsProps) {
  if (!geojson || geojson.features.length === 0) return null;

  // Count features per source
  const counts: Record<FeatureSource, number> = {
    detection: 0,
    segmentation: 0,
    spectral: 0,
  };
  geojson.features.forEach((f) => {
    counts[f.properties.source]++;
  });

  const activeSources = (Object.keys(counts) as FeatureSource[]).filter(
    (s) => counts[s] > 0
  );

  if (activeSources.length === 0) return null;

  const totalCount = geojson.features.length;

  return (
    <motion.div
      className="layer-controls pixel-frame"
      initial={{ opacity: 0, x: 16, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="layer-controls__header">
        <span className="layer-controls__title">
          <Layers size={12} /> Layers
        </span>
        <span className="layer-controls__count">{totalCount} features</span>
      </div>

      {activeSources.map((source) => {
        const meta = LAYER_META[source];
        const Icon = meta.icon;
        return (
          <div key={source} className="layer-group">
            <div className="layer-group__header">
              <span className="layer-group__label">
                <span className={`layer-group__dot ${meta.dotClass}`} />
                <span className="layer-group__icon">
                  <Icon size={13} />
                </span>
                {meta.label} ({counts[source]})
              </span>
              <button
                className={`layer-group__toggle ${
                  visibility[source] ? "layer-group__toggle--active" : ""
                }`}
                onClick={() =>
                  onVisibilityChange(source, !visibility[source])
                }
                aria-label={`Toggle ${meta.label} visibility`}
              />
            </div>
            <AnimatePresence initial={false}>
              {visibility[source] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: "hidden" }}
                >
                  <input
                    type="range"
                    className="layer-group__slider"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity[source]}
                    onChange={(e) =>
                      onOpacityChange(source, parseFloat(e.target.value))
                    }
                    aria-label={`${meta.label} opacity`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </motion.div>
  );
}
