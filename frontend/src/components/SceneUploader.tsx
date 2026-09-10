"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, AlertTriangle, X, Search, Satellite as SatelliteIcon } from "lucide-react";
import { PixelSatellite } from "./PixelIcons";
import { uploadScene, fetchSatelliteScene } from "@/lib/api";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";
import type { UploadResponse, BBox } from "@/types";

interface SceneUploaderProps {
  onUploadComplete: (response: UploadResponse) => void;
}

// Keeps auto-fetched Sentinel-2 crops a sane, consistent size regardless of
// how large the searched place's own bounding box is (a country-level
// result would otherwise ask for an enormous scene). ~0.09° is ~10km at
// mid-latitudes — roughly a 1000x1000px crop at Sentinel-2's 10m/pixel.
const MAX_AOI_DEGREES = 0.09;

function boundingBoxForResult(result: GeocodeResult): BBox {
  if (result.boundingBox) {
    const [south, north, west, east] = result.boundingBox;
    const centerLat = (south + north) / 2;
    const centerLon = (west + east) / 2;
    const halfLat = Math.min((north - south) / 2, MAX_AOI_DEGREES / 2);
    const halfLon = Math.min((east - west) / 2, MAX_AOI_DEGREES / 2);
    return {
      south: centerLat - halfLat,
      north: centerLat + halfLat,
      west: centerLon - halfLon,
      east: centerLon + halfLon,
    };
  }
  const half = MAX_AOI_DEGREES / 2;
  return {
    south: result.lat - half,
    north: result.lat + half,
    west: result.lon - half,
    east: result.lon + half,
  };
}

export default function SceneUploader({ onUploadComplete }: SceneUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressSearchRef = useRef(false);

  const finishSuccess = useCallback(
    (response: UploadResponse) => {
      setProgress(100);
      setIsDone(true);
      setTimeout(() => {
        onUploadComplete(response);
        setIsUploading(false);
        setIsDone(false);
        setProgress(0);
      }, 650);
    },
    [onUploadComplete]
  );

  const finishError = useCallback((err: unknown, fallback: string) => {
    setIsUploading(false);
    setProgress(0);
    setError(err instanceof Error ? err.message : fallback);
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().match(/\.(tif|tiff|geotiff)$/)) {
        setError("Please upload a GeoTIFF file (.tif, .tiff)");
        return;
      }

      setIsUploading(true);
      setProgress(0);
      setError(null);

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 8, 90));
      }, 200);

      try {
        const response = await uploadScene(file);
        clearInterval(progressInterval);
        finishSuccess(response);
      } catch (err) {
        clearInterval(progressInterval);
        finishError(err, "Upload failed. Is the backend running?");
      }
    },
    [finishSuccess, finishError]
  );

  const handleFetchSatellite = useCallback(
    async (result: GeocodeResult) => {
      suppressSearchRef.current = true;
      setQuery(result.displayName);
      setResults([]);
      setIsUploading(true);
      setProgress(0);
      setError(null);

      // No live "bytes transferred" to track here (it's a STAC query + a
      // remote-COG read, not a file upload) — same simulated-progress
      // treatment as a real upload, just for visual consistency.
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 6, 90));
      }, 250);

      try {
        const bbox = boundingBoxForResult(result);
        const response = await fetchSatelliteScene(bbox);
        clearInterval(progressInterval);
        finishSuccess(response);
      } catch (err) {
        clearInterval(progressInterval);
        finishError(
          err,
          "Couldn't fetch satellite imagery. Is the backend running?"
        );
      }
    },
    [finishSuccess, finishError]
  );

  // Debounced search-as-you-type for the "or search a place" box. An empty
  // query naturally shows no results via `visibleResults` below.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    if (!query.trim()) return;

    debounceRef.current = setTimeout(async () => {
      const found = await searchPlaces(query);
      setResults(found);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const visibleResults = query.trim() ? results : [];

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="scene-uploader">
      <motion.div
        className={`upload-dropzone pixel-frame ${isDragOver ? "upload-dropzone--active" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        whileHover={!isUploading ? { y: -2 } : undefined}
        transition={{ duration: 0.2 }}
      >
        <AnimatePresence mode="wait">
          {isDone ? (
            <motion.div
              key="done"
              className="upload-success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <CheckCircle2 size={48} strokeWidth={1.5} />
              <div className="upload-dropzone__text">Scene ready</div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="upload-dropzone__icon-wrap">
                <PixelSatellite size={36} />
              </div>
              <div className="upload-dropzone__text">
                {isUploading
                  ? "Working…"
                  : "Drop a GeoTIFF here or click to browse"}
              </div>
              <div className="upload-dropzone__hint">
                Supports .tif, .tiff files up to 500 MB
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".tif,.tiff,.geotiff"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {!isUploading && !isDone && (
        <div className="satellite-search">
          <div className="satellite-search__divider">
            <span>or</span>
          </div>
          <div className="satellite-search__label">
            <SatelliteIcon size={13} /> Search a place for live satellite imagery
          </div>
          <div className="satellite-search__box">
            <Search size={14} className="satellite-search__icon" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Singapore port, Punjab farmland…"
              className="satellite-search__input"
            />
          </div>
          <AnimatePresence>
            {visibleResults.length > 0 && (
              <motion.ul
                className="satellite-search__results"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {visibleResults.map((result, i) => (
                  <li
                    key={`${result.lat}-${result.lon}-${i}`}
                    className="satellite-search__result"
                    onClick={() => handleFetchSatellite(result)}
                  >
                    {result.displayName}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <div className="satellite-search__hint">
            Pulls the most recent cloud-free Sentinel-2 pass (10m/pixel, free tier —
            fine for land cover and vegetation/water analysis, coarser than an
            uploaded high-res scene for spotting individual buildings or vehicles).
          </div>
        </div>
      )}

      <AnimatePresence>
        {isUploading && (
          <motion.div
            className="upload-progress"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="upload-progress__bar">
              <motion.div
                className="upload-progress__fill"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
            <div className="upload-progress__label">
              {isDone ? "Finalizing…" : `${progress}%`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            className="error-banner"
            style={{ marginTop: "16px", maxWidth: "340px" }}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
          >
            <span className="error-banner__icon">
              <AlertTriangle size={14} />
            </span>
            <span>{error}</span>
            <button
              className="error-banner__dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
