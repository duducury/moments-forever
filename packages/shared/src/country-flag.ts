/**
 * Resolve a country ISO code / flag from a place label ("País, Localidade").
 * Presentation helper — does not invent geography beyond known name → ISO maps.
 */

import { cleanLocationLabel } from "./location-name";

/** Normalized country name (EN/PT variants, accents folded) → ISO 3166-1 alpha-2. */
const COUNTRY_ISO_BY_NAME: Readonly<Record<string, string>> = {
  indonesia: "ID",
  brasil: "BR",
  brazil: "BR",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "estados unidos": "US",
  "estados unidos da america": "US",
  portugal: "PT",
  spain: "ES",
  espana: "ES",
  espanha: "ES",
  france: "FR",
  franca: "FR",
  italy: "IT",
  italia: "IT",
  germany: "DE",
  deutschland: "DE",
  alemanha: "DE",
  "united kingdom": "GB",
  "great britain": "GB",
  "reino unido": "GB",
  england: "GB",
  inglaterra: "GB",
  japan: "JP",
  japao: "JP",
  china: "CN",
  mexico: "MX",
  argentina: "AR",
  chile: "CL",
  colombia: "CO",
  peru: "PE",
  uruguay: "UY",
  uruguai: "UY",
  paraguay: "PY",
  paraguai: "PY",
  bolivia: "BO",
  canada: "CA",
  australia: "AU",
  "new zealand": "NZ",
  "nova zelandia": "NZ",
  thailand: "TH",
  tailandia: "TH",
  vietnam: "VN",
  vietna: "VN",
  "south korea": "KR",
  "korea, republic of": "KR",
  "coreia do sul": "KR",
  india: "IN",
  egypt: "EG",
  egito: "EG",
  morocco: "MA",
  marrocos: "MA",
  "south africa": "ZA",
  "africa do sul": "ZA",
  greece: "GR",
  grecia: "GR",
  turkey: "TR",
  turkiye: "TR",
  turquia: "TR",
  netherlands: "NL",
  "paises baixos": "NL",
  holland: "NL",
  belgium: "BE",
  belgica: "BE",
  switzerland: "CH",
  suica: "CH",
  austria: "AT",
  ireland: "IE",
  irlanda: "IE",
  sweden: "SE",
  suecia: "SE",
  norway: "NO",
  noruega: "NO",
  denmark: "DK",
  dinamarca: "DK",
  finland: "FI",
  finlandia: "FI",
  poland: "PL",
  polonia: "PL",
  "czech republic": "CZ",
  czechia: "CZ",
  "republica tcheca": "CZ",
  croatia: "HR",
  croacia: "HR",
  hungary: "HU",
  hungria: "HU",
  romania: "RO",
  romenia: "RO",
  russia: "RU",
  "russian federation": "RU",
  "united arab emirates": "AE",
  uae: "AE",
  emirados: "AE",
  "emirados arabes": "AE",
  "emirados arabes unidos": "AE",
  // Short / city labels people use as trip folder names
  dubai: "AE",
  "abu dhabi": "AE",
  abudhabi: "AE",
  deira: "AE",
  sharjah: "AE",
  bali: "ID",
  ubud: "ID",
  jakarta: "ID",
  eua: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "u.s.a": "US",
  "new york": "US",
  nyc: "US",
  ny: "US",
  brooklyn: "US",
  miami: "US",
  california: "US",
  "los angeles": "US",
  "las vegas": "US",
  vegas: "US",
  hawaii: "US",
  havai: "US",
  "havaí": "US",
  oahu: "US",
  maui: "US",
  texas: "US",
  florida: "US",
  "sao paulo": "BR",
  "rio de janeiro": "BR",
  rio: "BR",
  bahia: "BR",
  "nusa penida": "ID",
  seminyak: "ID",
  kuta: "ID",
  london: "GB",
  uk: "GB",
  paris: "FR",
  tokyo: "JP",
  bangkok: "TH",
  phuket: "TH",
  lisboa: "PT",
  lisbon: "PT",
  porto: "PT",
  barcelona: "ES",
  madrid: "ES",
  roma: "IT",
  rome: "IT",
  amsterdam: "NL",
  qatar: "QA",
  catar: "QA",
  doha: "QA",
  singapore: "SG",
  singapura: "SG",
  malaysia: "MY",
  malasia: "MY",
  philippines: "PH",
  "the philippines": "PH",
  filipinas: "PH",
  iceland: "IS",
  islandia: "IS",
  cuba: "CU",
  "dominican republic": "DO",
  "republica dominicana": "DO",
  "costa rica": "CR",
  panama: "PA",
  "new caledonia": "NC",
  "nova caledonia": "NC",
  fiji: "FJ",
  maldives: "MV",
  maldivas: "MV",
  "sri lanka": "LK",
  nepal: "NP",
  "hong kong": "HK",
  taiwan: "TW",
};

