/**
 * Resolve a country ISO code / flag from a place label ("País, Localidade").
 * Presentation helper — does not invent geography beyond known name → ISO maps.
 */

import { COUNTRY_NAMES_BY_ISO } from "./country-names.generated";
import {
  COUNTRY_NAME_ALIASES,
  PT_BR_NAME_OVERRIDES,
  SHORT_NAME_BY_CODE,
  TERRITORY_PARENT,
} from "./country-registry";
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

const AMBIGUOUS_GEORGIA_KEY = "georgia";

/** Cities whose "…, Georgia" is the country, not the US state. */
const GEORGIAN_CITY_KEYS: ReadonlySet<string> = new Set([
  "tbilisi", "batumi", "kutaisi", "mestia", "stepantsminda", "kazbegi", "gori", "telavi", "sighnaghi", "signagi",
  "borjomi", "mtskheta", "kobuleti", "zugdidi", "rustavi", "poti", "ushguli",
]);

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
  for (const [code, name] of Object.entries(PT_BR_NAME_OVERRIDES)) {
    table[normalizeCountryKey(name)] = code;
  }
  for (const [code, names] of Object.entries(COUNTRY_NAME_ALIASES)) {
    for (const name of names) {
      table[normalizeCountryKey(name)] = code;
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

/** USPS abbreviations of US territories, accepted after a comma ("San Juan, PR"). */
const US_TERRITORY_ABBREVIATIONS: ReadonlySet<string> = new Set(["PR", "GU", "VI", "AS", "MP"]);

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
  if (!stored) return fromLabel();
  // The geocoder may file a territory under its sovereign country ("us" for Porto Rico): a label that names the
  // territory itself is more specific.
  const labelCode = fromLabel();
  if (labelCode && TERRITORY_PARENT[labelCode] === stored) return labelCode;
  return stored;
}

/**
 * Portuguese (pt-BR) country name for an ISO alpha-2 code, or null when the
 * code is not a known country. Works for every ISO country.
 */
export function countryNameFromCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  const names = COUNTRY_NAMES_BY_ISO[upper];
  if (!names) return null;
  return PT_BR_NAME_OVERRIDES[upper] ?? names[1] ?? names[0] ?? null;
}

/**
 * Short pt-BR name for captions ("Hong Kong", "Ilhas Virgens (EUA)"): the curated short name when there is one,
 * else the full name. Never longer than 22 characters.
 */
export function countryShortNameFromCode(code: string): string | null {
  const upper = code.trim().toUpperCase();
  const short = SHORT_NAME_BY_CODE[upper];
  if (short) return short;
  const full = countryNameFromCode(upper);
  return full ? (full.length > 22 ? `${full.slice(0, 21).trimEnd()}…` : full) : null;
}

/** Territory (own ISO code and flag) → its sovereign country, e.g. PR → US. Null for everything else. */
export function sovereignCountryOf(code: string): string | null {
  return TERRITORY_PARENT[code.trim().toUpperCase()] ?? null;
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
      if (fromLast === "GA" && normalizeCountryKey(last) === AMBIGUOUS_GEORGIA_KEY) {
        // "Tbilisi, Georgia" / "Georgia, Tbilisi"-style labels name the country; "Atlanta, Georgia" the state.
        const rest = parts.slice(0, -1);
        const georgian = rest.some((part) => {
          const key = normalizeCountryKey(part);
          return GEORGIAN_CITY_KEYS.has(key) || countryCodeFromName(part) !== null;
        });
        return georgian ? null : fromLast;
      }
      if (fromLast) return fromLast;
    }
  }

  // Bare full state name only (not "MA"/"CA" alone — those collide with ISO use). Bare "Georgia" is the country.
  const bare = normalizeCountryKey(cleaned);
  if (bare === AMBIGUOUS_GEORGIA_KEY) return null;
  return US_STATE_CODE_BY_NAME[bare] ?? null;
}

