/**
 * Single source of truth for how countries and territories are named and told apart. Everything that shows or
 * resolves a country (Passaporte, Mapa, GPS places, albums, import, NFC, share image) goes through
 * country-flag.ts, which combines these tables with the ICU names in country-names.generated.ts.
 */

/**
 * pt-BR names that replace the ICU ones where ICU is too long for the UI or the app uses a different
 * everyday name ("Hong Kong, RAE da China" → "Hong Kong").
 */
export const PT_BR_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  HK: "Hong Kong",
  MO: "Macau",
  CD: "República Democrática do Congo",
  CG: "República do Congo",
};

/**
 * Short names for captions (Polaroid, passport stamp, chips). Countries not listed use their full pt-BR name;
 * every name here fits in 22 characters.
 */
export const SHORT_NAME_BY_CODE: Readonly<Record<string, string>> = {
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
  PR: "Porto Rico",
  HK: "Hong Kong",
  MO: "Macau",
  // Long official names, shortened for captions.
  MP: "Ilhas Marianas",
  VI: "Ilhas Virgens (EUA)",
  VG: "Ilhas Virgens (UK)",
  GS: "Geórgia do Sul",
  IO: "Índico Britânico",
  VC: "São Vicente",
  TF: "Terras Austrais",
  CF: "Rep. Centro-Africana",
  CD: "RD Congo",
  CG: "Rep. do Congo",
};

/**
 * Other spellings that must resolve to the same country: names the app stored in the past (the Mapa data used
 * pt-PT spellings and a swapped Congo pair), OSM/ISO long forms and common local names. Matched accent- and
 * case-insensitively. Never used for display.
 */
export const COUNTRY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  US: ["Estados Unidos da América", "Estados Unidos da America", "United States of America", "USA"],
  GL: ["Gronelândia", "Groenlandia", "Kalaallit Nunaat"],
  KY: ["Ilhas Caimão", "Ilhas Cayman", "Cayman Islands"],
  NC: ["Nova Caledónia"],
  HK: ["Hong Kong, RAE da China", "Hong Kong SAR China", "Hong Kong S.A.R."],
  MO: ["Macau, RAE da China", "Macao", "Macao SAR China", "Macau S.A.R."],
  CD: ["Congo - Kinshasa", "Congo-Kinshasa", "DR Congo", "DRC", "República Democrática do Congo"],
  CG: ["Congo - Brazzaville", "Congo-Brazzaville", "República Popular do Congo", "Republic of the Congo"],
  GE: ["Geórgia", "Sakartvelo"],
  VA: ["Santa Sé", "Vaticano", "Vatican City", "Holy See"],
  GS: ["Geórgia do Sul e Ilhas Sandwich do Sul", "Ilhas Geórgia do Sul e Sandwich do Sul"],
  PM: ["Saint Pierre e Miquelon", "São Pedro e Miquelão"],
  BA: ["Bósnia-Herzegovina", "Bósnia e Herzegovina"],
  HM: ["Ilha Heard e Ilhas McDonald", "Ilhas Heard e McDonald"],
  TF: ["Terras Austrais e Antárticas Francesas", "Territórios Franceses do Sul"],
  SX: ["Sint Maarten (Dutch part)"],
  MF: ["Saint Martin"],
  CW: ["Curaçao", "Curacao"],
  MS: ["Monserrate"],
  AX: ["Ilhas Åland", "Ilhas Aland"],
  IR: ["Irão"],
  YE: ["Iémen"],
  VN: ["Vietname"],
  RO: ["Roménia"],
  AM: ["Arménia"],
  KW: ["Koweit"],
  QA: ["Qatar"],
  SC: ["Seychelles"],
  PL: ["Polónia"],
  MC: ["Mónaco"],
  MU: ["Maurícia"],
  MW: ["Maláui"],
  MK: ["Macedónia do Norte"],
  LV: ["Letónia"],
  EE: ["Estónia"],
  SI: ["Eslovénia"],
  KE: ["Quénia"],
  DJ: ["Djibouti"],
  CZ: ["Chéquia"],
  BF: ["Burkina Faso"],
  BH: ["Bahrein"],
  BJ: ["Benim"],
  TM: ["Turquemenistão"],
  TJ: ["Tajiquistão"],
  TT: ["Trindade e Tobago"],
  KN: ["São Cristóvão e Neves"],
};

/**
 * Territories with their own ISO 3166-1 code and flag that geocoders and place names often file under the
 * sovereign country ("Estados Unidos, Porto Rico"). When a label names both, the territory is the destination.
 */
export const TERRITORY_PARENT: Readonly<Record<string, string>> = {
  PR: "US", GU: "US", VI: "US", AS: "US", MP: "US", UM: "US",
  AI: "GB", BM: "GB", FK: "GB", GI: "GB", KY: "GB", MS: "GB", TC: "GB", VG: "GB",
  GF: "FR", GP: "FR", MQ: "FR", NC: "FR", PF: "FR", PM: "FR", RE: "FR", YT: "FR", BL: "FR", MF: "FR", WF: "FR",
  AW: "NL", CW: "NL", SX: "NL", BQ: "NL",
  HK: "CN", MO: "CN",
  FO: "DK", GL: "DK",
};


/**
 * Where the US territories are. Used ONLY to tell that a place the geocoder filed under the United States is really
 * a territory (Nominatim answers `country_code: "us"` for San Juan, Vieques or Culebra): mainland US has no land
 * inside these boxes, and they are never applied to a place that is not already US. Rough boxes, tuned to the islands.
 */
const US_TERRITORY_BOXES: readonly {
  readonly code: string;
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}[] = [
  // Puerto Rico: main island, Vieques, Culebra, Mona, Desecheo.
  { code: "PR", south: 17.6, north: 18.6, west: -68.1, east: -65.1 },
  // US Virgin Islands: St. Thomas, St. John, St. Croix (British Virgin Islands start above ~18.42).
  { code: "VI", south: 17.6, north: 18.42, west: -65.1, east: -64.5 },
  // Guam and the Northern Mariana Islands.
  { code: "GU", south: 13.2, north: 13.7, west: 144.5, east: 145.0 },
  { code: "MP", south: 14.0, north: 20.6, west: 144.8, east: 146.2 },
  // American Samoa.
  { code: "AS", south: -14.6, north: -11.0, west: -171.2, east: -168.0 },
];

/** US territory (own ISO code) containing the point, or null. Only meaningful for places already filed under the US. */
export function usTerritoryAtCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  for (const box of US_TERRITORY_BOXES) {
    if (latitude >= box.south && latitude <= box.north && longitude >= box.west && longitude <= box.east) {
      return box.code;
    }
  }
  return null;
}

/** "US-PR" (Nominatim `ISO3166-2-lvl*`) → "PR" for US territories, else null. */
export function usTerritoryFromIso3166Subdivision(value: string | null | undefined): string | null {
  const match = /^US-([A-Z]{2})$/u.exec(value?.trim().toUpperCase() ?? "");
  const code = match?.[1];
  return code && ["PR", "GU", "VI", "AS", "MP", "UM"].includes(code) ? code : null;
}
