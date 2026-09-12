"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Navigation,
  Maximize2,
  Minimize2,
  RotateCw,
  Globe,
  Compass,
  Plus,
  Minus,
  Search,
  MapPin,
  Plane,
  Layers,
  Sparkles,
  X,
  SquareDashed,
  BoxSelect,
  GripVertical,
} from "lucide-react";
import type { FeatureCollection, FeatureSource, RasterOverlay, ROI } from "@/types";
import { getTileUrl } from "@/lib/api";
import { searchPlaces, GeocodeResult } from "@/lib/geocode";

// Ensure Cesium finds static workers & assets
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";
}

export interface FlyToTarget {
  lon: number;
  lat: number;
  height: number;
  pitch?: number;
}

export interface LiveViewportCapture {
  image_base64: string;
  bounds: number[];
  label?: string;
  is_roi: boolean;
}

interface Cesium3DViewProps {
  sceneId: string | null;
  sceneBounds: number[] | null;
  sceneName?: string | null;
  geojson: FeatureCollection | null;
  overlays?: RasterOverlay[] | null;
  flyToTarget?: FlyToTarget | null;
  onTargetReached?: () => void;
  onFallbackTo2D?: () => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onUnmountScene?: () => void;
  roi?: ROI | null;
  onROIChange?: (roi: ROI | null) => void;
  onRegisterCapture?: (fn: () => Promise<LiveViewportCapture | null>) => void;
  onRegisterDrawAOI?: (fn: () => void) => void;
}

/** Low Earth Orbit Satellite Specification */
interface SatelliteSpec {
  id: string;
  name: string;
  altitudeKm: number;
  inclinationDeg: number;
  raanDeg: number;
  speedDegPerSec: number;
  initialAnomalyDeg: number;
  color: string;
  type: string;
  sensor: string;
}

const ORBITING_SATELLITES: SatelliteSpec[] = [
  {
    id: "sentinel-2a",
    name: "Sentinel-2A",
    altitudeKm: 786,
    inclinationDeg: 98.62,
    raanDeg: 55,
    speedDegPerSec: 0.045,
    initialAnomalyDeg: 42,
    color: "#22d3ee",
    type: "Multispectral MSI",
    sensor: "13 Bands (VNIR/SWIR)",
  },
  {
    id: "sentinel-2b",
    name: "Sentinel-2B",
    altitudeKm: 786,
    inclinationDeg: 98.62,
    raanDeg: 235,
    speedDegPerSec: 0.045,
    initialAnomalyDeg: 222,
    color: "#38bdf8",
    type: "Multispectral MSI",
    sensor: "13 Bands (VNIR/SWIR)",
  },
  {
    id: "landsat-9",
    name: "Landsat-9",
    altitudeKm: 705,
    inclinationDeg: 98.2,
    raanDeg: 145,
    speedDegPerSec: 0.048,
    initialAnomalyDeg: 130,
    color: "#34d399",
    type: "Optical/Thermal",
    sensor: "OLI-2 / TIRS-2",
  },
  {
    id: "iss",
    name: "ISS (Space Station)",
    altitudeKm: 420,
    inclinationDeg: 51.64,
    raanDeg: 310,
    speedDegPerSec: 0.065,
    initialAnomalyDeg: 80,
    color: "#fbbf24",
    type: "Space Station",
    sensor: "Crew Earth Observations",
  },
];

const SOURCE_COLOR: Record<FeatureSource, [number, number, number]> = {
  detection: [251, 146, 60],
  segmentation: [52, 211, 153],
  spectral: [96, 165, 250],
};

const EXTRUSION_HEIGHT: Record<FeatureSource, number> = {
  detection: 40,
  segmentation: 25,
  spectral: 15,
};

const QUICK_PRESETS = [
  { name: "Space Orbit", lon: 77.2090, lat: 28.6139, height: 16000000, pitch: -90, isAirport: false },
  { name: "SFO Airport", lon: -122.375, lat: 37.619, height: 1600, pitch: -90, isAirport: true },
  { name: "JFK Runway", lon: -73.7781, lat: 40.6413, height: 1800, pitch: -90, isAirport: true },
  { name: "Heathrow (LHR)", lon: -0.4543, lat: 51.4700, height: 1400, pitch: -90, isAirport: true },
  { name: "Tokyo Haneda", lon: 139.7798, lat: 35.5494, height: 1500, pitch: -90, isAirport: true },
  { name: "Dubai Intl", lon: 55.3644, lat: 25.2532, height: 1600, pitch: -90, isAirport: true },
  { name: "Delhi IGI Airport", lon: 77.1000, lat: 28.5562, height: 1800, pitch: -90, isAirport: true },
  { name: "Suez Canal", lon: 32.3425, lat: 30.5852, height: 3500, pitch: -90, isAirport: false },
  { name: "Mumbai Port", lon: 72.95, lat: 18.95, height: 4500, pitch: -90, isAirport: false },
  { name: "Kaziranga Basin", lon: 93.17, lat: 26.58, height: 8000, pitch: -90, isAirport: false },
];

const SATELLITE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect x="2" y="16" width="14" height="16" rx="1.5" fill="%231e3a8a" stroke="%2338bdf8" stroke-width="1.2"/>
  <line x1="2" y1="21.5" x2="16" y2="21.5" stroke="%2338bdf8" stroke-width="0.8"/>
  <line x1="2" y1="26.5" x2="16" y2="26.5" stroke="%2338bdf8" stroke-width="0.8"/>
  <line x1="9" y1="16" x2="9" y2="32" stroke="%2338bdf8" stroke-width="0.8"/>
  <line x1="16" y1="24" x2="20" y2="24" stroke="%23cbd5e1" stroke-width="2.2"/>
  <rect x="20" y="14" width="8" height="20" rx="2" fill="%23e2e8f0" stroke="%230284c7" stroke-width="1.2"/>
  <circle cx="24" cy="24" r="2.5" fill="%230284c7"/>
  <line x1="28" y1="24" x2="32" y2="24" stroke="%23cbd5e1" stroke-width="2.2"/>
  <rect x="32" y="16" width="14" height="16" rx="1.5" fill="%231e3a8a" stroke="%2338bdf8" stroke-width="1.2"/>
  <line x1="32" y1="21.5" x2="46" y2="21.5" stroke="%2338bdf8" stroke-width="0.8"/>
  <line x1="32" y1="26.5" x2="46" y2="26.5" stroke="%2338bdf8" stroke-width="0.8"/>
  <line x1="39" y1="16" x2="39" y2="32" stroke="%2338bdf8" stroke-width="0.8"/>
