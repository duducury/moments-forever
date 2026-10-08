/**
 * Which map the summary is about: the whole world, only the United States or
 * only Brazil. A region decides, in this order:
 *  1. which trips can be picked (and counted in the stats);
 *  2. which GPS photos feed the map (only photos of those trips);
 *  3. how the map is framed (zoom, insets).
 * Pure data and geometry — no DOM, no drawing.
 */

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";

import type { MapFrame } from "./journey-geo";
import type { JourneyPoint, JourneyStats } from "./journey-summary";

export type JourneyRegion = "world" | "us" | "br";

export interface JourneyRegionOption {
  readonly id: JourneyRegion;
  readonly emoji: string;
  readonly title: string;
  readonly description: string;
  /** ISO country the trips must belong to (null = every country). */
  readonly countryCode: string | null;
}

export const JOURNEY_REGIONS: readonly JourneyRegionOption[] = [
  { id: "world", emoji: "🌎", title: "Mundo", description: "Veja sua jornada pelo mundo inteiro", countryCode: null },
  { id: "us", emoji: "🇺🇸", title: "Estados Unidos", description: "Veja suas viagens pelos Estados Unidos", countryCode: "US" },
  { id: "br", emoji: "🇧🇷", title: "Brasil", description: "Veja suas viagens pelo Brasil", countryCode: "BR" },
];

export const NO_TRIPS_IN_REGION_MESSAGE = "Você ainda não tem viagens suficientes nessa região.";

export function regionOption(region: JourneyRegion): JourneyRegionOption {
  return JOURNEY_REGIONS.find((option) => option.id === region) ?? JOURNEY_REGIONS[0]!;
}

function inRegion(place: OwnerPlaceCardItem, region: JourneyRegion): boolean {
  const code = regionOption(region).countryCode;
  if (!code) return true;
  return place.countryCode?.trim().toUpperCase() === code;
}

/** The trips of the region: the only ones that can be picked and counted. */
export function tripsForRegion(places: readonly OwnerPlaceCardItem[], region: JourneyRegion): OwnerPlaceCardItem[] {
  return places.filter((place) => inRegion(place, region));
}

/** Country codes (flags) shown under the name: every country in the world, only the region's otherwise. */
export function countryCodesForRegion(countryCodes: readonly string[], region: JourneyRegion): string[] {
  const code = regionOption(region).countryCode;
  return code ? countryCodes.filter((c) => c.trim().toUpperCase() === code) : [...countryCodes];
}

/** A region trip may only be toggled if it belongs to the region; the limit still applies. */
export function toggleRegionTrip(
  selected: readonly string[],
  albumId: string,
  regionTrips: readonly OwnerPlaceCardItem[],
  max: number,
): string[] {
  if (selected.includes(albumId)) return selected.filter((id) => id !== albumId);
  if (!regionTrips.some((trip) => trip.albumId === albumId)) return [...selected];
  if (selected.length >= max) return [...selected];
  return [...selected, albumId];
}

/**
 * The GPS photos that feed the map. World: all of them. A country: only the
 * photos of that country's trips (matched by album), never other countries.
 */
export function pointsForRegion(
  points: readonly JourneyPoint[],
  places: readonly OwnerPlaceCardItem[],
  region: JourneyRegion,
): JourneyPoint[] {
  if (regionOption(region).countryCode === null) return [...points];
  const albums = new Set(tripsForRegion(places, region).map((trip) => trip.albumId));
  return points.filter((point) => point.albumId !== null && albums.has(point.albumId));
}

// ---- stats columns -----------------------------------------------------------------------------

export interface StatColumn {
  readonly kind: "trip" | "country" | "city" | "photo";
  readonly value: number;
  readonly label: string;
}

const plural = (value: number, one: string, many: string) => (value === 1 ? one : many);

/** What the stats panel shows for the region: countries make no sense inside one country. */
export function statColumns(region: JourneyRegion, stats: JourneyStats): StatColumn[] {
  const trips: StatColumn = { kind: "trip", value: stats.trips, label: plural(stats.trips, "Viagem", "Viagens") };
  const cities: StatColumn = { kind: "city", value: stats.cities, label: plural(stats.cities, "Cidade", "Cidades") };
  const photos: StatColumn = { kind: "photo", value: stats.photos, label: plural(stats.photos, "Foto", "Fotos") };
  if (region === "us") {
    return [trips, { kind: "country", value: stats.states, label: plural(stats.states, "Estado", "Estados") }, cities, photos];
  }
  if (region === "br") return [trips, cities, photos];
  return [trips, { kind: "country", value: stats.countries, label: plural(stats.countries, "País", "Países") }, cities, photos];
}

