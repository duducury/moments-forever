"use client";

import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import styles from "./passaporte.module.css";

const COUNTRIES_GEOJSON =
  "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson";

const TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png";

function tileUrls(): string[] {
  return ["a", "b", "c", "d"].map((sub) => TILES.replace("{s}", sub));
}

function isoFromFeature(properties: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  const raw =
    properties.iso_a2 ??
    properties.ISO_A2 ??
    properties.ISO_A2_EH ??
    properties.ADM0_A2;
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code || code === "-99" || code.length !== 2) return null;
  return code;
}

export function PassportWorldMap({
  visitedCodes,
  onSelectCountry,
}: {
  readonly visitedCodes: readonly string[];
  readonly onSelectCountry: (code: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const visitedRef = useRef(new Set(visitedCodes));
  const onSelectRef = useRef(onSelectCountry);
  visitedRef.current = new Set(visitedCodes);
  onSelectRef.current = onSelectCountry;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: tileUrls(),
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
          countries: {
            type: "geojson",
            data: COUNTRIES_GEOJSON,
          },
        },
        layers: [
          { id: "basemap", type: "raster", source: "basemap" },
          {
            id: "country-fill",
            type: "fill",
            source: "countries",
            paint: {
              "fill-color": "#d08a6e",
              "fill-opacity": 0,
            },
          },
          {
            id: "country-line",
            type: "line",
            source: "countries",
            paint: {
              "line-color": "#d08a6e",
              "line-width": 0.6,
              "line-opacity": 0.15,
            },
          },
        ],
      },
      center: [12, 18],
      zoom: 1.15,
      minZoom: 0.8,
      maxZoom: 6,
      attributionControl: { compact: true },
    });

    function paintVisited() {
      const visited = visitedRef.current;
      map.setPaintProperty("country-fill", "fill-opacity", [
        "case",
        [
          "in",
          ["upcase", ["coalesce", ["get", "iso_a2"], ["get", "ISO_A2"], ""]],
          ["literal", [...visited]],
        ],
        0.55,
        0,
      ]);
      map.setPaintProperty("country-line", "line-opacity", [
        "case",
        [
          "in",
          ["upcase", ["coalesce", ["get", "iso_a2"], ["get", "ISO_A2"], ""]],
          ["literal", [...visited]],
        ],
        0.9,
        0.12,
      ]);
    }

    map.on("load", () => {
      paintVisited();
      map.resize();
    });

    map.on("click", "country-fill", (event) => {
      const feature = event.features?.[0];
      const code = isoFromFeature(
        (feature?.properties ?? null) as Record<string, unknown> | null,
      );
      if (!code || !visitedRef.current.has(code)) return;
      onSelectRef.current(code);
    });

    map.on("mouseenter", "country-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "country-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    map.setPaintProperty("country-fill", "fill-opacity", [
      "case",
      [
        "in",
        ["upcase", ["coalesce", ["get", "iso_a2"], ["get", "ISO_A2"], ""]],
        ["literal", [...visitedCodes]],
      ],
      0.55,
      0,
    ]);
  }, [visitedCodes]);

  return <div className={styles.worldMap} ref={containerRef} />;
}
