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
  Sparkles,
} from "lucide-react";
import type { FeatureCollection, FeatureSource } from "@/types";
import { getTileUrl } from "@/lib/api";
import { searchPlaces } from "@/lib/geocode";

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

/** Quick fly-to targets for demo */
const QUICK_PRESETS = [
  { name: "Global View", lon: 78.9629, lat: 20.5937, height: 16000000, pitch: -90 },
  { name: "Punjab Farmland", lon: 75.83, lat: 30.78, height: 18000, pitch: -45 },
  { name: "Kaziranga Basin", lon: 93.17, lat: 26.58, height: 28000, pitch: -40 },
  { name: "Mumbai JNPT Port", lon: 72.95, lat: 18.95, height: 14000, pitch: -42 },
  { name: "Delhi Indira Gandhi", lon: 77.10, lat: 28.56, height: 16000, pitch: -40 },
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

class NominatimGeocoderService implements Cesium.GeocoderService {
  credit: Cesium.Credit | undefined = new Cesium.Credit(
    "Search by OpenStreetMap Nominatim",
    false
  );

  async geocode(query: string): Promise<Cesium.GeocoderService.Result[]> {
    const results = await searchPlaces(query);
    return results.map((result) => {
      const destination: Cesium.Rectangle | Cesium.Cartesian3 =
        result.boundingBox
          ? Cesium.Rectangle.fromDegrees(
              result.boundingBox[2],
              result.boundingBox[0],
              result.boundingBox[3],
              result.boundingBox[1]
            )
          : Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 10000);
      return { displayName: result.displayName, destination };
    });
  }
}

export default function Cesium3DView({
  sceneId,
  sceneBounds,
  geojson,
}: Cesium3DViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
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
  const [autoRotate, setAutoRotate] = useState(true);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [todayDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  });

  // Initialize the Photorealistic Cesium 3D Globe with Space Environment
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    // High-resolution, cloud-free true-color satellite imagery from Esri World Imagery (ArcGIS)
    const esriImagery = new Cesium.UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maximumLevel: 19,
      credit: new Cesium.Credit("Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"),
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: new Cesium.ImageryLayer(esriImagery),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      timeline: false,
      animation: false,
      sceneModePicker: false,
      baseLayerPicker: false,
      geocoder: [new NominatimGeocoderService()],
      homeButton: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    });

    // ── Space & Atmospheric Aesthetics (Matching Reference Image) ────────
    const scene = viewer.scene;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#030712");
    scene.globe.baseColor = Cesium.Color.fromCssColorString("#030712");
    scene.globe.enableLighting = false; // Ensures full globe satellite imagery is brightly lit
    scene.globe.showGroundAtmosphere = true;
    scene.globe.atmosphereLightIntensity = 3.8;

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

    // Initial dramatic perspective of Earth from orbit
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, 16000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-88),
        roll: 0.0,
      },
    });

    // Data source for AI detections/segmentations
    const resultsDataSource = new Cesium.CustomDataSource("results");
    viewer.dataSources.add(resultsDataSource);
    resultsDataSourceRef.current = resultsDataSource;

    // Data source for Orbiting Satellites
    const satellitesDataSource = new Cesium.CustomDataSource("satellites");
    viewer.dataSources.add(satellitesDataSource);
    satellitesDataSourceRef.current = satellitesDataSource;

    // ── Orbit Trajectories & Animated Satellites ─────────────────────────
    const currentAnomalies: Record<string, number> = {};

    ORBITING_SATELLITES.forEach((sat) => {
      currentAnomalies[sat.id] = sat.initialAnomalyDeg;

      // 1. Draw glowing dashed orbital trajectory path encircling Earth
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

      // 2. Add satellite entity with real-time dynamic positioning
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

      // Update satellite orbital anomalies
      ORBITING_SATELLITES.forEach((sat) => {
        currentAnomalies[sat.id] =
          (currentAnomalies[sat.id] + sat.speedDegPerSec * deltaSec * 35) % 360;
      });

      // Gentle auto-rotation when zoomed far out in space
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
      const hStr = h >= 1000000 ? `${(h / 1000000).toFixed(1)}M m` : `${(h / 1000).toFixed(0)} km`;
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
  }, [autoRotate]);

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
    const range = Math.max(sceneDiagonal * 2.2, 400);

    viewer.flyTo(frameEntity, {
      duration: 1.8,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(-20),
        Cesium.Math.toRadians(-38),
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
    viewerRef.current.camera.zoomIn(viewerRef.current.camera.positionCartographic.height * 0.35);
  };

  const handleZoomOut = () => {
    if (!viewerRef.current) return;
    viewerRef.current.camera.zoomOut(viewerRef.current.camera.positionCartographic.height * 0.45);
  };

  const handleResetSpaceView = () => {
    flyToPreset(QUICK_PRESETS[0]);
  };

  const handleToggleTilt = () => {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const currentPitch = Cesium.Math.toDegrees(camera.pitch);
    const newPitch = currentPitch < -70 ? -40 : -90;
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

        {/* Quick Location Fly-to Pills */}
        <div className="globe-hud__quick-targets">
          {QUICK_PRESETS.slice(1).map((preset) => (
            <button
              key={preset.name}
              onClick={() => flyToPreset(preset)}
              className="globe-hud__target-chip"
            >
              <Sparkles size={10} color="#22d3ee" />
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
