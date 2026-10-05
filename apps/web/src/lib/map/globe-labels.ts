import type { LayerSpecification } from "maplibre-gl";

/**
 * The geography of the immersive globe: flat, colourful countries on a blue
 * ocean (no photo texture, no streets), discreet country borders and a handful
 * of names in Portuguese (countries, cities, regions). Data comes from public/geo/*.json (see scripts/build-globe-geo.mjs);
 * each place carries a tier — 1 is the most important — and the tier decides
 * from which zoom its layer exists. Within a tier MapLibre's collision
 * detection keeps the more important names (lower `s`) and drops overlaps, so
 * the globe never fills up with text.
 *
 * Draw order matters: MapLibre places labels from the top layer down, so
 * cities win over country names, which win over regions.
 */

export const GEO_DATA_VERSION = "v1";

export type PlaceTier = 1 | 2 | 3 | 4;

/** First zoom at which each tier of countries / cities / regions appears. */
export const COUNTRY_TIER_MIN_ZOOM: Readonly<Record<PlaceTier, number>> = { 1: 1.1, 2: 2.4, 3: 3.6, 4: 4.8 };
export const CITY_TIER_MIN_ZOOM: Readonly<Record<PlaceTier, number>> = { 1: 2.2, 2: 3.4, 3: 4.4, 4: 5.6 };
export const REGION_TIER_MIN_ZOOM: Readonly<Record<1 | 2, number>> = { 1: 3.9, 2: 4.9 };

/** Country names give way to regions/cities once the camera is over a region. */
export const COUNTRY_NAMES_FADE: readonly [number, number] = [5.4, 6.4];

export const CITY_DOT_IMAGE = "globe-city-dot";

/**
 * Simple, friendly land colours. The data gives every country an index into
 * this list such that neighbours never share one; the last entry is the ice of
 * Antarctica.
 */
export const LAND_PALETTE = [
  "#7dbb6e", // green
  "#e8c765", // sand
  "#e49d68", // orange
  "#dc8696", // rose
  "#a094d6", // lavender
  "#63b8b4", // teal
  "#eef4fb", // ice
] as const;
export const OCEAN_COLOR = "#2b69bb";

/** Ocean and flat country colours (the base of the globe), under borders and labels. */
export function buildGlobeLandLayers(): LayerSpecification[] {
  const byIndex: unknown[] = [];
  LAND_PALETTE.forEach((color, index) => byIndex.push(index, color));
  return [
    { id: "globe-ocean", type: "background", paint: { "background-color": OCEAN_COLOR } },
    {
      id: "globe-land",
      type: "fill",
      source: "globe-land",
      paint: {
        "fill-color": ["match", ["get", "c"], ...byIndex, LAND_PALETTE[0]] as never,
        "fill-antialias": true,
      },
    },
  ];
}

const FONT_COUNTRY = ["NotoSans-SemiBold"];
const FONT_TEXT = ["NotoSans-Regular"];
/** Dark text with a soft white halo reads on every land colour and on the ocean. */
const TEXT_COLOR = "#14233a";
const HALO = "rgba(255, 255, 255, 0.85)";

const kindTier = (kind: string, tier: number) =>
  ["all", ["==", ["get", "k"], kind], ["==", ["get", "t"], tier]] as never;

/**
 * Layers to add above the land: borders, then labels from the least to
 * the most important (see the note on draw order above). `source` ids are the
 * ones the globe style defines.
 */
