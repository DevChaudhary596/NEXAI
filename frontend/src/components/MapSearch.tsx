"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { searchPlaces, type GeocodeResult } from "@/lib/geocode";

interface MapSearchProps {
  map: L.Map | null;
}

/**
 * Google-Earth-style place search for the 2D Leaflet view — the same
 * Nominatim-backed search available in the 3D Cesium view (via its native
 * geocoder widget), reimplemented here since Leaflet has no equivalent
 * built in. Keeping both views' search on the same @/lib/geocode helper
 * means a query gives the same result in either view.
 */
export default function MapSearch({ map }: MapSearchProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set right before setQuery() in flyToResult, so selecting a result
  // (which sets `query` to its full display name) doesn't re-trigger a
  // search-as-you-type for the address we just navigated to.
  const suppressSearchRef = useRef(false);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  // Debounced search-as-you-type. An empty query naturally shows no
  // results via `visibleResults` below — no setState needed for that case.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    if (!query.trim()) return;

    debounceRef.current = setTimeout(async () => {
      const found = await searchPlaces(query);
      setResults(found);
      setActiveIndex(0);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const visibleResults = query.trim() ? results : [];

  // Collapse on outside click.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  const flyToResult = useCallback(
    (result: GeocodeResult) => {
      if (!map) return;
      if (result.boundingBox) {
        const [south, north, west, east] = result.boundingBox;
        map.flyToBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [40, 40], maxZoom: 16 }
        );
      } else {
        map.flyTo([result.lat, result.lon], 14);
      }
      suppressSearchRef.current = true;
      setQuery(result.displayName);
      setResults([]);
      setExpanded(false);
    },
    [map]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setExpanded(false);
      return;
    }
    if (!visibleResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + visibleResults.length) % visibleResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      flyToResult(visibleResults[activeIndex]);
    }
  };

  return (
    <div className="map-search" ref={containerRef}>
      <motion.div
        className="map-search__box"
        animate={{ width: expanded ? 280 : 36 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {expanded && (
          <input
            ref={inputRef}
            className="map-search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search a place or address…"
          />
        )}
        <button
          className="map-search__toggle"
          onClick={() => {
            if (expanded && query) {
              setQuery("");
              setResults([]);
              inputRef.current?.focus();
            } else {
              setExpanded((v) => !v);
            }
          }}
          aria-label={expanded ? "Clear search" : "Search"}
        >
          {expanded && query ? <X size={15} /> : <Search size={15} />}
        </button>
      </motion.div>

      <AnimatePresence>
        {expanded && visibleResults.length > 0 && (
          <motion.ul
            className="map-search__results"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {visibleResults.map((result, i) => (
              <li
                key={`${result.lat}-${result.lon}-${i}`}
                className={`map-search__result ${
                  i === activeIndex ? "map-search__result--active" : ""
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => flyToResult(result)}
              >
                {result.displayName}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
