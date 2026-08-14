import {
  countryCodeFromPlaceLabel,
  shortPlaceCaption,
  usStateCodeFromPlaceLabel,
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
  readonly lastCoverPhotoId: string | null;
  readonly years: readonly string[];
  readonly cities: readonly string[];
  readonly albumHrefs: readonly { readonly href: string; readonly title: string }[];
}

const CONTINENT_BY_CODE: Readonly<Record<string, string>> = {
  US: "NA",
  CA: "NA",
  MX: "NA",
  CR: "NA",
  PA: "NA",
  CU: "NA",
  DO: "NA",
  JM: "NA",
  GT: "NA",
  HN: "NA",
  NI: "NA",
  BZ: "NA",
  BR: "SA",
  AR: "SA",
  CL: "SA",
  CO: "SA",
  PE: "SA",
  EC: "SA",
  PT: "EU",
  ES: "EU",
  FR: "EU",
  IT: "EU",
  DE: "EU",
  GB: "EU",
  NL: "EU",
  GR: "EU",
  TR: "AS",
  AE: "AS",
  QA: "AS",
  JP: "AS",
  TH: "AS",
  ID: "AS",
  SG: "AS",
  PH: "AS",
  MY: "AS",
  VN: "AS",
  KH: "AS",
  IN: "AS",
  LK: "AS",
  MV: "AS",
  MA: "AF",
  EG: "AF",
  KE: "AF",
  TZ: "AF",
  MU: "AF",
  SC: "AF",
  AU: "OC",
  NZ: "OC",
  FJ: "OC",
};

export type AchievementIcon =
  | "passport"
  | "plane"
  | "globe"
  | "camera"
  | "palm"
  | "map"
  | "calendar"
  | "star";

export interface PassportAchievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly unlocked: boolean;
  readonly icon: AchievementIcon;
  readonly points: number;
}

export interface PassportRank {
  readonly title: string;
  readonly nextTitle: string | null;
  readonly nextPoints: number | null;
  readonly progress: number;
}

const CONTINENT_LABEL: Readonly<Record<string, string>> = {
  NA: "América do Norte",
  SA: "América do Sul",
  EU: "Europa",
  AS: "Ásia",
  AF: "África",
  OC: "Oceania",
};

const RANK_STEPS = [
  { title: "Iniciante", minPoints: 0 },
  { title: "Viajante", minPoints: 80 },
  { title: "Explorador", minPoints: 180 },
  { title: "Mochileiro", minPoints: 320 },
  { title: "Globetrotter", minPoints: 500 },
] as const;

function buildRank(points: number): PassportRank {
  let index = 0;
  for (let i = 0; i < RANK_STEPS.length; i += 1) {
    if (points >= RANK_STEPS[i].minPoints) index = i;
  }
  const current = RANK_STEPS[index];
  const next = RANK_STEPS[index + 1] ?? null;
  if (!next) {
    return {
      title: current.title,
      nextTitle: null,
      nextPoints: null,
      progress: 1,
    };
  }
  const span = next.minPoints - current.minPoints;
  return {
    title: current.title,
    nextTitle: next.title,
    nextPoints: next.minPoints,
    progress: span <= 0 ? 1 : Math.min(1, (points - current.minPoints) / span),
  };
}

