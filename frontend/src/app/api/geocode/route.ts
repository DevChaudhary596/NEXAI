import { NextRequest, NextResponse } from "next/server";

export interface GeocodeItem {
  displayName: string;
  lat: number;
  lon: number;
  boundingBox?: [number, number, number, number];
}

// Built-in offline dictionary for world landmarks, airports, and major cities
const POPULAR_LOCATIONS: Record<string, { lat: number; lon: number; name: string; span?: number }> = {
  // Major Indian Cities & Hubs
  mumbai: { lat: 19.076, lon: 72.8777, name: "Mumbai, Maharashtra, India", span: 0.15 },
  bombay: { lat: 19.076, lon: 72.8777, name: "Mumbai, Maharashtra, India", span: 0.15 },
  delhi: { lat: 28.6139, lon: 77.209, name: "New Delhi, Delhi, India", span: 0.18 },
  "new delhi": { lat: 28.6139, lon: 77.209, name: "New Delhi, Delhi, India", span: 0.18 },
  bengaluru: { lat: 12.9716, lon: 77.5946, name: "Bengaluru, Karnataka, India", span: 0.15 },
  bangalore: { lat: 12.9716, lon: 77.5946, name: "Bengaluru, Karnataka, India", span: 0.15 },
  hyderabad: { lat: 17.385, lon: 78.4867, name: "Hyderabad, Telangana, India", span: 0.15 },
  chennai: { lat: 13.0827, lon: 80.2707, name: "Chennai, Tamil Nadu, India", span: 0.15 },
  kolkata: { lat: 22.5726, lon: 88.3639, name: "Kolkata, West Bengal, India", span: 0.15 },
  pune: { lat: 18.5204, lon: 73.8567, name: "Pune, Maharashtra, India", span: 0.12 },
  ahmedabad: { lat: 23.0225, lon: 72.5714, name: "Ahmedabad, Gujarat, India", span: 0.12 },
  jaipur: { lat: 26.9124, lon: 75.7873, name: "Jaipur, Rajasthan, India", span: 0.12 },
  goa: { lat: 15.2993, lon: 74.124, name: "Goa, India", span: 0.35 },
  lucknow: { lat: 26.8467, lon: 80.9462, name: "Lucknow, Uttar Pradesh, India", span: 0.12 },
  chandigarh: { lat: 30.7333, lon: 76.7794, name: "Chandigarh, India", span: 0.1 },
  bhopal: { lat: 23.2599, lon: 77.4126, name: "Bhopal, Madhya Pradesh, India", span: 0.12 },
  surat: { lat: 21.1702, lon: 72.8311, name: "Surat, Gujarat, India", span: 0.12 },

  // Major Global Cities & Financial Capitals
  london: { lat: 51.5074, lon: -0.1278, name: "London, England, United Kingdom", span: 0.15 },
  "new york": { lat: 40.7128, lon: -74.006, name: "New York City, NY, United States", span: 0.15 },
  nyc: { lat: 40.7128, lon: -74.006, name: "New York City, NY, United States", span: 0.15 },
  paris: { lat: 48.8566, lon: 2.3522, name: "Paris, Île-de-France, France", span: 0.12 },
  tokyo: { lat: 35.6762, lon: 139.6503, name: "Tokyo, Japan", span: 0.2 },
  dubai: { lat: 25.2048, lon: 55.2708, name: "Dubai, United Arab Emirates", span: 0.18 },
  singapore: { lat: 1.3521, lon: 103.8198, name: "Singapore", span: 0.15 },
  sydney: { lat: -33.8688, lon: 151.2093, name: "Sydney, NSW, Australia", span: 0.15 },
  berlin: { lat: 52.52, lon: 13.405, name: "Berlin, Germany", span: 0.15 },
  cairo: { lat: 30.0444, lon: 31.2357, name: "Cairo, Egypt", span: 0.15 },
  beijing: { lat: 39.9042, lon: 116.4074, name: "Beijing, China", span: 0.2 },
  shanghai: { lat: 31.2304, lon: 121.4737, name: "Shanghai, China", span: 0.2 },
  "san francisco": { lat: 37.7749, lon: -122.4194, name: "San Francisco, CA, United States", span: 0.1 },
  sfo: { lat: 37.6189, lon: -122.375, name: "San Francisco International Airport (SFO)", span: 0.05 },
  losangeles: { lat: 34.0522, lon: -118.2437, name: "Los Angeles, CA, United States", span: 0.25 },
  "los angeles": { lat: 34.0522, lon: -118.2437, name: "Los Angeles, CA, United States", span: 0.25 },
  chicago: { lat: 41.8781, lon: -87.6298, name: "Chicago, IL, United States", span: 0.15 },
  toronto: { lat: 43.6532, lon: -79.3832, name: "Toronto, Ontario, Canada", span: 0.15 },
  seoul: { lat: 37.5665, lon: 126.978, name: "Seoul, South Korea", span: 0.15 },
  bangkok: { lat: 13.7563, lon: 100.5018, name: "Bangkok, Thailand", span: 0.18 },
  rome: { lat: 41.9028, lon: 12.4964, name: "Rome, Italy", span: 0.12 },
  madrid: { lat: 40.4168, lon: -3.7038, name: "Madrid, Spain", span: 0.12 },
  moscow: { lat: 55.7558, lon: 37.6173, name: "Moscow, Russia", span: 0.2 },
  riyadh: { lat: 24.7136, lon: 46.6753, name: "Riyadh, Saudi Arabia", span: 0.18 },
  doha: { lat: 25.2854, lon: 51.531, name: "Doha, Qatar", span: 0.12 },
};

