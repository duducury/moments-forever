import {
  countryCodeFromPlaceLabel,
  shortPlaceCaption,
} from "@moments-forever/shared";

import type { OwnerPlaceCardItem } from "@/lib/experiences/load-owner-place-cards";
import { profileTripAlbumPath } from "@/lib/routes/app-routes";

const COUNTRY_NAME_BY_CODE: Readonly<Record<string, string>> = {
  US: "Estados Unidos",
  ID: "Indonésia",
  BR: "Brasil",
  AE: "Emirados Árabes Unidos",
  PT: "Portugal",
  ES: "Espanha",
  FR: "França",
  IT: "Itália",
  JP: "Japão",
  TH: "Tailândia",
  GB: "Reino Unido",
  DE: "Alemanha",
  MX: "México",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colômbia",
  CA: "Canadá",
  AU: "Austrália",
  NL: "Países Baixos",
  QA: "Catar",
  SG: "Singapura",
  PH: "Filipinas",
  MY: "Malásia",
  MV: "Maldivas",
  LK: "Sri Lanka",
  CR: "Costa Rica",
  PA: "Panamá",
  CU: "Cuba",
  DO: "República Dominicana",
  JM: "Jamaica",
  KE: "Quênia",
  TZ: "Tanzânia",
  FJ: "Fiji",
  VN: "Vietnã",
  KH: "Camboja",
  IN: "Índia",
  GR: "Grécia",
  TR: "Turquia",
  MA: "Marrocos",
  EG: "Egito",
  NZ: "Nova Zelândia",
  PE: "Peru",
  EC: "Equador",
};

const TROPICAL_COUNTRY_CODES: ReadonlySet<string> = new Set([
  "ID",
  "TH",
  "PH",
  "MY",
  "SG",
  "MV",
  "LK",
  "CR",
  "PA",
  "CU",
  "DO",
  "JM",
  "BZ",
  "HN",
  "NI",
  "GT",
  "BR",
  "CO",
  "EC",
  "PE",
  "KE",
  "TZ",
  "MU",
  "SC",
  "FJ",
  "KH",
  "VN",
  "IN",
  "MX",
]);

export interface PassportJourneyItem {
  readonly albumId: string;
  readonly href: string;
  readonly title: string;
  readonly countryCode: string | null;
  readonly cityLabel: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly photoCount: number;
  readonly coverPhotoId: string | null;
  readonly dayCount: number;
}

export interface PassportCountry {
  readonly code: string;
  readonly name: string;
  readonly tripCount: number;
  readonly photoCount: number;
  readonly lastVisitAt: string | null;
  readonly cities: readonly string[];
  readonly albumHrefs: readonly { readonly href: string; readonly title: string }[];
}

export interface PassportAchievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly unlocked: boolean;
  readonly icon: "passport" | "plane" | "globe" | "camera" | "palm";
}

export interface PassportData {
  readonly countryCount: number;
  readonly cityCount: number;
  readonly tripCount: number;
  readonly photoCount: number;
  readonly dayCount: number;
  readonly issuedAt: string | null;
  readonly countries: readonly PassportCountry[];
  readonly journey: readonly PassportJourneyItem[];
  readonly achievements: readonly PassportAchievement[];
}

