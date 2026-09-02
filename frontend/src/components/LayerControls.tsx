"use client";

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
  { label: string; icon: string; dotClass: string }
> = {
  detection: {
    label: "Detections",
    icon: "🔍",
    dotClass: "layer-group__dot--detection",
  },
  segmentation: {
    label: "Segmentation",
    icon: "🗺️",
    dotClass: "layer-group__dot--segmentation",
  },
  spectral: {
    label: "Spectral",
    icon: "📊",
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
    <div className="layer-controls">
      <div className="layer-controls__header">
        <span className="layer-controls__title">Layers</span>
        <span className="layer-controls__count">{totalCount} features</span>
      </div>

      {activeSources.map((source) => {
        const meta = LAYER_META[source];
        return (
          <div key={source} className="layer-group">
            <div className="layer-group__header">
              <span className="layer-group__label">
                <span
                  className={`layer-group__dot ${meta.dotClass}`}
                />
                {meta.icon} {meta.label} ({counts[source]})
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
            {visibility[source] && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
