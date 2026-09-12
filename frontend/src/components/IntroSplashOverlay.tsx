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
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // Smooth dismiss handler that can only be triggered once per session/cycle
  const dismiss = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    setIsFading(true);

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

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

  // Mount effect
  useEffect(() => {
    isDismissingRef.current = false;
    setIsVisible(true);
    setIsFading(false);

    // Failsafe timer: only after 10s if video is completely stuck or blocked
    fallbackTimerRef.current = setTimeout(() => {
      dismiss();
    }, 10000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isDismissingRef.current) return;
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
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      if (handleKeyDownRef.current) {
        window.removeEventListener("keydown", handleKeyDownRef.current);
        handleKeyDownRef.current = null;
      }
      window.removeEventListener("solen:replay-intro", handleReplay);
    };
  }, [dismiss]);

  const handleVideoPlaying = () => {
    // Video has actively started playing frames! Set timer to dismiss at end of video + small buffer
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
    }
    const durationSec = videoRef.current?.duration || 5.2;
    fallbackTimerRef.current = setTimeout(() => {
      dismiss();
    }, (durationSec + 0.3) * 1000);
  };

  const handleVideoLoaded = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked by user gesture policy on mobile
      });
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
      {/* Skip button for mobile / immediate access */}
      <button
        type="button"
        className="solen-intro-splash__skip-btn"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        aria-label="Skip intro video"
      >
        Skip Intro →
      </button>

      <video
        ref={videoRef}
        className="solen-intro-splash__video"
        autoPlay
        playsInline
        muted
        preload="auto"
        onLoadedData={handleVideoLoaded}
        onPlaying={handleVideoPlaying}
        onEnded={dismiss}
      >
        <source src="/videos/solen_intro_logo_optimized.mp4" type="video/mp4" />
        <source src="/videos/solen_intro_logo.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