export function buildGlobeLabelLayers(): LayerSpecification[] {
  const layers: LayerSpecification[] = [
    {
      id: "globe-borders",
      type: "line",
      source: "globe-borders",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 3, 0.4, 6, 0.5],
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.35, 4, 0.7, 7, 1.1],
      },
    },
  ];

  for (const tier of [2, 1] as const) {
    layers.push({
      id: `globe-regions-t${tier}`,
      type: "symbol",
      source: "globe-places",
      minzoom: REGION_TIER_MIN_ZOOM[tier],
      filter: kindTier("region", tier),
      layout: {
        "text-field": ["get", "n"],
        "text-font": FONT_TEXT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3.9, 9.5, 7, 12],
        "text-letter-spacing": 0.08,
        "text-transform": "uppercase",
        "text-max-width": 7,
        "text-padding": 10,
        "symbol-sort-key": ["get", "s"],
      },
      paint: {
        "text-color": TEXT_COLOR,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], REGION_TIER_MIN_ZOOM[tier], 0, REGION_TIER_MIN_ZOOM[tier] + 0.3, 0.72],
        "text-halo-color": HALO,
        "text-halo-width": 1.3,
        "text-halo-blur": 0.3,
      },
    });
  }

  for (const tier of [4, 3, 2, 1] as const) {
    layers.push({
      id: `globe-countries-t${tier}`,
      type: "symbol",
      source: "globe-places",
      minzoom: COUNTRY_TIER_MIN_ZOOM[tier],
      maxzoom: COUNTRY_NAMES_FADE[1],
      filter: kindTier("country", tier),
      layout: {
        "text-field": ["get", "n"],
        "text-font": FONT_COUNTRY,
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 3, 11, 5, 12.5],
        "text-letter-spacing": 0.14,
        "text-transform": "uppercase",
        "text-max-width": 7,
        "text-padding": 8,
        "symbol-sort-key": ["get", "s"],
      },
      paint: {
        "text-color": TEXT_COLOR,
        "text-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          COUNTRY_TIER_MIN_ZOOM[tier],
          0,
          COUNTRY_TIER_MIN_ZOOM[tier] + 0.25,
          0.92,
          COUNTRY_NAMES_FADE[0],
          0.92,
          COUNTRY_NAMES_FADE[1],
          0,
        ],
        "text-halo-color": HALO,
        "text-halo-width": 1.5,
        "text-halo-blur": 0.3,
      },
    });
  }

  for (const tier of [4, 3, 2, 1] as const) {
    layers.push({
      id: `globe-cities-t${tier}`,
      type: "symbol",
      source: "globe-places",
      minzoom: CITY_TIER_MIN_ZOOM[tier],
      filter: kindTier("city", tier),
      layout: {
        // The dot and the name live and die together: no name, no dot.
        "icon-image": CITY_DOT_IMAGE,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 5, 0.55],
        "icon-optional": false,
        "text-field": ["get", "n"],
        "text-font": FONT_TEXT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10.5, 5, 12.5],
        "text-anchor": "left",
        "text-offset": [0.75, 0],
        "text-optional": false,
        "text-max-width": 9,
        "text-padding": 6,
        "symbol-sort-key": ["get", "s"],
      },
      paint: {
        "text-color": TEXT_COLOR,
        "text-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          CITY_TIER_MIN_ZOOM[tier],
          0,
          CITY_TIER_MIN_ZOOM[tier] + 0.25,
          0.92,
        ],
        "text-halo-color": HALO,
        "text-halo-width": 1.5,
        "text-halo-blur": 0.3,
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          CITY_TIER_MIN_ZOOM[tier],
          0,
          CITY_TIER_MIN_ZOOM[tier] + 0.25,
          0.95,
        ],
      },
    });
  }

  return layers;
}

/** A small dark dot with a white rim, so it reads on every land colour and on the sea. */
export function createCityDotImage(size = 24): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  const dotRadius = size * 0.26;
  const rimRadius = size * 0.4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centre, y - centre);
      const i = (y * size + x) * 4;
      const dot = Math.min(1, Math.max(0, dotRadius + 0.5 - distance));
      const rim = Math.min(1, Math.max(0, rimRadius + 0.5 - distance)) * 0.9;
      const alpha = dot + rim * (1 - dot);
      const lightness = dot / Math.max(alpha, 0.001);
      // lightness 1 = the dark core (#14233a), 0 = the white rim.
      data[i] = Math.round(0x14 * lightness + 255 * (1 - lightness));
      data[i + 1] = Math.round(0x23 * lightness + 255 * (1 - lightness));
      data[i + 2] = Math.round(0x3a * lightness + 255 * (1 - lightness));
      data[i + 3] = Math.round(255 * alpha);
    }
  }
  return { width: size, height: size, data };
}