/** English display name of a US state from its USPS code ("PA" → "Pennsylvania"), or null. */
export function usStateNameFromCode(code: string | null | undefined): string | null {
  const wanted = code?.trim().toUpperCase();
  if (!wanted) return null;
  for (const [key, value] of Object.entries(US_STATE_CODE_BY_NAME)) {
    // The first spelling of each state is its official English name.
    if (value === wanted) {
      return key.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()).replace(/ Of /u, " of ");
    }
  }
  return null;
}

export function countryCodeFromName(countryName: string): string | null {
  const key = normalizeCountryKey(countryName);
  if (!key) return null;
  // "Georgia"/"Geórgia" is the country by itself; the US state only shows up as the tail of "Atlanta, Georgia"
  // (see usStateCodeFromPlaceLabel).
  if (key === AMBIGUOUS_GEORGIA_KEY) return "GE";
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

  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const codes = parts.map((part, index) => {
    const named = countryCodeFromName(part);
    if (named) return named;
    // "San Juan, PR": only the last part, and only for the USPS territory abbreviations.
    const abbreviation = part.toUpperCase();
    return index === parts.length - 1 && index > 0 && US_TERRITORY_ABBREVIATIONS.has(abbreviation)
      ? abbreviation
      : null;
  });
  // A territory named next to its sovereign country wins ("Estados Unidos, Porto Rico" → PR, not US).
  for (const code of codes) {
    if (code && TERRITORY_PARENT[code] && codes.includes(TERRITORY_PARENT[code] ?? null)) return code;
  }
  return codes[0] ?? codes.find((code) => code !== null) ?? null;
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

    // "Estados Unidos, Porto Rico": the caption names the territory, not "USA".
    if (
      countryCode &&
      TERRITORY_PARENT[countryCode] &&
      (countryCodeFromName(countryPart) === TERRITORY_PARENT[countryCode] ||
        countryCodeFromName(localityPart) === TERRITORY_PARENT[countryCode])
    ) {
      return {
        countryCode,
        shortLabel: countryShortNameFromCode(countryCode) ?? countryPart,
      };
    }

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
    if (countryCode && SHORT_NAME_BY_CODE[countryCode]) {
      return {
        countryCode,
        shortLabel: SHORT_NAME_BY_CODE[countryCode],
      };
    }
    return {
      countryCode,
      shortLabel: titleCaseWords(countryPart).slice(0, 22),
    };
  }

  if (countryCode) {
    // Known city/state alias → keep short place name; country name → canonical short name (never cut mid-word).
    const isCountryName = countryCodeFromName(cleaned) === countryCode;
    if (isCountryName) {
      return {
        countryCode,
        shortLabel: countryShortNameFromCode(countryCode) ?? titleCaseWords(cleaned).slice(0, 22),
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

/**
 * Display order "Cidade, País": turns the stored "País, Localidade" (e.g. "Emirados Árabes Unidos, Dubai") into
 * "Dubai, Emirados Árabes Unidos". Only swaps when the first part is a known country and the second is not, so labels
 * like "Cleveland, OH" or a user's own title are left untouched. Display only: stored names keep their format.
 */
export function placeLabelCityFirst(label: string): string {
  const cleaned = cleanLocationLabel(label);
  const comma = cleaned.indexOf(",");
  if (comma <= 0) return cleaned;
  const first = cleaned.slice(0, comma).trim();
  const rest = cleaned.slice(comma + 1).trim();
  if (!first || !rest || rest.includes(",")) return cleaned;
  // "Dubai" is also a lookup alias for the UAE, so "is the second part a country" means: its canonical name.
  const isCountryName = (value: string): boolean => {
    const code = countryCodeFromName(value);
    const canonical = code ? countryNameFromCode(code) : null;
    return Boolean(
      canonical && normalizeCountryKey(canonical) === normalizeCountryKey(value),
    );
  };
  if (countryCodeFromName(first) && !isCountryName(rest)) {
    return `${rest}, ${first}`;
  }
  return cleaned;
}