/** Fold accents so "Indonésia" and "Indonesia" share one lookup key. */
function normalizeCountryKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function countryCodeFromName(countryName: string): string | null {
  const key = normalizeCountryKey(countryName);
  if (!key) return null;
  return COUNTRY_ISO_BY_NAME[key] ?? null;
}

export function flagEmojiFromCountryCode(countryCode: string): string | null {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(code)) return null;
  const base = 0x1f1e6;
  return String.fromCodePoint(
    base + code.charCodeAt(0) - 65,
    base + code.charCodeAt(1) - 65,
  );
}

/** Country part of "País, Localidade" (or bare country name). */
export function countryNameFromPlaceLabel(
  label: string | null | undefined,
): string | null {
  const cleaned = cleanLocationLabel(label ?? "");
  if (!cleaned) return null;
  const comma = cleaned.indexOf(",");
  const countryPart =
    comma > 0 ? cleaned.slice(0, comma).trim() : cleaned.trim();
  return countryPart || null;
}

export function countryCodeFromPlaceLabel(
  label: string | null | undefined,
): string | null {
  const cleaned = cleanLocationLabel(label ?? "");
  if (!cleaned) return null;

  // Short folder names ("dubai", "usa") match the whole label.
  const fromFull = countryCodeFromName(cleaned);
  if (fromFull) return fromFull;

  const comma = cleaned.indexOf(",");
  if (comma <= 0) return null;

  const countryPart = cleaned.slice(0, comma).trim();
  const localityPart = cleaned.slice(comma + 1).trim();
  return (
    countryCodeFromName(countryPart) ?? countryCodeFromName(localityPart)
  );
}

/**
 * Extract country from "País, Localidade" (or a bare country name) and return flag emoji.
 * Prefer {@link countryCodeFromPlaceLabel} + image flags on Windows (emoji often missing).
 */
export function countryFlagFromPlaceLabel(
  label: string | null | undefined,
): string | null {
  const code = countryCodeFromPlaceLabel(label);
  if (!code) return null;
  return flagEmojiFromCountryCode(code);
}

