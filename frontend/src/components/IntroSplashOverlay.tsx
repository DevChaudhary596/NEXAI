"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface IntroSplashOverlayProps {
  onComplete?: () => void;
}

export default function IntroSplashOverlay({ onComplete }: IntroSplashOverlayProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isDismissingRef = useRef(false);

  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Smooth dismiss handler that can only be triggered once per session/cycle
  const dismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    setIsFading(true);

    // Immediately stop intercepting any key presses across the app
    if (handleKeyDownRef.current) {
      window.removeEventListener("keydown", handleKeyDownRef.current);
      handleKeyDownRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // ignore
      }
    }

    // Remove from DOM after fade animation completes
    setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 600);
  }, [onComplete]);

  // Mount effect: auto-advance after video duration (5.3s) failsafe
  useEffect(() => {
    isDismissingRef.current = false;
    setIsVisible(true);
    setIsFading(false);

    // Guaranteed fallback: video is 5.0s, so at 5.3s it always opens the app
    const fallbackTimer = setTimeout(() => {
      dismiss();
    }, 5300);

    const handleKeyDown = (e: KeyboardEvent) => {
      // If already dismissing or hidden, never process or prevent events
      if (isDismissingRef.current) return;

      // Never intercept keystrokes if the user is typing in any input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("input, textarea, [contenteditable='true']"))
      ) {
        return;
      }

      if (e.key === "Escape" || e.key === "Enter" || e.code === "Space" || e.key === " ") {
        e.preventDefault();
        dismiss();
      }
    };

    handleKeyDownRef.current = handleKeyDown;
    window.addEventListener("keydown", handleKeyDown);

    const handleReplay = () => {
      isDismissingRef.current = false;
      setIsVisible(true);
      setIsFading(false);
      if (handleKeyDownRef.current) {
        window.removeEventListener("keydown", handleKeyDownRef.current);
      }
      handleKeyDownRef.current = handleKeyDown;
      window.addEventListener("keydown", handleKeyDown);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
    };

    window.addEventListener("solen:replay-intro", handleReplay);

    return () => {
      clearTimeout(fallbackTimer);
      if (handleKeyDownRef.current) {
        window.removeEventListener("keydown", handleKeyDownRef.current);
        handleKeyDownRef.current = null;
      }
      window.removeEventListener("solen:replay-intro", handleReplay);
    };
  }, [dismiss]);

  const handleVideoLoaded = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className={`solen-intro-splash ${isFading ? "solen-intro-splash--fading" : ""}`}
      onClick={dismiss}
      role="button"
      tabIndex={0}
      aria-label="SOLEN Opening Logo Video (Click or press any key to enter)"
    >
      <video
        ref={videoRef}
        className="solen-intro-splash__video"
        autoPlay
        playsInline
        muted
        preload="auto"
        onLoadedData={handleVideoLoaded}
        onEnded={dismiss}
        onError={dismiss}
      >
        <source src="/videos/solen_intro_logo_optimized.mp4" type="video/mp4" />
        <source src="/videos/solen_intro_logo.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
