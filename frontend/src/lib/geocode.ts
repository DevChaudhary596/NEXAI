/**
 * Shared place and coordinate search.
 * Supports direct lat/lon coordinates, popular offline landmarks,
 * and high-speed geocoding via server-side /api/geocode proxy.
 */

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lon: number;
  /** [south, north, west, east], degrees */
  boundingBox?: [number, number, number, number];
}

export function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const clean = query.trim();

  // DMS format: 19.0896° N, 72.8656° E or 19.0896N, 72.8656E
  const dmsRegex = /([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])/;
  const dmsMatch = clean.match(dmsRegex);
  if (dmsMatch) {
    let lat = parseFloat(dmsMatch[1]);
    if (dmsMatch[2].toUpperCase() === "S") lat = -lat;
    let lon = parseFloat(dmsMatch[3]);
    if (dmsMatch[4].toUpperCase() === "W") lon = -lon;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }

  // Decimal coordinates: 19.0896, 72.8656 or (19.0896, 72.8656) or 19.0896 72.8656
  const numRegex = /^[(\[]?\s*([+-]?\d+(?:\.\d+)?)\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*[)\]]?$/;
  const numMatch = clean.match(numRegex);
  if (numMatch) {
    const v1 = parseFloat(numMatch[1]);
    const v2 = parseFloat(numMatch[2]);
    if (Math.abs(v1) <= 90 && Math.abs(v2) <= 180) {
      return { lat: v1, lon: v2 };
    }
    if (Math.abs(v2) <= 90 && Math.abs(v1) <= 180) {
      return { lat: v2, lon: v1 };
    }
  }

  return null;
}

export async function searchPlaces(
  query: string,
  limit = 5
): Promise<GeocodeResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  // 1. Instant check: If the query is geographic coordinates, resolve instantly with 0ms latency
  const coords = parseCoordinates(clean);
  if (coords) {
    const latDir = coords.lat >= 0 ? "N" : "S";
    const lonDir = coords.lon >= 0 ? "E" : "W";
    const span = 0.04;
    return [
      {
        displayName: `Coordinates: ${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lon).toFixed(4)}° ${lonDir}`,
        lat: coords.lat,
        lon: coords.lon,
        boundingBox: [coords.lat - span, coords.lat + span, coords.lon - span, coords.lon + span],
      },
    ];
  }

  // 2. Call Next.js Server-Side Geocoder (bypasses browser CORS & supplies valid User-Agent)
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(clean)}&limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch (err) {
    console.warn("API geocode route failed, trying direct Photon fallback:", err);
  }

  // 3. Direct Browser Fallback: Komoot Photon (CORS-friendly public geocoder)
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(clean)}&limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.features && Array.isArray(data.features) && data.features.length > 0) {
        return data.features.map((feat: any) => {
          const [lon, lat] = feat.geometry.coordinates;
          const props = feat.properties || {};
          const labelParts = [props.name, props.city, props.state, props.country].filter(Boolean);
          const displayName = labelParts.join(", ") || clean;
          const span = 0.05;
          return {
            displayName,
            lat,
            lon,
            boundingBox: [lat - span, lat + span, lon - span, lon + span],
          };
        });
      }
    }
  } catch {
    // ignore
  }

  return [];
}