/** Short display names for captions (flag + label). Keys are accent-folded. */
const SHORT_PLACE_LABELS: Readonly<Record<string, string>> = {
  usa: "USA",
  eua: "USA",
  "u.s.": "USA",
  "u.s.a": "USA",
  "u.s.a.": "USA",
  "united states": "USA",
  "united states of america": "USA",
  "estados unidos": "USA",
  "estados unidos da america": "USA",
  indonesia: "Indonésia",
  brasil: "Brasil",
  brazil: "Brasil",
  dubai: "Dubai",
  emirados: "Emirados",
  "emirados arabes": "Emirados",
  "emirados arabes unidos": "Emirados",
  "united arab emirates": "Emirados",
  uae: "Emirados",
  bali: "Bali",
  ubud: "Ubud",
  "nusa penida": "Nusa Penida",
  hawaii: "Havaí",
  havai: "Havaí",
  rio: "Rio",
  "rio de janeiro": "Rio",
  "sao paulo": "São Paulo",
  "new york": "NYC",
  nyc: "NYC",
  ny: "NYC",
  california: "Califórnia",
  "los angeles": "LA",
  miami: "Miami",
  "las vegas": "Vegas",
  vegas: "Vegas",
  paris: "Paris",
  london: "Londres",
  tokyo: "Tóquio",
  lisboa: "Lisboa",
  portugal: "Portugal",
  spain: "Espanha",
  espanha: "Espanha",
  france: "França",
  franca: "França",
  italy: "Itália",
  italia: "Itália",
  japan: "Japão",
  japao: "Japão",
  thailand: "Tailândia",
  tailandia: "Tailândia",
};

const COUNTRY_SHORT_BY_CODE: Readonly<Record<string, string>> = {
  US: "USA",
  ID: "Indonésia",
  BR: "Brasil",
  AE: "Emirados",
  PT: "Portugal",
  ES: "Espanha",
  FR: "França",
  IT: "Itália",
  JP: "Japão",
  TH: "Tailândia",
  GB: "UK",
  DE: "Alemanha",
  MX: "México",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colômbia",
  CA: "Canadá",
  AU: "Austrália",
  NL: "Holanda",
  QA: "Catar",
  SG: "Singapura",
};

export type ShortPlaceCaption = {
  readonly countryCode: string | null;
  readonly shortLabel: string;
};

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Compact caption for Destaques: flag country + short label
 * (USA, Indonésia, Havaí, Rio…) instead of long reverse-geocode names.
 */
export function shortPlaceCaption(
  label: string | null | undefined,
): ShortPlaceCaption | null {
  const cleaned = cleanLocationLabel(label ?? "");
  if (!cleaned) return null;

  const countryCode = countryCodeFromPlaceLabel(cleaned);
  const fullKey = normalizeCountryKey(cleaned);

  if (SHORT_PLACE_LABELS[fullKey]) {
    return {
      countryCode,
      shortLabel: SHORT_PLACE_LABELS[fullKey],
    };
  }

  const comma = cleaned.indexOf(",");
  if (comma > 0) {
    const countryPart = cleaned.slice(0, comma).trim();
    const localityPart = cleaned.slice(comma + 1).trim();
    const localityKey = normalizeCountryKey(localityPart);
    const countryKey = normalizeCountryKey(countryPart);

    if (SHORT_PLACE_LABELS[localityKey]) {
      return {
        countryCode: countryCode ?? countryCodeFromName(countryPart),
        shortLabel: SHORT_PLACE_LABELS[localityKey],
      };
    }
    if (SHORT_PLACE_LABELS[countryKey]) {
      return {
        countryCode: countryCode ?? countryCodeFromName(countryPart),
        shortLabel: SHORT_PLACE_LABELS[countryKey],
      };
    }
    if (countryCode && COUNTRY_SHORT_BY_CODE[countryCode]) {
      return {
        countryCode,
        shortLabel: COUNTRY_SHORT_BY_CODE[countryCode],
      };
    }
    return {
      countryCode,
      shortLabel: titleCaseWords(countryPart).slice(0, 22),
    };
  }

  if (countryCode && COUNTRY_SHORT_BY_CODE[countryCode]) {
    // Known city/state alias → keep short place name; country name → ISO short.
    const isCountryName = countryCodeFromName(cleaned) === countryCode;
    if (isCountryName) {
      return {
        countryCode,
        shortLabel: COUNTRY_SHORT_BY_CODE[countryCode],
      };
    }
    return {
      countryCode,
      shortLabel: titleCaseWords(cleaned).slice(0, 22),
    };
  }

  return {
    countryCode,
    shortLabel: titleCaseWords(cleaned).slice(0, 22),
  };
}