function inclusiveDayCount(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

function utcDayKey(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function addRangeDays(
  days: Set<string>,
  startIso: string | null,
  endIso: string | null,
): void {
  if (!startIso && !endIso) return;
  const start = startIso ?? endIso;
  const end = endIso ?? startIso;
  if (!start || !end) return;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  let cursor = Math.min(startMs, endMs);
  const last = Math.max(startMs, endMs);
  while (cursor <= last) {
    days.add(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
}

function cityFromPlace(place: OwnerPlaceCardItem): string | null {
  const caption = shortPlaceCaption(place.title);
  const comma = place.title.indexOf(",");
  if (comma > 0) {
    const locality = place.title.slice(comma + 1).trim();
    if (locality) return locality;
  }
  if (!caption?.shortLabel) return null;
  if (place.countryCode && caption.shortLabel === COUNTRY_NAME_BY_CODE[place.countryCode]) {
    return null;
  }
  const codeName = place.countryCode
    ? COUNTRY_NAME_BY_CODE[place.countryCode]
    : null;
  if (codeName && caption.shortLabel === codeName) return null;
  if (countryCodeFromPlaceLabel(caption.shortLabel) === place.countryCode) {
    return null;
  }
  return caption.shortLabel;
}

function countryName(code: string, fallbackLabel: string): string {
  return COUNTRY_NAME_BY_CODE[code] ?? fallbackLabel;
}

export function buildPassport(
  places: readonly OwnerPlaceCardItem[],
  issuedAt: string | null,
): PassportData {
  const uniqueDays = new Set<string>();
  const journey: PassportJourneyItem[] = places.map((place) => {
    addRangeDays(uniqueDays, place.startsAt, place.endsAt);
    const dayCount =
      place.startsAt || place.endsAt
        ? inclusiveDayCount(place.startsAt ?? place.endsAt ?? "", place.endsAt ?? place.startsAt ?? "")
        : 0;
    return {
      albumId: place.albumId,
      href: profileTripAlbumPath(place.experienceSlug, place.albumId),
      title: place.title,
      countryCode: place.countryCode,
      cityLabel: cityFromPlace(place),
      startsAt: place.startsAt,
      endsAt: place.endsAt,
      photoCount: place.photoCount,
      coverPhotoId: place.coverPhotoId,
      dayCount,
    };
  });

  journey.sort((a, b) => {
    const ta = a.startsAt ?? a.endsAt ?? "";
    const tb = b.startsAt ?? b.endsAt ?? "";
    return tb.localeCompare(ta);
  });

  const byCountry = new Map<
    string,
    {
      name: string;
      tripCount: number;
      photoCount: number;
      lastVisitAt: string | null;
      cities: Set<string>;
      albums: { href: string; title: string }[];
    }
  >();

  const cities = new Set<string>();

  for (const item of journey) {
    const city = item.cityLabel;
    if (city) cities.add(`${item.countryCode ?? "xx"}:${city.toLowerCase()}`);

    if (!item.countryCode) continue;
    const current = byCountry.get(item.countryCode) ?? {
      name: countryName(item.countryCode, item.title.split(",")[0]?.trim() || item.countryCode),
      tripCount: 0,
      photoCount: 0,
      lastVisitAt: null as string | null,
      cities: new Set<string>(),
      albums: [] as { href: string; title: string }[],
    };
    current.tripCount += 1;
    current.photoCount += item.photoCount;
    const visit = item.endsAt ?? item.startsAt;
    if (visit && (!current.lastVisitAt || visit > current.lastVisitAt)) {
      current.lastVisitAt = visit;
    }
    if (city) current.cities.add(city);
    current.albums.push({ href: item.href, title: item.title });
    byCountry.set(item.countryCode, current);
  }

  const countries: PassportCountry[] = [...byCountry.entries()]
    .map(([code, row]) => ({
      code,
      name: row.name,
      tripCount: row.tripCount,
      photoCount: row.photoCount,
      lastVisitAt: row.lastVisitAt,
      cities: [...row.cities],
      albumHrefs: row.albums,
    }))
    .sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));

  const photoCount = places.reduce((sum, place) => sum + place.photoCount, 0);
  const countryCount = countries.length;
  const tripCount = places.length;
  const tropicalCount = countries.filter((country) =>
    TROPICAL_COUNTRY_CODES.has(country.code),
  ).length;

  const achievements: PassportAchievement[] = [
    {
      id: "first-passport",
      title: "Primeiro Passaporte",
      description: "Visitou seu primeiro país.",
      unlocked: countryCount >= 1,
      icon: "passport",
    },
    {
      id: "traveler",
      title: "Viajante",
      description: "Completou 5 viagens.",
      unlocked: tripCount >= 5,
      icon: "plane",
    },
    {
      id: "globetrotter",
      title: "Globetrotter",
      description: "Visitou 10 países.",
      unlocked: countryCount >= 10,
      icon: "globe",
    },
    {
      id: "memories",
      title: "Contador de Memórias",
      description: "Registrou 100 fotos.",
      unlocked: photoCount >= 100,
      icon: "camera",
    },
    {
      id: "tropical",
      title: "Paraíso Tropical",
      description: "Visitou 3 destinos tropicais.",
      unlocked: tropicalCount >= 3,
      icon: "palm",
    },
  ];

  const issued =
    issuedAt ??
    journey.reduce<string | null>((earliest, item) => {
      const key = utcDayKey(item.startsAt ?? item.endsAt ?? "");
      if (!key) return earliest;
      if (!earliest || key < earliest) return key;
      return earliest;
    }, null);

  return {
    countryCount,
    cityCount: cities.size,
    tripCount,
    photoCount,
    dayCount: uniqueDays.size,
    issuedAt: issued,
    countries,
    journey,
    achievements,
  };
}
