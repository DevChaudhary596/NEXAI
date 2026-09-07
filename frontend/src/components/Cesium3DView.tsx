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
} from "lucide-react";
import type { FeatureCollection, FeatureSource } from "@/types";
import { getTileUrl } from "@/lib/api";
import { searchPlaces, GeocodeResult } from "@/lib/geocode";

// Ensure Cesium finds static workers & assets
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";
}

interface Cesium3DViewProps {
  sceneId: string | null;
  sceneBounds: number[] | null;
  geojson: FeatureCollection | null;
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
    initialAnomalyDeg: 290,
    color: "#fbbf24",
    type: "Orbital Laboratory",
    sensor: "Multi-Payload",
  },
];

/** High-detail airport & landscape fly-to presets */
const QUICK_PRESETS = [
  { name: "Global Space View", lon: 78.9629, lat: 20.5937, height: 16000000, pitch: -90, isAirport: false },
  { name: "Delhi Airport (DEL)", lon: 77.0988, lat: 28.5562, height: 1400, pitch: -42, isAirport: true },
  { name: "San Francisco Airport (SFO)", lon: -122.3754, lat: 37.6189, height: 1500, pitch: -45, isAirport: true },
  { name: "Mumbai Airport (BOM)", lon: 72.8679, lat: 19.0887, height: 1400, pitch: -42, isAirport: true },
  { name: "Dubai Airport (DXB)", lon: 55.3644, lat: 25.2532, height: 1500, pitch: -45, isAirport: true },
  { name: "Punjab Farmland (NDVI)", lon: 75.83, lat: 30.78, height: 16000, pitch: -45, isAirport: false },
  { name: "Kaziranga Basin (Flood)", lon: 93.17, lat: 26.58, height: 26000, pitch: -40, isAirport: false },
];

/** Extrusion height (metres) per feature source */
const EXTRUSION_HEIGHT: Record<FeatureSource, number> = {
  detection: 25,
  segmentation: 6,
  spectral: 12,
};

const SOURCE_COLOR: Record<FeatureSource, [number, number, number]> = {
  detection: [251, 146, 60], // amber
  segmentation: [52, 211, 153], // green
  spectral: [34, 211, 238], // cyan
};