export interface PassportData {
  readonly countryCount: number;
  readonly cityCount: number;
  readonly tripCount: number;
  readonly photoCount: number;
  readonly dayCount: number;
  readonly issuedAt: string | null;
  readonly achievementPoints: number;
  readonly rank: PassportRank;
  readonly continents: readonly string[];
  readonly nextAchievement: PassportAchievement | null;
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
      lastCoverPhotoId: string | null;
      years: Set<string>;
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
      lastCoverPhotoId: null as string | null,
      years: new Set<string>(),
      cities: new Set<string>(),
      albums: [] as { href: string; title: string }[],
    };
    current.tripCount += 1;
    current.photoCount += item.photoCount;
    const visit = item.endsAt ?? item.startsAt;
    if (visit && (!current.lastVisitAt || visit > current.lastVisitAt)) {
      current.lastVisitAt = visit;
    }
    if (!current.lastCoverPhotoId && item.coverPhotoId) {
      current.lastCoverPhotoId = item.coverPhotoId;
    }
    const year = visit ? new Date(visit).getUTCFullYear() : NaN;
    if (Number.isFinite(year)) current.years.add(String(year));
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
      lastCoverPhotoId: row.lastCoverPhotoId,
      years: [...row.years].sort((a, b) => b.localeCompare(a)),
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
  const continents = new Set(
    countries
      .map((country) => CONTINENT_BY_CODE[country.code])
      .filter((value): value is string => Boolean(value)),
  );
  const usStates = new Set<string>();
  for (const place of places) {
    const state = usStateCodeFromPlaceLabel(place.title);
    if (state) usStates.add(state);
  }
  const maxCitiesInCountry = countries.reduce(
    (max, country) => Math.max(max, country.cities.length),
    0,
  );
  const maxTripsInCountry = countries.reduce(
    (max, country) => Math.max(max, country.tripCount),
    0,
  );
  const countriesWithTwoPlaces = countries.filter(
    (country) => country.cities.length >= 2 || country.tripCount >= 2,
  ).length;
  const cityCount = cities.size;
  const maxPhotosInTrip = journey.reduce((max, item) => Math.max(max, item.photoCount), 0);
  const maxTripDays = journey.reduce((max, item) => Math.max(max, item.dayCount), 0);

  const achievements: PassportAchievement[] = [
    {
      id: "first-photo",
      title: "Primeiro Clique",
      description: "Registrou sua primeira foto.",
      unlocked: photoCount >= 1,
      icon: "camera",
      points: 10,
    },
    {
      id: "first-city",
      title: "Primeira Cidade",
      description: "Visitou sua primeira cidade.",
      unlocked: cityCount >= 1,
      icon: "map",
      points: 15,
    },
    {
      id: "first-passport",
      title: "Primeiro Passaporte",
      description: "Visitou seu primeiro país.",
      unlocked: countryCount >= 1,
      icon: "passport",
      points: 15,
    },
    {
      id: "weekend",
      title: "Escapada",
      description: "Acumulou 3 dias viajando.",
      unlocked: uniqueDays.size >= 3,
      icon: "calendar",
      points: 20,
    },
    {
      id: "snapshot-25",
      title: "Olhar Atento",
      description: "Registrou 25 fotos.",
      unlocked: photoCount >= 25,
      icon: "camera",
      points: 25,
    },
    {
      id: "week-away",
      title: "Uma Semana Fora",
      description: "Acumulou 7 dias viajando.",
      unlocked: uniqueDays.size >= 7,
      icon: "calendar",
      points: 30,
    },
    {
      id: "three-cities",
      title: "Roteiro Urbano",
      description: "Visitou 3 cidades.",
      unlocked: cityCount >= 3,
      icon: "map",
      points: 35,
    },
    {
      id: "photo-story",
      title: "Álbum Completo",
      description: "Registrou 20 fotos em uma viagem.",
      unlocked: maxPhotosInTrip >= 20,
      icon: "camera",
      points: 35,
    },
    {
      id: "four-trips",
      title: "Temporada",
      description: "Completou 4 viagens.",
      unlocked: tripCount >= 4,
      icon: "plane",
      points: 40,
    },
    {
      id: "snapshot-50",
      title: "Colecionador",
      description: "Registrou 50 fotos.",
      unlocked: photoCount >= 50,
      icon: "camera",
      points: 40,
    },
    {
      id: "two-weeks",
      title: "Quinzena",
      description: "Acumulou 14 dias viajando.",
      unlocked: uniqueDays.size >= 14,
      icon: "calendar",
      points: 45,
    },
    {
      id: "long-stay",
      title: "Estadia",
      description: "Passou 7 dias em uma mesma viagem.",
      unlocked: maxTripDays >= 7,
      icon: "calendar",
      points: 50,
    },
    {
      id: "four-countries",
      title: "Quatro Fronteiras",
      description: "Visitou 4 países.",
      unlocked: countryCount >= 4,
      icon: "passport",
      points: 55,
    },
    {
      id: "same-country-explorer",
      title: "Conhecedor",
      description: "Visitou 2 lugares no mesmo país.",
      unlocked: maxCitiesInCountry >= 2 || countriesWithTwoPlaces >= 1,
      icon: "map",
      points: 40,
    },
    {
      id: "two-states",
      title: "Dois Estados",
      description: "Conheceu 2 estados dos EUA.",
      unlocked: usStates.size >= 2,
      icon: "map",
      points: 50,
    },
    {
      id: "repeat-country",
      title: "De Volta",
      description: "Fez 2 viagens para o mesmo país.",
      unlocked: maxTripsInCountry >= 2,
      icon: "plane",
      points: 45,
    },
    {
      id: "traveler",
      title: "Viajante",
      description: "Completou 5 viagens.",
      unlocked: tripCount >= 5,
      icon: "plane",
      points: 50,
    },
    {
      id: "memories",
      title: "Contador de Memórias",
      description: "Registrou 100 fotos.",
      unlocked: photoCount >= 100,
      icon: "camera",
      points: 55,
    },
    {
      id: "two-continents",
      title: "Dois Mundos",
      description: "Visitou 2 continentes.",
      unlocked: continents.size >= 2,
      icon: "globe",
      points: 60,
    },
    {
      id: "tropical",
      title: "Paraíso Tropical",
      description: "Visitou 3 destinos tropicais.",
      unlocked: tropicalCount >= 3,
      icon: "palm",
      points: 70,
    },
    {
      id: "five-countries",
      title: "Cinco Passaportes",
      description: "Visitou 5 países.",
      unlocked: countryCount >= 5,
      icon: "passport",
      points: 75,
    },
    {
      id: "eight-cities",
      title: "Mapa Cheio",
      description: "Visitou 8 cidades.",
      unlocked: cityCount >= 8,
      icon: "map",
      points: 80,
    },
    {
      id: "five-states",
      title: "Rota Americana",
      description: "Conheceu 5 estados dos EUA.",
      unlocked: usStates.size >= 5,
      icon: "star",
      points: 90,
    },
    {
      id: "ten-trips",
      title: "Nômade",
      description: "Completou 10 viagens.",
      unlocked: tripCount >= 10,
      icon: "plane",
      points: 90,
    },
    {
      id: "month-away",
      title: "Um Mês Fora",
      description: "Acumulou 30 dias viajando.",
      unlocked: uniqueDays.size >= 30,
      icon: "calendar",
      points: 80,
    },
    {
      id: "album",
      title: "Arquivista",
      description: "Registrou 500 fotos.",
      unlocked: photoCount >= 500,
      icon: "camera",
      points: 100,
    },
    {
      id: "three-continents",
      title: "Três Horizontes",
      description: "Visitou 3 continentes.",
      unlocked: continents.size >= 3,
      icon: "globe",
      points: 110,
    },
    {
      id: "globetrotter",
      title: "Globetrotter",
      description: "Visitou 10 países.",
      unlocked: countryCount >= 10,
      icon: "globe",
      points: 120,
    },
    {
      id: "deep-country",
      title: "Raízes",
      description: "Visitou 4 cidades no mesmo país.",
      unlocked: maxCitiesInCountry >= 4,
      icon: "map",
      points: 100,
    },
    {
      id: "hundred-days",
      title: "Vida na Estrada",
      description: "Acumulou 100 dias viajando.",
      unlocked: uniqueDays.size >= 100,
      icon: "star",
      points: 150,
    },
    {
      id: "world-20",
      title: "Cidadão do Mundo",
      description: "Visitou 20 países.",
      unlocked: countryCount >= 20,
      icon: "star",
      points: 180,
    },
    {
      id: "five-continents",
      title: "Cinco Continentes",
      description: "Visitou 5 continentes.",
      unlocked: continents.size >= 5,
      icon: "globe",
      points: 200,
    },
    {
      id: "six-continents",
      title: "Planeta Inteiro",
      description: "Visitou os 6 continentes habitados.",
      unlocked: continents.size >= 6,
      icon: "star",
      points: 250,
    },
  ];

  achievements.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return b.points - a.points;
  });

  const achievementPoints = achievements
    .filter((item) => item.unlocked)
    .reduce((sum, item) => sum + item.points, 0);
  const nextAchievement =
    [...achievements]
      .filter((item) => !item.unlocked)
      .sort((a, b) => a.points - b.points)[0] ?? null;
  const continentLabels = [...continents]
    .map((code) => CONTINENT_LABEL[code])
    .filter((label): label is string => Boolean(label));

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
    cityCount,
    tripCount,
    photoCount,
    dayCount: uniqueDays.size,
    issuedAt: issued,
    achievementPoints,
    rank: buildRank(achievementPoints),
    continents: continentLabels,
    nextAchievement,
    countries,
    journey,
    achievements,
  };
}
