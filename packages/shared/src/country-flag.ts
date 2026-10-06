/**
 * Resolve a country ISO code / flag from a place label ("País, Localidade").
 * Presentation helper — does not invent geography beyond known name → ISO maps.
 */

import { COUNTRY_NAMES_BY_ISO } from "./country-names.generated";
import { cleanLocationLabel } from "./location-name";

/**
 * USPS state / DC codes. Used for labels like "Cleveland, OH" or "Boston, MA".
 * Comma + code wins over ISO country collisions (MA→Morocco, CA→Canada).
 */
const US_STATE_CODES: ReadonlySet<string> = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

/** Full US state / territory names (accent-folded keys) → USPS code. */
const US_STATE_CODE_BY_NAME: Readonly<Record<string, string>> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  havai: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

/**
 * Hand-written extras on top of the generated ISO table: trip-folder shortcuts
 * (cities, states, "dubai", "nyc"…) and spellings geocoders/people use that are
 * not the official display name. Wins over the generated table on conflict.
 * Every real country already resolves through the generated table below, so a
 * country missing from here is NOT a bug — do not add plain country names.
 */
const MANUAL_ISO_BY_NAME: Readonly<Record<string, string>> = {
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
  jamaica: "JM",
  "montego bay": "JM",
  negril: "JM",
  "ocho rios": "JM",
  "ochos rios": "JM",
  "port antonio": "JM",
  "kingston parish": "JM",
  "st james": "JM",
  "st. james": "JM",
  "saint james": "JM",
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
    .replace(/[\u2018\u2019\u02bc`]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Spellings that differ from the ICU display names (OSM, ISO long forms, local names). */
const COUNTRY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  TZ: [
    "united republic of tanzania",
    "tanzania, united republic of",
    "republic of tanzania",
    "zanzibar",
  ],
  CI: ["ivory coast", "cote d'ivoire", "costa do marfim"],
  CV: ["cape verde", "cabo verde"],
  MM: ["burma", "myanmar (burma)"],
  SZ: ["swaziland", "eswatini"],
  MK: ["macedonia", "north macedonia", "macedonia do norte"],
  TL: ["east timor", "timor-leste", "timor leste"],
  CD: ["dr congo", "drc", "democratic republic of the congo", "congo-kinshasa", "republica democratica do congo"],
  CG: ["republic of the congo", "congo-brazzaville", "republica do congo"],
  VA: ["vatican", "vatican city", "holy see", "vaticano"],
  PS: ["palestine", "state of palestine", "palestinian territories", "palestina"],
  KR: ["republic of korea"],
  KP: ["north korea", "democratic people's republic of korea", "coreia do norte"],
  LA: ["laos", "lao people's democratic republic"],
  SY: ["syria", "syrian arab republic", "siria"],
  IR: ["iran", "iran, islamic republic of"],
  VN: ["viet nam"],
  RU: ["russia", "russian federation"],
  MD: ["moldova", "republic of moldova"],
  BO: ["bolivia", "plurinational state of bolivia"],
  VE: ["venezuela", "bolivarian republic of venezuela"],
  BN: ["brunei", "brunei darussalam"],
  FM: ["micronesia", "federated states of micronesia"],
  TR: ["turkiye", "turquia"],
  CZ: ["czech republic", "czechia", "republica tcheca", "tchequia"],
  GB: ["uk", "u.k.", "great britain", "scotland", "wales", "northern ireland", "england", "inglaterra", "escocia", "pais de gales"],
  US: ["usa", "u.s.a.", "u.s.", "estados unidos da america"],
  NL: ["holland", "the netherlands", "paises baixos", "holanda"],
  PH: ["the philippines"],
  GM: ["the gambia", "gambia"],
  BS: ["the bahamas", "bahamas"],
  HK: ["hong kong sar china", "hong kong"],
  MO: ["macau", "macao", "macau sar china"],
  TW: ["taiwan", "republic of china"],
  AE: ["uae", "emirados", "emirados arabes"],
  CW: ["curacao"],
  RE: ["la reunion", "reunion"],
  SH: ["saint helena", "santa helena"],
  FK: ["falkland islands", "malvinas"],
  KN: ["st kitts and nevis", "saint kitts and nevis"],
  LC: ["st lucia", "saint lucia"],
  VC: ["st vincent and the grenadines", "saint vincent and the grenadines"],
  ST: ["sao tome and principe", "sao tome e principe"],
  BA: ["bosnia", "bosnia and herzegovina", "bosnia e herzegovina"],
  TT: ["trinidad", "trinidad and tobago", "trinidad e tobago"],
  AG: ["antigua", "antigua and barbuda", "antigua e barbuda"],
};

/** Normalised country name → ISO alpha-2, built once from ICU data + aliases + extras. */
const COUNTRY_ISO_BY_NAME: Readonly<Record<string, string>> = (() => {
  const table: Record<string, string> = {};
  for (const [code, names] of Object.entries(COUNTRY_NAMES_BY_ISO)) {
    for (const name of names) {
      const key = normalizeCountryKey(name);
      if (key && !(key in table)) table[key] = code;
    }
  }
  for (const [code, names] of Object.entries(COUNTRY_ALIASES)) {
    for (const name of names) {
      table[normalizeCountryKey(name)] = code;
    }
  }
  for (const [key, code] of Object.entries(MANUAL_ISO_BY_NAME)) {
    table[normalizeCountryKey(key)] = code;
  }
  return table;
})();

/** All ISO alpha-2 codes the country table knows (used by tests and the passport). */
export const KNOWN_COUNTRY_CODES: readonly string[] =
  Object.keys(COUNTRY_NAMES_BY_ISO);

/**
 * Validate a raw ISO alpha-2 value (e.g. Nominatim `address.country_code`, which
 * is lowercase). Returns the upper-case code only when it is a known country.
 */
export function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  const code = raw?.trim().toUpperCase() ?? "";
  return COUNTRY_NAMES_BY_ISO[code] ? code : null;
}

/**
 * Country of a place from its stored `country_code` and its labels (see order below).
 * Pure.
 */
export function countryCodeFromStoredOrLabel(input: {
  readonly storedCode: string | null | undefined;
  readonly confirmedByUser: boolean;
  readonly labels: readonly (string | null | undefined)[];
}): string | null {
  const stored = normalizeCountryCode(input.storedCode);
  const fromLabel = (): string | null => {
    for (const label of input.labels) {
      const code = countryCodeFromPlaceLabel(label);
      if (code) return code;
    }
    return null;
  };
  // A place the user renamed on purpose wins over what the geocoder said then.
  if (input.confirmedByUser) return fromLabel() ?? stored;
  return stored ?? fromLabel();
}

/**
 * Portuguese (pt-BR) country name for an ISO alpha-2 code, or null when the
 * code is not a known country. Works for every ISO country.
 */
export function countryNameFromCode(code: string): string | null {
  const names = COUNTRY_NAMES_BY_ISO[code.trim().toUpperCase()];
  if (!names) return null;
  return names[1] ?? names[0] ?? null;
}

function usStateCodeFromToken(token: string): string | null {
  const key = normalizeCountryKey(token);
  if (!key) return null;
  if (/^[a-z]{2}$/u.test(key)) {
    const code = key.toUpperCase();
    return US_STATE_CODES.has(code) ? code : null;
  }
  return US_STATE_CODE_BY_NAME[key] ?? null;
}

/**
 * US state from labels like "Cleveland, OH", "Boston, MA", or bare "Ohio".
 * Bare 2-letter codes are accepted only when they are not also used as a
 * country lookup key (avoids turning a lone "GA" into a false positive later).
 */
export function usStateCodeFromPlaceLabel(
  label: string | null | undefined,
): string | null {
  const cleaned = cleanLocationLabel(label ?? "");
  if (!cleaned) return null;

  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last) {
      const fromLast = usStateCodeFromToken(last);
      if (fromLast) return fromLast;
    }
  }

  // Bare full state name only (not "MA"/"CA" alone — those collide with ISO use).
  return US_STATE_CODE_BY_NAME[normalizeCountryKey(cleaned)] ?? null;
}

export function countryCodeFromName(countryName: string): string | null {
  const key = normalizeCountryKey(countryName);
  if (!key) return null;
  if (US_STATE_CODE_BY_NAME[key]) return "US";
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

  // "Cleveland, OH" / "Hartford, CT" — state abbreviation implies USA.
  if (usStateCodeFromPlaceLabel(cleaned)) return "US";

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
  "kesiman kertalangu": "Bali",
  kesiman: "Bali",
  denpasar: "Bali",
  "nusa penida": "Nusa Penida",
  jamaica: "Jamaica",
  "montego bay": "Montego Bay",
  negril: "Negril",
  "ocho rios": "Ocho Rios",
  ubud: "Ubud",
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
  JM: "Jamaica",
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

  // US trips: prefer state code (MA, CT, OH) over a single "USA" for every place.
  const usState = usStateCodeFromPlaceLabel(cleaned);
  if (usState) {
    return {
      countryCode: "US",
      shortLabel: usState,
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