const SATELLITE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%2322d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4"/><path d="m14 8 2 2"/><path d="m9 15-2 2"/><path d="m17 9 2-2"/></svg>`;

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
  geojson,
}: Cesium3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const baseImageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const labelsImageryLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const sceneLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const sceneFrameEntityRef = useRef<Cesium.Entity | null>(null);
  const resultsDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const satellitesDataSourceRef = useRef<Cesium.CustomDataSource | null>(null);

  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState({
    lat: "28.6139° N",
    lon: "77.2090° E",
    heightKm: "16,000 km",
  });
  const [autoRotate, setAutoRotate] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [activeBasemap, setActiveBasemap] = useState<"google" | "esri">("google");
  const [showLabels, setShowLabels] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [todayDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  });

  // ── Initialize the Cesium 3D Globe with Web Mercator High-Res Tiling ──
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // Web Mercator tiling scheme is crucial so zoom levels 18-21 align correctly
    const webMercator = new Cesium.WebMercatorTilingScheme();

    // Google Satellite Tiles (Level 0 - 21) — Sub-meter high-res down to individual airplanes
    const googleImagery = new Cesium.UrlTemplateImageryProvider({
      url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      tilingScheme: webMercator,
      maximumLevel: 21,
      credit: new Cesium.Credit("Satellite Imagery © Google"),
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
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

    // Reference boundaries & places labels
    const labelsImagery = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      tilingScheme: webMercator,
      maximumLevel: 19,
    });
    const labelsLayer = viewer.imageryLayers.addImageryProvider(labelsImagery);
    labelsImageryLayerRef.current = labelsLayer;

    // ── Camera Controller Zoom Optimization (Allowing close-up airport zoom) ──
    const controller = viewer.scene.screenSpaceCameraController;
    controller.minimumZoomDistance = 20.0; // allows zooming in right down to 20 meters!
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
        pitch: Cesium.Math.toRadians(-88),
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
    const removePreRender = viewer.scene.preRender.addEventListener(() => {
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
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
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
      removePreRender();
      handler.destroy();
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      resultsDataSourceRef.current = null;
      satellitesDataSourceRef.current = null;
      setReady(false);
    };
  }, []);

  // ── Switch Basemap Provider (Google vs Esri) ─────────────────────────
  const switchBasemap = useCallback((type: "google" | "esri") => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const webMercator = new Cesium.WebMercatorTilingScheme();

    const provider =
      type === "google"
        ? new Cesium.UrlTemplateImageryProvider({
            url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            tilingScheme: webMercator,
            maximumLevel: 21,
            credit: new Cesium.Credit("Satellite Imagery © Google"),
          })
        : new Cesium.UrlTemplateImageryProvider({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            tilingScheme: webMercator,
            maximumLevel: 19,
            credit: new Cesium.Credit("Tiles © Esri"),
          });

    if (baseImageryLayerRef.current) {
      viewer.imageryLayers.remove(baseImageryLayerRef.current, true);
    }
    const newBase = viewer.imageryLayers.addImageryProvider(provider, 0);
    baseImageryLayerRef.current = newBase;
    setActiveBasemap(type);
  }, []);

  // Toggle Labels Layer
  const toggleLabels = useCallback(() => {
    if (!labelsImageryLayerRef.current) return;
    const next = !showLabels;
    labelsImageryLayerRef.current.show = next;
    setShowLabels(next);
  }, [showLabels]);

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

    // 3D display frame around the raster
    const wallHeight = 22;
    const corners: [number, number][] = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ];
    const positions = corners.flatMap(([lon, lat]) => [lon, lat]);

    const frameEntity = viewer.entities.add({
      wall: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        maximumHeights: corners.map(() => wallHeight),
        minimumHeights: corners.map(() => 0),
        material: Cesium.Color.fromBytes(34, 211, 238, 90),
        outline: true,
        outlineColor: Cesium.Color.fromBytes(34, 211, 238, 255),
        outlineWidth: 2,
      },
    });
    sceneFrameEntityRef.current = frameEntity;

    const sw = Cesium.Cartesian3.fromDegrees(west, south);
    const ne = Cesium.Cartesian3.fromDegrees(east, north);
    const sceneDiagonal = Cesium.Cartesian3.distance(sw, ne);
    const range = Math.max(sceneDiagonal * 2.0, 350);

    viewer.flyTo(frameEntity, {
      duration: 1.8,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(-20),
        Cesium.Math.toRadians(-40),
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

    for (const feature of geojson.features) {
      const source = feature.properties.source;
      const score = feature.properties.score ?? 0.5;
      const [r, g, b] = SOURCE_COLOR[source] ?? [255, 255, 255];
      const height = EXTRUSION_HEIGHT[source] * Math.max(score, 0.2);
      const color = Cesium.Color.fromBytes(r, g, b, 210);

      const { geometry } = feature;

      if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
        const rings: number[][][] =
          geometry.type === "Polygon"
            ? [geometry.coordinates[0]]
            : geometry.coordinates.map((poly) => poly[0]);

        for (const ring of rings) {
          const positions = ring.flatMap(([lon, lat]) => [lon, lat]);
          dataSource.entities.add({
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
              extrudedHeight: height,
              height: 0,
              material: color,
              outline: true,
              outlineColor: Cesium.Color.fromBytes(r, g, b, 255),
            },
          });
        }
      } else if (geometry.type === "Point") {
        const [lon, lat] = geometry.coordinates;
        dataSource.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, height / 2),
          cylinder: {
            length: height,
            topRadius: 8,
            bottomRadius: 8,
            material: color,
            outline: true,
            outlineColor: Cesium.Color.fromBytes(r, g, b, 255),
          },
        });
      }
    }
  }, [ready, geojson]);

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
          pitch: Cesium.Math.toRadians(-45),
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
    const h = viewerRef.current.camera.positionCartographic.height;
    const step = h > 50000 ? h * 0.5 : h > 5000 ? h * 0.4 : Math.max(h * 0.35, 80);
    viewerRef.current.camera.zoomIn(step);
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    const h = viewerRef.current.camera.positionCartographic.height;
    const step = h > 50000 ? h * 0.6 : h > 5000 ? h * 0.5 : Math.max(h * 0.45, 120);
    viewerRef.current.camera.zoomOut(step);
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

  return (
    <div className="globe-container">
      {/* 3D Cesium Earth Canvas */}
      <div ref={containerRef} className="globe-canvas" />

      {/* ── Top Search Bar (Matching Reference Image) ─────────────── */}
      <div className="globe-search-wrapper">
        <form onSubmit={handleSearchSubmit} className="globe-search-bar">
          <Search size={15} className="globe-search-icon" />
          <input
            type="text"
            className="globe-search-input"
            placeholder="Search any airport, city, or coordinate (e.g. SFO, Delhi Airport, Kaziranga)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
          />
          {searchQuery && (
            <button
              type="button"
              className="globe-search-clear"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setSearchOpen(false);
              }}
            >
              <X size={13} />
            </button>
          )}
          <button type="submit" className="globe-search-submit" disabled={isSearching}>
            {isSearching ? "Flying…" : "Jump"}
          </button>
        </form>

        {/* Search Results Dropdown */}
        {searchOpen && searchResults.length > 0 && (
          <div className="globe-search-dropdown">
            {searchResults.map((res, i) => (
              <button
                key={i}
                type="button"
                className="globe-search-item"
                onClick={() => selectSearchResult(res)}
              >
                <MapPin size={13} className="globe-search-item-pin" />
                <span className="globe-search-item-text">{res.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Top-Left: Hero Overlay (Matching Reference Image) ──────── */}
      <div className="globe-hud__hero">
        <div className="globe-hud__tag">
          <span className="globe-hud__tag-line" />
          <span>SATELLITE INTELLIGENCE</span>
        </div>
        <h1 className="globe-hud__title">A clearer planet.</h1>
        <p className="globe-hud__subtitle">
          Turn satellite data into real-world decisions.
        </p>

        {/* Airport & Location Fast-Jump Chips */}
        <div className="globe-hud__quick-targets">
          <span className="globe-hud__chips-label">Quick Zoom:</span>
          {QUICK_PRESETS.slice(1).map((preset) => (
            <button
              key={preset.name}
              onClick={() => flyToPreset(preset)}
              className="globe-hud__target-chip"
              title={`Zoom directly to ${preset.name}`}
            >
              {preset.isAirport ? <Plane size={11} color="#38bdf8" /> : <Sparkles size={10} color="#22d3ee" />}
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Top-Right: Coordinates & Status Badges ────────────────── */}
      <div className="globe-hud__telemetry">
        <div className="globe-hud__coords">
          <Navigation size={13} className="globe-hud__compass-icon" />
          <span className="globe-hud__date">{todayDate}</span>
          <span className="globe-hud__coords-divider">•</span>
          <span className="globe-hud__coords-val">{coords.lat}, {coords.lon}</span>
          <span className="globe-hud__coords-divider">•</span>
          <span className="globe-hud__alt">{coords.heightKm}</span>
        </div>
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
      </div>

      {/* ── Bottom-Left: Live Satellite Feed Card ──────────────────── */}
      <div className={`globe-hud__feed-card ${feedExpanded ? "globe-hud__feed-card--expanded" : ""}`}>
        <div className="globe-hud__feed-header">
          <div>
            <div className="globe-hud__feed-title">Live Satellite Feed</div>
            <div className="globe-hud__feed-sub">
              <span className="globe-pill__dot globe-pill__dot--live" />
              <span>4 satellites active in orbit</span>
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
          <img
            src="/images/satellite_feed_preview.jpg"
            alt="Real-time Satellite Feed"
            className="globe-hud__feed-img"
          />
          <div className="globe-hud__feed-scanline" />
          <div className="globe-hud__feed-badge">
            <span className="globe-hud__feed-sat-name">Sentinel-2A</span>
            <span className="globe-hud__feed-dot">•</span>
            <span>10:24 UTC</span>
            <span className="globe-hud__feed-dot">•</span>
            <span>10 m GSD</span>
            <div className="globe-hud__feed-signal" title="Signal: 98% Strong">
              <span className="signal-bar signal-bar--1" />
              <span className="signal-bar signal-bar--2" />
              <span className="signal-bar signal-bar--3" />
              <span className="signal-bar signal-bar--4" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom-Center: Mission Exploration Dock ────────────────── */}
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

      {/* ── Floating 3D Globe Navigation Controls ──────────────────── */}
      <div className="globe-controls">
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
          onClick={() => setAutoRotate(!autoRotate)}
          className={`globe-ctrl-btn ${autoRotate ? "globe-ctrl-btn--active" : ""}`}
          title={autoRotate ? "Pause Earth Rotation" : "Auto-Rotate Earth"}
        >
          <RotateCw size={15} />
        </button>
        <div className="globe-ctrl-divider" />
        <button
          onClick={() => switchBasemap(activeBasemap === "google" ? "esri" : "google")}
          className={`globe-ctrl-btn ${activeBasemap === "google" ? "globe-ctrl-btn--active" : ""}`}
          title={`Active: ${activeBasemap === "google" ? "Google Satellite HD" : "Esri Satellite"} (Click to toggle)`}
        >
          <Layers size={15} />
        </button>
        <button
          onClick={toggleLabels}
          className={`globe-ctrl-btn ${showLabels ? "globe-ctrl-btn--active" : ""}`}
          title={showLabels ? "Hide Map Labels" : "Show Map Labels"}
        >
          <MapPin size={15} />
        </button>
        <div className="globe-ctrl-divider" />
        <button onClick={handleZoomIn} className="globe-ctrl-btn" title="Zoom In (+)">
          <Plus size={16} />
        </button>
        <button onClick={handleZoomOut} className="globe-ctrl-btn" title="Zoom Out (-)">
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}
