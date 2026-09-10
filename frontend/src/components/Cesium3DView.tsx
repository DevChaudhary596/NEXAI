"use client";

import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { FeatureCollection, FeatureSource } from "@/types";
import { getTileUrl } from "@/lib/api";
import { searchPlaces } from "@/lib/geocode";

// Cesium reads this once, at first use, to locate its web workers/assets —
// must be set before any Cesium code runs. The files themselves are copied
// into public/cesium by scripts/copy-cesium-assets.mjs (see package.json
// "postinstall"), since Cesium's own build tooling assumes a webpack
// CopyPlugin step that Turbopack doesn't support.
if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";
}

interface Cesium3DViewProps {
  sceneId: string | null;
  sceneBounds: number[] | null;
  geojson: FeatureCollection | null;
}

/** Extrusion height (metres) per feature source, scaled by confidence/score. */
const EXTRUSION_HEIGHT: Record<FeatureSource, number> = {
  detection: 25, // buildings/vehicles/ships — read as real 3D structures
  segmentation: 4, // land-cover masks — a slight raised footprint
  spectral: 8, // NDVI/NDWI/NDBI — a heatmap-like bump proportional to intensity
};

const SOURCE_COLOR: Record<FeatureSource, [number, number, number]> = {
  detection: [251, 146, 60], // amber
  segmentation: [52, 211, 153], // green
  spectral: [96, 165, 250], // blue
};

/**
 * Google-Earth-style place search, backed by the shared Nominatim helper
 * (@/lib/geocode) instead of Cesium Ion's geocoder (which needs a
 * paid/registered token). Wired into the Viewer's built-in `geocoder` UI
 * via the GeocoderService interface, so it gets Cesium's native search
 * box, dropdown, and fly-to behavior for free. The 2D view's search box
 * (MapSearch.tsx) uses the same underlying helper, so results match.
 */
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
  const [ready, setReady] = useState(false);

  // Initialize the Cesium viewer once.
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const osm = new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayer: new Cesium.ImageryLayer(osm),
      // No Cesium Ion token configured — a flat ellipsoid keeps this
      // prototype token-free. Swap in Cesium.createWorldTerrainAsync()
      // (needs an Ion token) for real elevation later.
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
    viewer.scene.globe.enableLighting = false;

    const resultsDataSource = new Cesium.CustomDataSource("results");
    viewer.dataSources.add(resultsDataSource);

    viewerRef.current = viewer;
    resultsDataSourceRef.current = resultsDataSource;
    setReady(true);

    return () => {
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
      resultsDataSourceRef.current = null;
      setReady(false);
    };
  }, []);

  // Drape the uploaded scene over its real-world footprint, and give it a
  // visible 3D presence — a raised wall around its perimeter — since the
  // drape itself is just a flat texture on the ground and the underlying
  // terrain here is flat too. Without this, "3D view" from directly
  // overhead is indistinguishable from the 2D map.
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
      // The tile endpoint itself has no notion of a max zoom for a given
      // scene; cap it so Cesium doesn't request pyramid levels the source
      // raster can't usefully support.
      maximumLevel: 19,
    });

    sceneLayerRef.current = viewer.imageryLayers.addImageryProvider(sceneProvider);

    // A short "display case" wall traced around the scene's perimeter, tall
    // enough to read clearly once the camera is tilted.
    const wallHeight = 18;
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

    // Fly to an oblique angle rather than straight down — a top-down view
    // of a flat drape on flat terrain looks identical to the 2D map no
    // matter how it's rendered. Range is a multiple of the scene's own
    // diagonal size (not 0/auto-fit) so the initial view shows real
    // surrounding city/terrain to explore, not just a tight crop of the
    // scene itself sitting in isolation.
    const sw = Cesium.Cartesian3.fromDegrees(west, south);
    const ne = Cesium.Cartesian3.fromDegrees(east, north);
    const sceneDiagonal = Cesium.Cartesian3.distance(sw, ne);
    const range = Math.max(sceneDiagonal * 2.5, 300);

    viewer.flyTo(frameEntity, {
      duration: 1.2,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(-25),
        Cesium.Math.toRadians(-35),
        range
      ),
    });
  }, [ready, sceneId, sceneBounds]);

  // Extrude the current query's detection/segmentation/spectral results.
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
      const color = Cesium.Color.fromBytes(r, g, b, 200);

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
            topRadius: 6,
            bottomRadius: 6,
            material: color,
            outline: true,
            outlineColor: Cesium.Color.fromBytes(r, g, b, 255),
          },
        });
      }
    }
  }, [ready, geojson]);

  return (
    <div className="map-panel">
      <div ref={containerRef} className="map-panel__container" />
    </div>
  );
}
