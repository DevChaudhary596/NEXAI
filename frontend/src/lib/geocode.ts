/**
 * Shared place search, backed by OpenStreetMap's free Nominatim geocoder —
 * no API key/account needed, consistent with the rest of the map stack
 * (ESRI/OSM basemaps, OSM-based Cesium view). Used by both the 2D search
 * box (MapSearch.tsx) and the 3D view's Cesium geocoder (Cesium3DView.tsx),
 * so results and behavior stay identical across the two views.
 *
 * See https://nominatim.org/release-docs/latest/api/Search/ for the
 * response shape and usage-policy limits (light, interactive use only —
 * this is a single user-triggered request per search, not bulk geocoding).
 */

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  /** [south, north, west, east], degrees — present for most named places/areas. */
  boundingBox?: [number, number, number, number];
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

export async function searchPlaces(
  query: string,
  limit = 5
): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&limit=${limit}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return [];

  const results: NominatimResult[] = await response.json();

  return results.map((result) => ({
    displayName: result.display_name,
    lat: Number(result.lat),
    lon: Number(result.lon),
    boundingBox: result.boundingbox
      ? (result.boundingbox.map(Number) as [number, number, number, number])
      : undefined,
  }));
}
