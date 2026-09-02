"use client";

import { useState, useRef, useCallback } from "react";
import { uploadScene } from "@/lib/api";
import type { UploadResponse } from "@/types";

interface SceneUploaderProps {
  onUploadComplete: (response: UploadResponse) => void;
}

export default function SceneUploader({ onUploadComplete }: SceneUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      // Validate file type
      if (!file.name.toLowerCase().match(/\.(tif|tiff|geotiff)$/)) {
        setError("Please upload a GeoTIFF file (.tif, .tiff)");
        return;
      }

      setIsUploading(true);
      setProgress(0);
      setError(null);

      // Simulate progress since fetch doesn't support upload progress natively
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 8, 90));
      }, 200);

      try {
        const response = await uploadScene(file);
        clearInterval(progressInterval);
        setProgress(100);

        setTimeout(() => {
          onUploadComplete(response);
          setIsUploading(false);
          setProgress(0);
        }, 500);
      } catch (err) {
        clearInterval(progressInterval);
        setIsUploading(false);
        setProgress(0);
        setError(
          err instanceof Error ? err.message : "Upload failed. Is the backend running?"
        );
      }
    },
    [onUploadComplete]
  );

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
      <div
        className={`upload-dropzone ${isDragOver ? "upload-dropzone--active" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-dropzone__icon">🛰️</div>
        <div className="upload-dropzone__text">
          {isUploading
            ? "Uploading scene..."
            : "Drop a GeoTIFF here or click to browse"}
        </div>
        <div className="upload-dropzone__hint">
          Supports .tif, .tiff files up to 500 MB
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".tif,.tiff,.geotiff"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {isUploading && (
        <div className="upload-progress">
          <div className="upload-progress__bar">
            <div
              className="upload-progress__fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="upload-progress__label">{progress}% uploaded</div>
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginTop: "16px", maxWidth: "340px" }}>
          <span className="error-banner__icon">⚠️</span>
          <span>{error}</span>
          <button
            className="error-banner__dismiss"
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