</svg>`;

/** Compute Cartesian coordinate on an inclined circular Keplerian orbit */
function computeOrbitCartesian(
  altitudeKm: number,
  inclinationDeg: number,
  raanDeg: number,
  anomalyDeg: number
): Cesium.Cartesian3 {
  const r = 6378137 + altitudeKm * 1000;
  const inc = Cesium.Math.toRadians(inclinationDeg);
  const raan = Cesium.Math.toRadians(raanDeg);
  const theta = Cesium.Math.toRadians(anomalyDeg);

  const xOrb = r * Math.cos(theta);
  const yOrb = r * Math.sin(theta);

  const x = xOrb * Math.cos(raan) - yOrb * Math.sin(raan) * Math.cos(inc);
  const y = xOrb * Math.sin(raan) + yOrb * Math.cos(raan) * Math.cos(inc);
  const z = yOrb * Math.sin(inc);

  return new Cesium.Cartesian3(x, y, z);
}

export default function Cesium3DView({
  sceneId,
  sceneBounds,
  sceneName,
  geojson,
  overlays,
  flyToTarget,
  onTargetReached,
  onFallbackTo2D,
  isFullScreen = false,
  onToggleFullScreen,
  onUnmountScene,
  roi,
  onROIChange,
  onRegisterCapture,
  onRegisterDrawAOI,
}: Cesium3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const baseImageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const labelsImageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const sceneLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const sceneFrameEntityRef = useRef<Cesium.Entity | null>(null);
  const resultsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const satellitesDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const overlayLayersRef = useRef<Cesium.ImageryLayer[]>([]);

  // ROI drawing & persistent visualization refs
  const roiEntityRef = useRef<Cesium.Entity | null>(null);
  const drawHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const drawingEntityRef = useRef<Cesium.Entity | null>(null);
  const [isDrawingAOI, setIsDrawingAOI] = useState(false);

  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [coords, setCoords] = useState({
    lat: "28.6139° N",
    lon: "77.2090° E",
    heightKm: "16,000 km",
  });
  const [autoRotate, setAutoRotate] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [activeBasemap, setActiveBasemap] = useState<"google" | "esri" | "clarity">("google");
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [showLabels, setShowLabels] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [todayDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  });
  const [isHeroDismissed, setIsHeroDismissed] = useState(false);

  // Draggable Globe Controls Toolbar State
  const [controlsPos, setControlsPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingControlsRef = useRef(false);
  const controlsDragStartPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const controlsDragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Guarantee map controls are never lost off-screen: clear any legacy bad localStorage coordinates on mount
  useEffect(() => {
    try {
      localStorage.removeItem("solen_globe_controls_pos");
    } catch {
      // ignore
    }
    setControlsPos(null);
  }, []);

  // Reset controls position to default whenever fullscreen mode toggles
  useEffect(() => {
    setControlsPos(null);
  }, [isFullScreen]);

  const handleControlsDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingControlsRef.current = true;
    controlsDragStartPointer.current = { x: e.clientX, y: e.clientY };

    const controlsElem = document.querySelector(".globe-controls") as HTMLElement;
    if (controlsElem) {
      const rect = controlsElem.getBoundingClientRect();
      const parentRect = controlsElem.parentElement?.getBoundingClientRect() || { left: 0, top: 0 };
      controlsDragStartPos.current = {
        x: rect.left - parentRect.left,
        y: rect.top - parentRect.top,
      };
    }
  }, []);

  const handleControlsDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingControlsRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - controlsDragStartPointer.current.x;
    const dy = e.clientY - controlsDragStartPointer.current.y;

    const controlsElem = document.querySelector(".globe-controls") as HTMLElement;
    const parent = controlsElem?.parentElement;
    const parentWidth = parent ? parent.clientWidth : window.innerWidth;
    const parentHeight = parent ? parent.clientHeight : window.innerHeight;
    const width = controlsElem ? controlsElem.offsetWidth : 44;
    const height = controlsElem ? controlsElem.offsetHeight : 320;

    const newX = Math.max(10, Math.min(parentWidth - width - 10, controlsDragStartPos.current.x + dx));
    const newY = Math.max(10, Math.min(parentHeight - height - 10, controlsDragStartPos.current.y + dy));

    setControlsPos({ x: newX, y: newY });
  }, []);

  const handleControlsDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isDraggingControlsRef.current = false;
  }, []);

  const resetControlsPosition = useCallback(() => {
    setControlsPos(null);
    try {
      localStorage.removeItem("solen_globe_controls_pos");
    } catch {
      // ignore
    }
  }, []);

  // ── Initialize the Cesium 3D Globe with Web Mercator High-Res Tiling ──
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    let viewer: Cesium.Viewer;
    let removePreRender: (() => void) | undefined;
    let handler: Cesium.ScreenSpaceEventHandler | undefined;

    try {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }

      // Web Mercator tiling scheme is crucial so zoom levels 18-21 align correctly
      const webMercator = new Cesium.WebMercatorTilingScheme();

      // Google Satellite Tiles (Level 0 - 19 with GPU upsampling for closer zooms)
      const googleImagery = new Cesium.UrlTemplateImageryProvider({
        url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        tilingScheme: webMercator,
        maximumLevel: 19,
        credit: new Cesium.Credit("Satellite Imagery © Google"),
      });

      viewer = new Cesium.Viewer(containerRef.current, {
        contextOptions: {
          webgl: {
            alpha: true,
            depth: true,
            stencil: false,
            antialias: true,
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false,
          },
        },
        baseLayer: new Cesium.ImageryLayer(googleImagery),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        timeline: false,
        animation: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      });

      baseImageryLayerRef.current = viewer.imageryLayers.get(0);

      // Reference boundaries & places labels (Hidden by default to match clean orbital aesthetic)
      const labelsImagery = new Cesium.UrlTemplateImageryProvider({
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        tilingScheme: webMercator,
        maximumLevel: 19,
      });
      const labelsLayer = viewer.imageryLayers.addImageryProvider(labelsImagery);
      labelsLayer.show = false;
      labelsImageryLayerRef.current = labelsLayer;
    } catch (err) {
      console.warn("WebGL initialization encountered an issue:", err);
      setWebglError(true);
      return;
    }

    // ── Camera Controller Zoom Optimization (Allowing close-up airport & port zoom) ──
    const controller = viewer.scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 10.0; // allows zooming in right down to 10 meters!
    controller.maximumZoomDistance = 45000000.0;
    controller.inertiaZoom = 0.85;
    controller.enableCollisionDetection = false; // Prevents getting locked above ground

    // ── Space & Atmosphere Aesthetics ──────────────────────────────────
    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#030712");
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#030712");
    scene.globe.enableLighting = false; // Bright photorealistic earth across day and night
    scene.globe.showGroundAtmosphere = true;
    scene.globe.atmosphereLightIntensity = 3.6;

    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.atmosphereLightIntensity = 3.5;
      scene.skyAtmosphere.hueShift = -0.05;
      scene.skyAtmosphere.saturationShift = 0.25;
      scene.skyAtmosphere.brightnessShift = 0.15;
    }

    if (scene.skyBox) scene.skyBox.show = true;
    if (scene.sun) scene.sun.show = true;
    if (scene.moon) scene.moon.show = true;

    // Initial viewpoint from orbit
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 16000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0.0,
      },
    });

    // Data source for AI detections
    const resultsDataSource = new Cesium.CustomDataSource("results");
    viewer.dataSources.add(resultsDataSource);
    resultsDataSourceRef.current = resultsDataSource;

    // Data source for Satellites
    const satellitesDataSource = new Cesium.CustomDataSource("satellites");
    viewer.dataSources.add(satellitesDataSource);
    satellitesDataSourceRef.current = satellitesDataSource;

    // ── Orbit Trajectories & Animated Satellites ─────────────────────────
    const currentAnomalies: Record<string, number> = {};

    ORBITING_SATELLITES.forEach((sat) => {
      currentAnomalies[sat.id] = sat.initialAnomalyDeg;

      // Draw dashed cyan orbital trajectory path
      const orbitPoints: Cesium.Cartesian3[] = [];
      for (let deg = 0; deg <= 360; deg += 3) {
        orbitPoints.push(
          computeOrbitCartesian(sat.altitudeKm, sat.inclinationDeg, sat.raanDeg, deg)
        );
      }

      satellitesDataSource.entities.add({
        name: `${sat.name} Orbit Path`,
        polyline: {
          positions: orbitPoints,
          width: 1.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(sat.color).withAlpha(0.65),
            dashLength: 14.0,
          }),
        },
      });

      // Satellite position callback
      const satPositionCallback = new Cesium.CallbackProperty(() => {
        return computeOrbitCartesian(
          sat.altitudeKm,
          sat.inclinationDeg,
          sat.raanDeg,
          currentAnomalies[sat.id]
        );
      }, false) as unknown as Cesium.PositionProperty;

      satellitesDataSource.entities.add({
        id: sat.id,
        name: sat.name,
        position: satPositionCallback,
        billboard: {
          image: SATELLITE_SVG,
          width: 24,
          height: 24,
          color: Cesium.Color.fromCssColorString(sat.color),
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        },
        point: {
          pixelSize: 6,
          color: Cesium.Color.fromCssColorString(sat.color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1.5,
        },
        label: {
          text: sat.name,
          font: "10px Inter, system-ui, sans-serif",
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString("#030712"),
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 14),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 25000000),
        },
      });
    });

    // ── Animation Loop for Satellite Orbits & Cinematic Rotation ────────
    let lastTime = performance.now();
    removePreRender = viewer.scene.preRender.addEventListener(() => {
      const now = performance.now();
      const deltaSec = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Move satellites along orbital path
      ORBITING_SATELLITES.forEach((sat) => {
        currentAnomalies[sat.id] =
          (currentAnomalies[sat.id] + sat.speedDegPerSec * deltaSec * 35) % 360;
      });

      // Gentle auto-rotation when zoomed out in space
      if (autoRotate) {
        const cameraHeight = viewer.camera.positionCartographic.height;
        if (cameraHeight > 3000000) {
          viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -0.00035 * deltaSec * 60);
        }
      }
    });

    // ── Dynamic Live Coordinates Tracker on Mouse Move ──────────────────
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      const cartesian = viewer.camera.pickEllipsoid(
        movement.endPosition,
        viewer.scene.globe.ellipsoid
      );
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const latDeg = Cesium.Math.toDegrees(carto.latitude);
        const lonDeg = Cesium.Math.toDegrees(carto.longitude);
        const latStr = `${Math.abs(latDeg).toFixed(4)}° ${latDeg >= 0 ? "N" : "S"}`;
        const lonStr = `${Math.abs(lonDeg).toFixed(4)}° ${lonDeg >= 0 ? "E" : "W"}`;
        setCoords((c) => ({ ...c, lat: latStr, lon: lonStr }));
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // Update altitude on camera move
    viewer.camera.changed.addEventListener(() => {
      const h = viewer.camera.positionCartographic.height;
      const hStr =
        h >= 1000000
          ? `${(h / 1000000).toFixed(1)}M m`
          : h >= 1000
          ? `${(h / 1000).toFixed(1)} km`
          : `${Math.round(h)} m`;
      setCoords((c) => ({ ...c, heightKm: hStr }));
    });

    viewerRef.current = viewer;
    setReady(true);

    return () => {
      if (removePreRender) removePreRender();
      if (handler && !handler.isDestroyed()) handler.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      if (containerRef.current) containerRef.current.innerHTML = "";
      viewerRef.current = null;
      resultsDataSourceRef.current = null;
      satellitesDataSourceRef.current = null;
      setReady(false);
    };
  }, []);

  // Resize Cesium viewer when entering or exiting full screen
  useEffect(() => {
    if (!viewerRef.current) return;
    const timer = setTimeout(() => {
      viewerRef.current?.resize();
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullScreen]);

  // ── Switch Basemap Provider (Google vs Esri vs Clarity) ──────────────
  const switchBasemap = useCallback((type: "google" | "esri" | "clarity") => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const webMercator = new Cesium.WebMercatorTilingScheme();

    let url = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
    let credit = "Satellite Imagery © Google";

    if (type === "esri") {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      credit = "Tiles © Esri World Imagery";
    } else if (type === "clarity") {
      url = "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      credit = "Tiles © Esri Clarity Archive";
    }

    const provider = new Cesium.UrlTemplateImageryProvider({
      url,
      tilingScheme: webMercator,
      maximumLevel: 19, // Level 19 avoids "Map data not yet available" 404s and enables GPU upsampling
      credit: new Cesium.Credit(credit),
    });

    if (baseImageryLayerRef.current) {
      viewer.imageryLayers.remove(baseImageryLayerRef.current, true);
    }
    const newBase = viewer.imageryLayers.addImageryProvider(provider, 0);
    baseImageryLayerRef.current = newBase;
    setActiveBasemap(type);
    setShowBasemapMenu(false);
  }, []);

  // Toggle Labels Layer
  const toggleLabels = useCallback(() => {
    if (!labelsImageryLayerRef.current) return;
    const next = !showLabels;
    labelsImageryLayerRef.current.show = next;
    setShowLabels(next);
  }, [showLabels]);

  // ── Render Persistent Drawn ROI Box on Globe ──────────────────────
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;

    if (roiEntityRef.current) {
      viewer.entities.remove(roiEntityRef.current);
      roiEntityRef.current = null;
    }

    if (!roi || !roi.bbox) return;

    const { west, south, east, north } = roi.bbox;
    const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);

    const entity = viewer.entities.add({
      id: "active-user-roi",
      name: "Selected Analysis Area (AOI)",
      rectangle: {
        coordinates: rect,
        material: Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#00f2fe"),
        outlineWidth: 3,
      },
    });
    roiEntityRef.current = entity;
  }, [ready, roi]);

  // ── Interactive AOI Drawing on 3D Earth Surface ───────────────────
  const startDrawingAOI = useCallback(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    if (roiEntityRef.current) {
      viewer.entities.remove(roiEntityRef.current);
      roiEntityRef.current = null;
    }
    if (drawingEntityRef.current) {
      viewer.entities.remove(drawingEntityRef.current);
      drawingEntityRef.current = null;
    }
    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy();
      drawHandlerRef.current = null;
    }

    setIsDrawingAOI(true);
    viewer.scene.screenSpaceCameraController.enableInputs = false;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    drawHandlerRef.current = handler;

    let startLon = 0;
    let startLat = 0;
    let currLon = 0;
    let currLat = 0;
    let isMouseDown = false;

    handler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
      const ray = viewer.camera.getPickRay(click.position);
      if (!ray) return;
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      startLon = Cesium.Math.toDegrees(carto.longitude);
      startLat = Cesium.Math.toDegrees(carto.latitude);
      currLon = startLon;
      currLat = startLat;
      isMouseDown = true;

      const dynamicCallback = new Cesium.CallbackProperty(() => {
        const minLon = Math.min(startLon, currLon);
        const maxLon = Math.max(startLon, currLon);
        const minLat = Math.min(startLat, currLat);
        const maxLat = Math.max(startLat, currLat);
        return Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat);
      }, false);

      drawingEntityRef.current = viewer.entities.add({
        id: "temp-drawing-aoi",
        rectangle: {
          coordinates: dynamicCallback,
          material: Cesium.Color.fromCssColorString("#22d3ee").withAlpha(0.24),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#00f2fe"),
          outlineWidth: 2.5,
        },
      });
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
      if (!isMouseDown) return;
      const ray = viewer.camera.getPickRay(movement.endPosition);
      if (!ray) return;
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      currLon = Cesium.Math.toDegrees(carto.longitude);
      currLat = Cesium.Math.toDegrees(carto.latitude);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (!isMouseDown) return;
      isMouseDown = false;

      const west = Math.min(startLon, currLon);
      const east = Math.max(startLon, currLon);
      const south = Math.min(startLat, currLat);
      const north = Math.max(startLat, currLat);

      if (drawingEntityRef.current) {
        viewer.entities.remove(drawingEntityRef.current);
        drawingEntityRef.current = null;
      }
      handler.destroy();
      drawHandlerRef.current = null;
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      setIsDrawingAOI(false);

      if (Math.abs(east - west) > 0.0001 && Math.abs(north - south) > 0.0001) {
        const newRoi: ROI = {
          type: "bbox",
          bbox: { west, south, east, north },
          crs: "EPSG:4326",
        };
        onROIChange?.(newRoi);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
  }, [onROIChange]);

  const cancelDrawingAOI = useCallback(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    if (drawingEntityRef.current) {
      viewer.entities.remove(drawingEntityRef.current);
      drawingEntityRef.current = null;
    }
    if (drawHandlerRef.current) {
      drawHandlerRef.current.destroy();
      drawHandlerRef.current = null;
    }
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    setIsDrawingAOI(false);
  }, []);

  // Cancel drawing on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDrawingAOI) {
        cancelDrawingAOI();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawingAOI, cancelDrawingAOI]);

  // ── Live Viewport & AOI Canvas Snapshot Capture ────────────────────
  const captureSnapshot = useCallback(async (): Promise<LiveViewportCapture | null> => {
    if (!viewerRef.current) return null;
    const viewer = viewerRef.current;

    viewer.render();
    const canvas = viewer.scene.canvas;
    if (!canvas) return null;

    // 1. If an active drawn ROI exists, crop the canvas to it
    if (roi && roi.bbox) {
      const { west, south, east, north } = roi.bbox;
      const c1 = Cesium.Cartesian3.fromDegrees(west, north);
      const c2 = Cesium.Cartesian3.fromDegrees(east, south);
      const w1 = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, c1);
      const w2 = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, c2);

      if (w1 && w2) {
        const minX = Math.max(0, Math.min(w1.x, w2.x));
        const maxX = Math.min(canvas.width, Math.max(w1.x, w2.x));
        const minY = Math.max(0, Math.min(w1.y, w2.y));
        const maxY = Math.min(canvas.height, Math.max(w1.y, w2.y));
        const cropW = maxX - minX;
        const cropH = maxY - minY;

        if (cropW > 30 && cropH > 30) {
          const offscreen = document.createElement("canvas");
          offscreen.width = cropW;
          offscreen.height = cropH;
          const ctx = offscreen.getContext("2d");
          if (ctx) {
            ctx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
            const dataUrl = offscreen.toDataURL("image/jpeg", 0.90);
            return {
              image_base64: dataUrl,
              bounds: [west, south, east, north],
              label: `Drawn AOI (${((south + north) / 2).toFixed(3)}°N, ${((west + east) / 2).toFixed(3)}°E)`,
              is_roi: true,
            };
          }
        }
      }
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      return {
        image_base64: dataUrl,
        bounds: [west, south, east, north],
        label: `Drawn AOI (${((south + north) / 2).toFixed(3)}°N, ${((west + east) / 2).toFixed(3)}°E)`,
        is_roi: true,
      };
    }

    // 2. Full visible viewport capture
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    let west = -180, south = -90, east = 180, north = 90;
    if (rect) {
      west = Cesium.Math.toDegrees(rect.west);
      south = Cesium.Math.toDegrees(rect.south);
      east = Cesium.Math.toDegrees(rect.east);
      north = Cesium.Math.toDegrees(rect.north);
    } else {
      const pos = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(pos.longitude);
      const lat = Cesium.Math.toDegrees(pos.latitude);
      const h = pos.height;
      const delta = Math.min(1.0, Math.max(0.005, (h / 111000) * 0.5));
      west = lon - delta;
      east = lon + delta;
      south = lat - delta;
      north = lat + delta;
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return {
      image_base64: dataUrl,
      bounds: [west, south, east, north],
      label: `Live Map View (${((south + north) / 2).toFixed(3)}°N, ${((west + east) / 2).toFixed(3)}°E)`,
      is_roi: false,
    };
  }, [roi]);

  useEffect(() => {
    if (onRegisterCapture) {
      onRegisterCapture(captureSnapshot);
    }
  }, [captureSnapshot, onRegisterCapture]);

  useEffect(() => {
    if (onRegisterDrawAOI) {
      onRegisterDrawAOI(startDrawingAOI);
    }
  }, [onRegisterDrawAOI, startDrawingAOI]);

  // ── Drape Scene when loaded ──────────────────────────────────────────
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;

    if (sceneLayerRef.current) {
      viewer.imageryLayers.remove(sceneLayerRef.current, true);
      sceneLayerRef.current = null;
    }
    if (sceneFrameEntityRef.current) {
      viewer.entities.remove(sceneFrameEntityRef.current);
      sceneFrameEntityRef.current = null;
    }

    if (!sceneId || !sceneBounds || sceneBounds.length !== 4) return;

    const [west, south, east, north] = sceneBounds;
    const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north);

    const sceneProvider = new Cesium.UrlTemplateImageryProvider({
      url: getTileUrl(sceneId),
      rectangle,
      maximumLevel: 19,
    });

    sceneLayerRef.current = viewer.imageryLayers.addImageryProvider(sceneProvider);

    // Clean display boundary around the raster on the terrain surface
    const frameEntity = viewer.entities.add({
      rectangle: {
        coordinates: rectangle,
        material: Cesium.Color.fromBytes(34, 211, 238, 15),
        outline: true,
        outlineColor: Cesium.Color.fromBytes(34, 211, 238, 220),
        outlineWidth: 2,
      },
    });
    sceneFrameEntityRef.current = frameEntity;

    const sw = Cesium.Cartesian3.fromDegrees(west, south);
    const ne = Cesium.Cartesian3.fromDegrees(east, north);
    const sceneDiagonal = Cesium.Cartesian3.distance(sw, ne);
    const range = Math.max(sceneDiagonal * 1.6, 350);

    viewer.flyTo(frameEntity, {
      duration: 1.8,
      offset: new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-89.9),
        range
      ),
    });
  }, [ready, sceneId, sceneBounds]);

  // ── Extrude AI GeoJSON Feature Collection ────────────────────────────
  useEffect(() => {
    if (!ready || !resultsDataSourceRef.current) return;
    const dataSource = resultsDataSourceRef.current;
    dataSource.entities.removeAll();

    if (!geojson || geojson.features.length === 0) return;

    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    let hasCoords = false;

    for (const feature of geojson.features) {
      const source = (feature.properties?.source || "detection") as FeatureSource;
      const label = (feature.properties?.label || "").toLowerCase();
      const score = typeof feature.properties?.score === "number" ? feature.properties.score : 0.75;
      
      let [r, g, b] = SOURCE_COLOR[source] ?? [251, 146, 60];
      if (source === "spectral") {
        if (label.includes("ndvi") || label.includes("vegetation")) {
          [r, g, b] = [16, 185, 129]; // Emerald Green for Crops & Vegetation
        } else if (label.includes("ndwi") || label.includes("water") || label.includes("flood")) {
          [r, g, b] = [14, 165, 233]; // Ocean Cyan/Blue for Water
        } else if (label.includes("ndbi") || label.includes("built") || label.includes("urban") || label.includes("concrete")) {
          [r, g, b] = [245, 158, 11]; // Solar Amber for Concrete & Buildings
        } else if (label.includes("nbr") || label.includes("burn") || label.includes("fire")) {
          [r, g, b] = [239, 68, 68]; // Crimson Red for Fire/Burn Scars
        } else if (label.includes("ndmi") || label.includes("moist")) {
          [r, g, b] = [99, 102, 241]; // Indigo for Moisture
        }
      }

      const baseHeight = EXTRUSION_HEIGHT[source] ?? 35;
      const height = Math.max(10, baseHeight * Math.max(score, 0.2));
      const color = Cesium.Color.fromBytes(r, g, b, 210);

      const { geometry } = feature;

      if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
        const rings: number[][][] =
          geometry.type === "Polygon"
            ? [geometry.coordinates[0]]
            : geometry.coordinates.map((poly) => poly[0]);

        for (const ring of rings) {
          const positions = ring.flatMap(([lon, lat]) => {
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            hasCoords = true;
            return [lon, lat];
          });

          dataSource.entities.add({
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
              material: color,
              classificationType: Cesium.ClassificationType.BOTH,
              outline: true,
              outlineColor: Cesium.Color.fromBytes(r, g, b, 255),
            },
          });
        }
      } else if (geometry.type === "Point") {
        const [lon, lat] = geometry.coordinates;
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        hasCoords = true;

        dataSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          point: {
            pixelSize: 14,
            color: color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
      }
    }

    // GeoJSON polygon entities are loaded and clamped to ground
  }, [ready, geojson]);

  // ── Drape Georeferenced Spectral Raster Overlays (NDVI/NDWI/NBR) ──────
  useEffect(() => {
    if (!ready || !viewerRef.current) return;
    const viewer = viewerRef.current;

    // Clear previously active overlay layers
    for (const layer of overlayLayersRef.current) {
      viewer.imageryLayers.remove(layer);
    }
    overlayLayersRef.current = [];

    if (!overlays || overlays.length === 0) return;

    for (const ov of overlays) {
      if (!ov.bounds || ov.bounds.length !== 4) continue;
      const [west, south, east, north] = ov.bounds;
      const fullUrl = ov.url.startsWith("http")
        ? ov.url
        : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${ov.url}`;

      try {
        const provider = new Cesium.SingleTileImageryProvider({
          url: fullUrl,
          rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
        });
        const layer = viewer.imageryLayers.addImageryProvider(provider);
        layer.alpha = ov.opacity ?? 0.8;
        overlayLayersRef.current.push(layer);

      } catch (err) {
        console.warn("Failed to drape raster overlay onto Cesium:", err);
      }
    }
  }, [ready, overlays]);

  // ── Fly to Target Effect (triggered from Global Search, Recent Projects, Quick Actions) ──
  useEffect(() => {
    if (!ready || !viewerRef.current || !flyToTarget) return;
    const { lon, lat, height, pitch = -90 } = flyToTarget;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(height, 50)),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(pitch),
        roll: 0.0,
      },
      duration: 2.2,
      complete: () => {
        onTargetReached?.();
      },
    });
  }, [ready, flyToTarget, onTargetReached]);

  // ── Search Places Handler ────────────────────────────────────────────
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchPlaces(searchQuery, 5);
      setSearchResults(results);
      setSearchOpen(true);
      if (results.length > 0) {
        selectSearchResult(results[0]);
      }
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (result: GeocodeResult) => {
    if (!viewerRef.current) return;
    setSearchOpen(false);

    if (result.boundingBox) {
      const [south, north, west, east] = result.boundingBox;
      viewerRef.current.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
        duration: 1.8,
      });
    } else {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 1600),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90),
          roll: 0.0,
        },
        duration: 1.8,
      });
    }
  };

  // ── Camera Navigation Helpers ────────────────────────────────────────
  const flyToPreset = useCallback((target: (typeof QUICK_PRESETS)[0]) => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.height),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(target.pitch),
        roll: 0.0,
      },
      duration: 2.0,
    });
  }, []);

  const handleZoomIn = () => {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const h = camera.positionCartographic.height;
    const step = h > 50000 ? h * 0.5 : h > 5000 ? h * 0.4 : h > 500 ? h * 0.35 : Math.max(h * 0.3, 10);
    camera.zoomIn(step);
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const h = camera.positionCartographic.height;
    const step = h > 50000 ? h * 0.6 : h > 5000 ? h * 0.5 : h > 500 ? h * 0.4 : Math.max(h * 0.35, 20);
    camera.zoomOut(step);
  };

  const handleResetSpaceView = () => {
    flyToPreset(QUICK_PRESETS[0]);
  };

  const handleToggleTilt = () => {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const currentPitch = Cesium.Math.toDegrees(camera.pitch);
    const newPitch = currentPitch < -65 ? -40 : -90;
    camera.flyTo({
      destination: camera.position,
      orientation: {
        heading: camera.heading,
        pitch: Cesium.Math.toRadians(newPitch),
        roll: 0.0,
      },
      duration: 1.2,
    });
  };

  if (webglError) {
    return (
      <div className="globe-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "500px", background: "#020408" }}>
        <div style={{ textAlign: "center", padding: "30px", maxWidth: "460px" }}>
          <Globe size={48} color="#22d3ee" style={{ margin: "0 auto 16px auto", opacity: 0.8 }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
            WebGL Acceleration Notice
          </h3>
          <p style={{ fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.5, marginBottom: 20 }}>
            Your browser session experienced a WebGL context restriction. You can switch to the high-resolution 2D Satellite View or reload.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            {onFallbackTo2D && (
              <button
                onClick={onFallbackTo2D}
                style={{
                  padding: "8px 18px",
                  background: "#22d3ee",
                  color: "#0f172a",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Switch to 2D Map
              </button>
            )}
            <button
              onClick={() => {
                setWebglError(false);
                window.location.reload();
              }}
              style={{
                padding: "8px 18px",
                background: "rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontWeight: 500,
                fontSize: "0.82rem",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                cursor: "pointer",
              }}
            >
              Retry 3D Earth
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="globe-container">
      {/* 3D Cesium Earth Canvas */}
      <div ref={containerRef} className="globe-canvas" />

      {/* ── Top-Center: Mounted Scene Banner with Unmount Action ──────── */}
      {sceneId && (
        <div className="globe-mounted-scene-banner">
          <span className="globe-pill__dot globe-pill__dot--live" />
          <span className="globe-mounted-scene-banner__label">Mounted Scene:</span>
          <span className="globe-mounted-scene-banner__name">{sceneName || sceneId.slice(0, 20)}</span>
          {onUnmountScene && (
            <button
              type="button"
              onClick={onUnmountScene}
              className="globe-mounted-scene-banner__btn"
              title="Unmount scene overlay from globe"
            >
              <X size={13} />
              <span>Unmount</span>
            </button>
          )}
        </div>
      )}


      {/* ── Top-Left: Hero Overlay (Only when NOT in fullscreen) ──────── */}
      {!isFullScreen && (
        isHeroDismissed ? (
          <button
            type="button"
            onClick={() => setIsHeroDismissed(false)}
            className="globe-hud__hero-restore-chip"
            title="Expand Satellite Intelligence Overview"
            aria-label="Expand Satellite Intelligence Overview"
          >
            <span className="globe-hud__tag-line" />
            <span>SATELLITE INTELLIGENCE</span>
            <span className="globe-hud__restore-text">Show</span>
          </button>
        ) : (
          <div className="globe-hud__hero">
            <div className="globe-hud__hero-top-row">
              <div className="globe-hud__tag">
                <span className="globe-hud__tag-line" />
                <span>SATELLITE INTELLIGENCE</span>
              </div>
            </div>
            <h1 className="globe-hud__title">
              A clearer<br />planet.
            </h1>
            <p className="globe-hud__subtitle">
              Turn satellite data into real-world decisions.
            </p>
          </div>
        )
      )}

      {/* ── Top-Right: Coordinates & Minimal Controls (Matching theme.jpg) ── */}
      <div className="globe-hud__telemetry">
        <div className="globe-hud__coords">
          <Navigation size={13} className="globe-hud__compass-icon" />
          <div className="globe-hud__coords-block">
            <span className="globe-hud__date">Sep 04, 2024</span>
            <span className="globe-hud__coords-val">28.6139° N, 77.2090° E</span>
          </div>
        </div>
        {!isFullScreen && (
          <div className="globe-hud__pills">
            <div className="globe-pill">
              <span className="globe-pill__dot globe-pill__dot--live" /> Live
            </div>
            <div className="globe-pill">
              <span className="globe-pill__dot" /> Analysis Ready
            </div>
            <div className="globe-pill">
              <span className="globe-pill__dot" /> Global Coverage
            </div>
            <div className="globe-pill">
              <span className="globe-pill__dot" /> AI-Powered Insights
            </div>
          </div>
        )}
      </div>

      {/* Active Drawing Guide Banner */}
      {isDrawingAOI && (
        <div className="globe-drawing-banner">
          <span className="globe-drawing-banner__pulse" />
          <span>Click and drag on Earth to frame an area of interest. Press <strong>Esc</strong> to cancel.</span>
          <button
            type="button"
            onClick={cancelDrawingAOI}
            className="globe-drawing-banner__cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Persistent AOI Badge */}
      {roi && roi.bbox && (
        <div className="globe-roi-badge">
          <span className="globe-roi-badge__dot" />
          <span className="globe-roi-badge__text">
            Drawn AOI Active ({((roi.bbox.south + roi.bbox.north) / 2).toFixed(3)}°N, {((roi.bbox.west + roi.bbox.east) / 2).toFixed(3)}°E)
          </span>
          <button
            type="button"
            onClick={() => onROIChange?.(null)}
            className="globe-roi-badge__clear"
            title="Clear Drawn AOI"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Minimal Floating Exit Button in Fullscreen Mode */}
      {isFullScreen && onToggleFullScreen && (
        <button
          type="button"
          onClick={onToggleFullScreen}
          className="globe-fullscreen-minimal-exit"
          title="Exit Full Screen (ESC)"
        >
          <Minimize2 size={14} />
          <span>Exit Fullscreen</span>
          <kbd className="globe-esc-kbd">ESC</kbd>
        </button>
      )}

      {/* ── Bottom-Left: Live Satellite Feed Card (Only when NOT in fullscreen) ──── */}
      {!isFullScreen && (
        <div className={`globe-hud__feed-card ${feedExpanded ? "globe-hud__feed-card--expanded" : ""}`}>
          <div className="globe-hud__feed-header">
            <div>
              <div className="globe-hud__feed-title">Live Satellite Feed</div>
              <div className="globe-hud__feed-sub">
                <span className="globe-pill__dot globe-pill__dot--live" />
                <span>3 satellites active</span>
              </div>
            </div>
            <button
              className="globe-hud__feed-expand-btn"
              onClick={() => setFeedExpanded(!feedExpanded)}
              title={feedExpanded ? "Collapse Feed" : "Expand Feed"}
            >
              {feedExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>

          <div className="globe-hud__feed-preview">
            <video
              src="/videos/satellite_feed_live.mp4"
              poster="/images/theme_live_feed.jpg"
              autoPlay
              muted
              loop
              playsInline
              className="globe-hud__feed-img"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            <div className="globe-hud__feed-scanline" />
            <div className="globe-hud__feed-badge">
              <span className="globe-hud__feed-sat-name">Sentinel-2</span>
              <span className="globe-hud__feed-dot">•</span>
              <span>10:24 UTC</span>
              <span className="globe-hud__feed-dot">•</span>
              <span>10 m</span>
              <div className="globe-hud__feed-signal" title="Signal: 98% Strong">
                <span className="signal-bar signal-bar--1" />
                <span className="signal-bar signal-bar--2" />
                <span className="signal-bar signal-bar--3" />
                <span className="signal-bar signal-bar--4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom-Center: Mission Exploration Dock (Only when NOT in fullscreen) ── */}
      {!isFullScreen && (
        <div className="globe-hud__dock">
          <div className="globe-hud__dock-brand">
            <span className="globe-hud__dock-step">EXPLORE</span>
            <span className="globe-hud__dock-sep">—</span>
            <span className="globe-hud__dock-step">ANALYZE</span>
            <span className="globe-hud__dock-sep">—</span>
            <span className="globe-hud__dock-step">UNDERSTAND</span>
            <span className="globe-hud__dock-sep">—</span>
            <span className="globe-hud__dock-step">ACT</span>
          </div>
        </div>
      )}

      {/* ── Floating 3D Globe Navigation Controls ──────────────────── */}
      <div
        className="globe-controls"
        style={
          controlsPos
            ? {
                left: `${controlsPos.x}px`,
                top: `${controlsPos.y}px`,
                right: "auto",
                bottom: "auto",
              }
            : undefined
        }
      >
        {/* Sleek Top Drag Handle */}
        <div
          className="globe-controls__drag-handle"
          onPointerDown={handleControlsDragStart}
          onPointerMove={handleControlsDragMove}
          onPointerUp={handleControlsDragEnd}
          onPointerCancel={handleControlsDragEnd}
          onDoubleClick={resetControlsPosition}
          title="Drag to move map controls anywhere (double-click to reset)"
          aria-label="Drag map controls"
        >
          <GripVertical size={14} className="globe-controls__drag-icon" />
        </div>
        <div className="globe-ctrl-divider" style={{ margin: "2px 0 3px" }} />

        <button
          onClick={handleResetSpaceView}
          className="globe-ctrl-btn"
          title="Reset to Deep Space View"
        >
          <Globe size={16} />
        </button>
        <button
          onClick={handleToggleTilt}
          className="globe-ctrl-btn"
          title="Toggle 3D Tilt / Top-down"
        >
          <Compass size={16} />
        </button>
        <button
          onClick={isDrawingAOI ? cancelDrawingAOI : startDrawingAOI}
          className={`globe-ctrl-btn ${isDrawingAOI ? "globe-ctrl-btn--active" : ""}`}
          title={isDrawingAOI ? "Cancel AOI Drawing (Esc)" : "Draw Area of Interest (AOI) Box on Earth"}
          aria-label="Draw Area of Interest"
        >
          <BoxSelect size={16} />
        </button>
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`globe-ctrl-btn ${autoRotate ? "globe-ctrl-btn--active" : ""}`}
          title={autoRotate ? "Pause Earth Rotation" : "Auto-Rotate Earth"}
        >
          <RotateCw size={15} />
        </button>
        <div className="globe-ctrl-divider" />
        <div className="relative">
          <button
            onClick={() => setShowBasemapMenu(!showBasemapMenu)}
            className={`globe-ctrl-btn ${showBasemapMenu ? "globe-ctrl-btn--active" : ""}`}
            title="Switch Satellite Imagery Layer (Google, Esri, Clarity)"
            aria-label="Switch Satellite Imagery Layer"
          >
            <Layers size={15} />
          </button>

          {showBasemapMenu && (
            <div className="globe-basemap-menu">
              <div className="globe-basemap-menu__header">Imagery Providers</div>
              <button
                type="button"
                onClick={() => switchBasemap("google")}
                className={`globe-basemap-menu__option ${activeBasemap === "google" ? "globe-basemap-menu__option--active" : ""}`}
              >
                <div className="globe-basemap-menu__opt-title">Google Satellite HD</div>
                <div className="globe-basemap-menu__opt-desc">Ultra-high resolution optical photography</div>
              </button>
              <button
                type="button"
                onClick={() => switchBasemap("esri")}
                className={`globe-basemap-menu__option ${activeBasemap === "esri" ? "globe-basemap-menu__option--active" : ""}`}
              >
                <div className="globe-basemap-menu__opt-title">Esri World Imagery</div>
                <div className="globe-basemap-menu__opt-desc">Color-balanced seamless mosaic (No seamlines)</div>
              </button>
              <button
                type="button"
                onClick={() => switchBasemap("clarity")}
                className={`globe-basemap-menu__option ${activeBasemap === "clarity" ? "globe-basemap-menu__option--active" : ""}`}
              >
                <div className="globe-basemap-menu__opt-title">Esri Clarity Archive</div>
                <div className="globe-basemap-menu__opt-desc">Cloud-free high clarity historical archive</div>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={toggleLabels}
          className={`globe-ctrl-btn ${showLabels ? "globe-ctrl-btn--active" : ""}`}
          title={showLabels ? "Hide Map Labels" : "Show Map Labels"}
        >
          <MapPin size={15} />
        </button>
        <div className="globe-ctrl-divider" />
        <button type="button" onClick={handleZoomIn} className="globe-ctrl-btn" title="Zoom In (+)">
          <Plus size={16} />
        </button>
        <button type="button" onClick={handleZoomOut} className="globe-ctrl-btn" title="Zoom Out (-)">
          <Minus size={16} />
        </button>
        {onToggleFullScreen && (
          <>
            <div className="globe-ctrl-divider" />
            <button
              type="button"
              onClick={onToggleFullScreen}
              className={`globe-ctrl-btn ${isFullScreen ? "globe-ctrl-btn--active" : ""}`}
              title={isFullScreen ? "Exit Full Screen (Esc)" : "Expand Globe to Full Screen"}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