function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const clean = query.trim();

  // DMS format: 19.0896° N, 72.8656° E or 19.0896N 72.8656E
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim() || "";
  const limit = parseInt(searchParams.get("limit") || "5", 10);

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  // 1. Check if the user typed direct geographic coordinates
  const coords = parseCoordinates(q);
  if (coords) {
    const latDir = coords.lat >= 0 ? "N" : "S";
    const lonDir = coords.lon >= 0 ? "E" : "W";
    const span = 0.04;
    return NextResponse.json({
      results: [
        {
          displayName: `Coordinates: ${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lon).toFixed(4)}° ${lonDir}`,
          lat: coords.lat,
          lon: coords.lon,
          boundingBox: [coords.lat - span, coords.lat + span, coords.lon - span, coords.lon + span],
        },
      ],
    });
  }

  // 2. Check offline popular landmarks & cities dictionary for instant 0ms match
  const qLower = q.toLowerCase();
  if (POPULAR_LOCATIONS[qLower]) {
    const loc = POPULAR_LOCATIONS[qLower];
    const span = loc.span || 0.1;
    return NextResponse.json({
      results: [
        {
          displayName: loc.name,
          lat: loc.lat,
          lon: loc.lon,
          boundingBox: [loc.lat - span, loc.lat + span, loc.lon - span, loc.lon + span],
        },
      ],
    });
  }

  // 3. Query OpenStreetMap Nominatim with a valid server User-Agent (prevents 403 Forbidden)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      q
    )}&limit=${limit}`;

    const res = await fetch(nominatimUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "SatQuery-AI-Geocoding/1.0 (contact@satquery.ai)",
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const results: GeocodeItem[] = data.map((item: any) => ({
          displayName: item.display_name,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          boundingBox: item.boundingbox ? item.boundingbox.map(Number) : undefined,
        }));
        return NextResponse.json({ results });
      }
    }
  } catch (err) {
    console.warn("Nominatim geocode fetch failed or timed out:", err);
  }

  // 4. Fallback: Komoot Photon geocoder (fast, open, free, no rate limits)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`;
    const res = await fetch(photonUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data?.features && Array.isArray(data.features) && data.features.length > 0) {
        const results: GeocodeItem[] = data.features.map((feat: any) => {
          const [lon, lat] = feat.geometry.coordinates;
          const props = feat.properties || {};
          const labelParts = [props.name, props.city, props.state, props.country].filter(Boolean);
          const displayName = labelParts.join(", ") || q;
          const span = 0.05;
          return {
            displayName,
            lat,
            lon,
            boundingBox: [lat - span, lat + span, lon - span, lon + span],
          };
        });
        return NextResponse.json({ results });
      }
    }
  } catch (err) {
    console.warn("Photon geocode fallback failed:", err);
  }

  // 5. Partial match check on popular locations dictionary
  const partialMatch = Object.keys(POPULAR_LOCATIONS).find((k) => qLower.includes(k) || k.includes(qLower));
  if (partialMatch) {
    const loc = POPULAR_LOCATIONS[partialMatch];
    const span = loc.span || 0.1;
    return NextResponse.json({
      results: [
        {
          displayName: loc.name,
          lat: loc.lat,
          lon: loc.lon,
          boundingBox: [loc.lat - span, loc.lat + span, loc.lon - span, loc.lon + span],
        },
      ],
    });
  }

  return NextResponse.json({ results: [] });
}