// ---- map views ---------------------------------------------------------------------------------

/** The map area on the 1080×1920 image (world and country maps share it). */
export const MAP_AREA = { x: 0, y: 646, width: 1080, height: 564 } as const;
const CURVE_RADIUS = 1500;

/** [lonMin, latMin, lonMax, latMax] */
export type GeoBox = readonly [number, number, number, number];

export interface MapView {
  readonly id: string;
  readonly frame: MapFrame;
  /** Places inside this box are drawn in this view. */
  readonly box: GeoBox;
  /** Where the land comes from: the world shapes, or the US outline (Alaska inset). */
  readonly land: "world" | "us";
  /** Insets only draw their own rectangle. */
  readonly inset: boolean;
}

export interface RegionMap {
  readonly views: readonly MapView[];
  /** The caption ("N fotos com localização") goes to this side so it never covers land or insets. */
  readonly captionSide: "left" | "right";
}

const WORLD_FRAME: MapFrame = {
  ...MAP_AREA,
  lonMin: -180,
  lonMax: 180,
  latMin: -58,
  latMax: 84,
  yStretch: 1.32,
  curveRadius: CURVE_RADIUS,
};

/** Frame centred on `lonCentre` that fills the map area's height with [latMin, latMax]. */
function fitFrame(lonCentre: number, latMin: number, latMax: number, yStretch: number, usedHeight = 530): MapFrame {
  const scale = usedHeight / ((latMax - latMin) * yStretch);
  const lonSpan = MAP_AREA.width / scale;
  return {
    ...MAP_AREA,
    lonMin: lonCentre - lonSpan / 2,
    lonMax: lonCentre + lonSpan / 2,
    latMin,
    latMax,
    yStretch,
    curveRadius: CURVE_RADIUS,
  };
}

/** A small flat frame (no horizon curve) for Alaska / Hawaii, at the same px-per-degree as `scale`. */
function insetFrame(box: GeoBox, x: number, y: number, scale: number, yStretch: number): MapFrame {
  const [lonMin, latMin, lonMax, latMax] = box;
  return {
    x,
    y,
    width: (lonMax - lonMin) * scale,
    height: (latMax - latMin) * scale * yStretch,
    lonMin,
    lonMax,
    latMin,
    latMax,
    yStretch,
  };
}

function worldMap(): RegionMap {
  return {
    views: [{ id: "world", frame: WORLD_FRAME, box: [-180, -90, 180, 90], land: "world", inset: false }],
    captionSide: "left",
  };
}

function usMap(): RegionMap {
  const main = fitFrame(-95.5, 23, 50.5, 1.27);
  const scale = MAP_AREA.width / (main.lonMax - main.lonMin);
  const alaskaBox: GeoBox = [-170, 51, -129, 72];
  const hawaiiBox: GeoBox = [-161, 18.5, -154.5, 22.5];
  return {
    views: [
      { id: "us-alaska", frame: insetFrame(alaskaBox, 10, 1086, scale * 0.28, 1.2), box: alaskaBox, land: "us", inset: true },
      { id: "us-hawaii", frame: insetFrame(hawaiiBox, 10, 990, scale, 1.07), box: hawaiiBox, land: "world", inset: true },
      { id: "us-main", frame: main, box: [-130, 23, -61, 52], land: "world", inset: false },
    ],
    captionSide: "right",
  };
}

function brazilMap(): RegionMap {
  const frame = fitFrame(-53, -34.5, 6.5, 1.02);
  return {
    views: [{ id: "br-main", frame, box: [frame.lonMin, frame.latMin, frame.lonMax, frame.latMax], land: "world", inset: false }],
    captionSide: "left",
  };
}

export function regionMap(region: JourneyRegion): RegionMap {
  if (region === "us") return usMap();
  if (region === "br") return brazilMap();
  return worldMap();
}

export function viewForPoint(map: RegionMap, latitude: number, longitude: number): MapView | null {
  return (
    map.views.find((view) => {
      const [lonMin, latMin, lonMax, latMax] = view.box;
      return longitude >= lonMin && longitude <= lonMax && latitude >= latMin && latitude <= latMax;
    }) ?? null
  );
}
