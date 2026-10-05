/**
 * Builds the static geography the immersive globe draws on top of the NASA
 * texture: country borders, plus country / city / region name labels in
 * Portuguese. Output (committed, served from our own domain — no map service,
 * no API, nothing fetched in production):
 *
 *   public/geo/borders-v1.json   MultiLineString of land borders between countries
 *   public/geo/places-v1.json    Point features: countries, cities, regions
 *
 * Sources (all local npm packages, only needed when regenerating):
 *   - world-atlas            Natural Earth 1:50m countries (public domain)
 *   - i18n-iso-countries     Portuguese country names (MIT)
 *   - all-the-cities         GeoNames cities (CC BY 4.0 — credited in the map attribution)
 *   - country-state-city     state / region centroids
 *   - d3-geo, polylabel, topojson-client  geometry helpers
 *
 * Regenerate (none of these are app dependencies, so nothing touches package.json):
 *   mkdir /tmp/geo && cd /tmp/geo && npm init -y && npm i world-atlas topojson-client \
 *     i18n-iso-countries all-the-cities country-state-city d3-geo polylabel
 *   GEO_DEPS_DIR=/tmp/geo node apps/web/scripts/build-globe-geo.mjs
 *
 * Every place has:  k kind · n name · t tier (1 = most important, shown first)
 *                   s sort key (lower wins a label collision)
 * The app decides at which zoom each tier appears (see globe-labels.ts).
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(here, "../public/geo");
const depsDir = process.env.GEO_DEPS_DIR ?? process.cwd();
const require = createRequire(path.join(depsDir, "package.json"));

const topojson = require("topojson-client");
const { geoArea } = require("d3-geo");
const polylabelModule = require("polylabel");
const polylabel = polylabelModule.default ?? polylabelModule;
const countriesNames = require("i18n-iso-countries");
countriesNames.registerLocale(require("i18n-iso-countries/langs/pt.json"));
const allCities = require("all-the-cities");
const { State } = require("country-state-city");
const atlas = JSON.parse(
  readFileSync(require.resolve("world-atlas/countries-50m.json"), "utf8"),
);

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Only characters the self-hosted font file covers (Latin-1: every Portuguese,
 * Spanish, French, German... accent). A rarer letter loses its mark ("İzmir" →
 * "Izmir", "Łódź" → "Lodz"); anything still outside is dropped.
 */
function clean(text) {
  const normalized = text
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  const fits = (value) => [...value].every((ch) => ch.codePointAt(0) < 256);
  if (fits(normalized)) return normalized;
  const folded = normalized
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
  return fits(folded) ? folded : null;
}

// --- Borders: land borders only (no coastline, which would outline the NASA coast) ----------

const borders = topojson.mesh(atlas, atlas.objects.countries, (a, b) => a !== b);
const bordersJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiLineString",
        coordinates: borders.coordinates
          .map((line) => {
            const out = [];
            for (const [lng, lat] of line) {
              const p = [round(lng, 2), round(lat, 2)];
              const last = out[out.length - 1];
              if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
            }
            return out;
          })
          .filter((line) => line.length > 1),
      },
    },
  ],
};

// --- Countries ------------------------------------------------------------------------------

/** Portuguese (Brazil) names where the library's are European, odd or too long. */
const COUNTRY_NAME_OVERRIDES = {
  CD: "RD Congo",
  CG: "Congo",
  CZ: "Tchéquia",
  MK: "Macedônia do Norte",
  VA: "Vaticano",
  MM: "Mianmar",
  PS: "Palestina",
  GB: "Reino Unido",
  US: "Estados Unidos",
  AE: "Emirados Árabes",
  BA: "Bósnia",
  CF: "Rep. Centro-Africana",
  DO: "Rep. Dominicana",
  GQ: "Guiné Equatorial",
  GW: "Guiné-Bissau",
  KN: "São Cristóvão e Névis",
  VC: "São Vicente e Granadinas",
  ST: "São Tomé e Príncipe",
  AG: "Antígua e Barbuda",
  TT: "Trinidad e Tobago",
  PG: "Papua-Nova Guiné",
  FK: "Ilhas Malvinas",
  TF: "Terras Austrais",
  SJ: "Svalbard",
  XK: "Kosovo",
};

/** The library's names follow European Portuguese; make them Brazilian ("Irão" → "Irã"). */
function toBrazilian(name) {
  return name
    .replace(/énia/g, "ênia")
    .replace(/ónia/g, "ônia")
    .replace(/Irão/g, "Irã")
    .replace(/Gronelândia/g, "Groenlândia")
    .replace(/Maurícia/g, "Maurício")
    .replace(/Bangladeche/g, "Bangladesh")
    .replace(/Sri Lanca/g, "Sri Lanka")
    .replace(/Seicheles/g, "Seychelles")
    .replace(/Koweit/g, "Kuwait")
    .replace(/Qatar/g, "Catar")
    .replace(/Faroé/g, "Faroe")
    .replace(/Iémen/g, "Iêmen")
    .replace(/Mónaco/g, "Mônaco")
    .replace(/Vietname/g, "Vietnã")
    .replace(/Maláui/g, "Malaui")
    .replace(/Benim/g, "Benin")
    .replace(/Djibouti/g, "Djibuti")
    .replace(/^Saint Pierre/, "St. Pierre")
    .replace(/ \(.*\)$/, "");
}

/** Label anchor overrides where the biggest polygon's centre sits somewhere odd. */
const COUNTRY_LABEL_POINTS = {
  US: [-98.5, 39.5],
  CA: [-102, 60],
  RU: [96, 61.5],
  CN: [103.5, 35.5],
  AU: [134, -25.5],
  ID: [114, -1.5],
  CL: [-71.2, -34.5],
  NO: [9, 61.5],
  FR: [2.4, 46.7],
  DK: [9.4, 56],
  NZ: [172.5, -41.5],
  JP: [138.5, 37.2],
  GR: [22.5, 39.3],
  PH: [122.5, 12.5],
  GL: [-41, 74],
  CD: [23.5, -2.8],
  KZ: [67.5, 48],
};

/** Not worth a name of their own on the globe. */
const SKIP_COUNTRIES = new Set(["AQ", "TF", "HM", "BV", "GS", "UM", "AX", "IO", "SH"]);

function largestPolygon(feature) {
  const g = feature.geometry;
  if (g.type === "Polygon") return g.coordinates;
  let best = g.coordinates[0];
  let bestArea = -1;
  for (const polygon of g.coordinates) {
    const area = geoArea({ type: "Polygon", coordinates: polygon });
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  return best;
}

const countryFeatures = topojson.feature(atlas, atlas.objects.countries).features;
const countries = [];
for (const feature of countryFeatures) {
  let alpha2 = feature.id ? countriesNames.numericToAlpha2(feature.id) : null;
  if (!alpha2 && feature.properties.name === "Kosovo") alpha2 = "XK";
  if (!alpha2 || SKIP_COUNTRIES.has(alpha2)) continue;
  const name = clean(toBrazilian(COUNTRY_NAME_OVERRIDES[alpha2] ?? countriesNames.getName(alpha2, "pt") ?? ""));
  if (!name) continue;
  const point = COUNTRY_LABEL_POINTS[alpha2] ?? polylabel(largestPolygon(feature), 0.5);
  countries.push({
    alpha2,
    name,
    area: geoArea(feature),
    lng: round(point[0], 2),
    lat: round(point[1], 2),
  });
}
countries.sort((a, b) => b.area - a.area);
// Two territories can share a name ("Austrália"): keep the bigger one only.
const seenNames = new Set();
const uniqueCountries = countries.filter((country) => {
  if (seenNames.has(country.name)) return false;
  seenNames.add(country.name);
  return true;
});
countries.length = 0;
countries.push(...uniqueCountries);
const countryTier = (index) => (index < 20 ? 1 : index < 70 ? 2 : index < 140 ? 3 : 4);

const places = [];
countries.forEach((country, index) => {
  places.push({
    k: "country",
    n: country.name,
    t: countryTier(index),
    s: index,
    lng: country.lng,
    lat: country.lat,
  });
});

// --- Cities ---------------------------------------------------------------------------------

/** [country, GeoNames name, Portuguese name, tier] — the world's headline cities. */
const CITY_LIST = [
  // tier 1: the biggest and best-known
  ["JP", "Tokyo", "Tóquio", 1],
  ["IN", "Delhi", "Délhi", 1],
  ["CN", "Shanghai", "Xangai", 1],
  ["BR", "São Paulo", null, 1],
  ["MX", "Mexico City", "Cidade do México", 1],
  ["EG", "Cairo", null, 1],
  ["IN", "Mumbai", null, 1],
  ["CN", "Beijing", "Pequim", 1],
  ["US", "New York City", "Nova York", 1],
  ["TR", "Istanbul", "Istambul", 1],
  ["RU", "Moscow", "Moscou", 1],
  ["GB", "London", "Londres", 1],
  ["FR", "Paris", null, 1],
  ["US", "Los Angeles", null, 1],
  ["AR", "Buenos Aires", null, 1],
  ["BR", "Rio de Janeiro", null, 1],
  ["NG", "Lagos", null, 1],
  ["ID", "Jakarta", "Jacarta", 1],
  ["TH", "Bangkok", null, 1],
  ["KR", "Seoul", "Seul", 1],
  ["SG", "Singapore", "Singapura", 1],
  ["AU", "Sydney", null, 1],
  ["AE", "Dubai", "Dubai", 1],
  ["ZA", "Cape Town", "Cidade do Cabo", 1],
  ["IT", "Rome", "Roma", 1],
  ["ES", "Madrid", "Madri", 1],
  ["DE", "Berlin", "Berlim", 1],
  ["CA", "Toronto", null, 1],
  ["PE", "Lima", null, 1],
  ["CO", "Bogotá", null, 1],
  ["CL", "Santiago", null, 1],
  ["ZA", "Johannesburg", "Joanesburgo", 1],
  ["KE", "Nairobi", "Nairóbi", 1],
  ["IR", "Tehran", "Teerã", 1],
  ["BR", "Brasília", null, 1],
  ["PT", "Lisbon", "Lisboa", 1],
  ["US", "Washington", "Washington", 1],
  // tier 2: major destinations and hubs
  ["IT", "Venice", "Veneza", 2],
  ["IT", "Florence", "Florença", 2],
  ["IT", "Milan", "Milão", 2],
  ["JP", "Kyoto", "Quioto", 2],
  ["JP", "Osaka", null, 2],
  ["PE", "Cusco", null, 2],
  ["MA", "Marrakesh", "Marrakech", 2],
  ["ES", "Barcelona", null, 2],
  ["NL", "Amsterdam", "Amsterdã", 2],
  ["CZ", "Prague", "Praga", 2],
  ["AT", "Vienna", "Viena", 2],
  ["HU", "Budapest", "Budapeste", 2],
  ["GR", "Athens", "Atenas", 2],
  ["US", "Las Vegas", null, 2],
  ["US", "San Francisco", "São Francisco", 2],
  ["US", "Miami", null, 2],
  ["US", "Orlando", null, 2],
  ["US", "Chicago", null, 2],
  ["MX", "Cancún", null, 2],
  ["CU", "Havana", "Havana", 2],
  ["BR", "Salvador", null, 2],
  ["BR", "Fortaleza", null, 2],
  ["BR", "Recife", null, 2],
  ["BR", "Florianópolis", null, 2],
  ["BR", "Manaus", null, 2],
  ["BR", "Belém", null, 2],
  ["BR", "Foz do Iguaçu", null, 2],
  ["BR", "Porto Alegre", null, 2],
  ["BR", "Curitiba", null, 2],
  ["BR", "Belo Horizonte", null, 2],
  ["TH", "Phuket", null, 2],
  ["VN", "Hanoi", "Hanói", 2],
  ["VN", "Ho Chi Minh City", "Ho Chi Minh", 2],
  ["HK", "Hong Kong", null, 2],
  ["MY", "Kuala Lumpur", null, 2],
  ["IL", "Jerusalem", "Jerusalém", 2],
  ["AE", "Abu Dhabi", null, 2],
  ["AU", "Melbourne", null, 2],
  ["NZ", "Auckland", null, 2],
  ["CA", "Vancouver", null, 2],
  ["CH", "Zürich", "Zurique", 2],
  ["DE", "Munich", "Munique", 2],
  ["FR", "Nice", null, 2],
  // tier 3: well-known travel stops
  ["BR", "Natal", null, 3],
  ["BR", "Maceió", null, 3],
  ["BR", "Porto Seguro", null, 3],
  ["BR", "Paraty", null, 3],
  ["BR", "Armação de Búzios", "Búzios", 3],
  ["BR", "São Luís", null, 3],
  ["BR", "Ouro Preto", null, 3],
  ["BR", "Campos do Jordão", null, 3],
  ["BR", "Ilhabela", null, 3],
  ["BR", "Balneário Camboriú", null, 3],
  ["CO", "Cartagena", null, 3],
  ["AR", "Ushuaia", null, 3],
  ["AR", "San Carlos de Bariloche", "Bariloche", 3],
  ["AR", "Mendoza", null, 3],
  ["UY", "Punta del Este", null, 3],
  ["NZ", "Queenstown", null, 3],
  ["TH", "Chiang Mai", null, 3],
  ["KH", "Siem Reap", null, 3],
  ["TW", "Taipei", "Taipé", 3],
  ["NP", "Kathmandu", "Catmandu", 3],
  ["IN", "Jaipur", null, 3],
  ["IN", "Agra", null, 3],
  ["LK", "Colombo", null, 3],
  ["MV", "Male", "Malé", 3],
  ["TZ", "Zanzibar", null, 3],
  ["EG", "Luxor", null, 3],
  ["IL", "Tel Aviv", null, 3],
  ["QA", "Doha", null, 3],
  ["TR", "Göreme", "Capadócia", 3],
  ["PT", "Porto", null, 3],
  ["ES", "Sevilla", "Sevilha", 3],
  ["ES", "Valencia", "Valência", 3],
  ["ES", "Málaga", null, 3],
  ["IT", "Naples", "Nápoles", 3],
  ["IT", "Turin", "Turim", 3],
  ["IT", "Bologna", "Bolonha", 3],
  ["DE", "Hamburg", "Hamburgo", 3],
  ["DE", "Frankfurt am Main", "Frankfurt", 3],
  
  ["GB", "Edinburgh", "Edimburgo", 3],
  ["IE", "Dublin", null, 3],
  ["BE", "Brussels", "Bruxelas", 3],
  ["DK", "Copenhagen", "Copenhague", 3],
  ["SE", "Stockholm", "Estocolmo", 3],
  ["FI", "Helsinki", "Helsinque", 3],
  ["PL", "Warsaw", "Varsóvia", 3],
  ["PL", "Kraków", "Cracóvia", 3],
  ["RU", "Saint Petersburg", "São Petersburgo", 3],
  ["FR", "Lyon", "Lião", 3],
  ["FR", "Marseille", "Marselha", 3],
  ["HR", "Dubrovnik", null, 3],
  ["CA", "Montréal", "Montreal", 3],
  ["CA", "Québec", "Quebec", 3],
  ["US", "Boston", null, 3],
  ["US", "New Orleans", "Nova Orleans", 3],
  ["US", "Seattle", null, 3],
  ["US", "San Diego", null, 3],
  ["US", "Honolulu", null, 3],
  ["ID", "Ubud", null, 3],
];

/** Destinations GeoNames doesn't list under a usable name: [country, Portuguese name, lat, lng, tier]. */
const CITY_EXTRAS = [
  ["BR", "Gramado", -29.3788, -50.8742, 3],
  ["PE", "Machu Picchu", -13.1631, -72.545, 3],
  ["CH", "Genebra", 46.2044, 6.1432, 3],
  ["BR", "Bonito", -21.1261, -56.4836, 4],
  ["BR", "Jericoacoara", -2.7967, -40.5131, 4],
  ["BR", "Fernando de Noronha", -3.8549, -32.4244, 4],
  ["GR", "Santorini", 36.3932, 25.4615, 3],
  ["GR", "Mykonos", 37.4467, 25.3289, 4],
  ["FR", "Cannes", 43.5528, 7.0174, 4],
];

const pop = (c) => c.population ?? 0;
const key = (cc, name) => `${cc}|${name}`;
const byKey = new Map();
for (const city of allCities) {
  const k = key(city.country, city.name);
  const existing = byKey.get(k);
  if (!existing || pop(city) > pop(existing)) byKey.set(k, city);
}

const missed = [];
const chosen = new Map(); // cityId -> {city, name, tier}
for (const [cc, name, pt, tier] of CITY_LIST) {
  const city = byKey.get(key(cc, name));
  if (!city) {
    missed.push(`${cc} ${name}`);
    continue;
  }
  chosen.set(city.cityId, { city, name: clean(pt ?? name), tier });
}

/** Local-name differences worth fixing for the automatic picks (capitals etc.). */
const AUTO_NAME_OVERRIDES = {
  "AT|Vienna": "Viena",
  "BE|Brussels": "Bruxelas",
  "DK|Copenhagen": "Copenhague",
  "SE|Stockholm": "Estocolmo",
  "FI|Helsinki": "Helsinque",
  "PL|Warsaw": "Varsóvia",
  "GR|Athens": "Atenas",
  "HU|Budapest": "Budapeste",
  "CZ|Prague": "Praga",
  "RO|Bucharest": "Bucareste",
  "BG|Sofia": "Sófia",
  "RS|Belgrade": "Belgrado",
  "UA|Kyiv": "Kiev",
  "BY|Minsk": "Minsk",
  "NO|Oslo": "Oslo",
  "IS|Reykjavík": "Reykjavik",
  "CH|Bern": "Berna",
  "NL|Amsterdam": "Amsterdã",
  "LU|Luxembourg": "Luxemburgo",
  "MC|Monaco": "Mônaco",
  "VA|Vatican City": "Vaticano",
  "TN|Tunis": "Túnis",
  "DZ|Algiers": "Argel",
  "LY|Tripoli": "Trípoli",
  "ET|Addis Ababa": "Adis Abeba",
  "SA|Riyadh": "Riade",
  "IQ|Baghdad": "Bagdá",
  "AF|Kabul": "Cabul",
  "BD|Dhaka": "Daca",
  "NP|Kathmandu": "Catmandu",
  "KP|Pyongyang": "Pyongyang",
  "KW|Kuwait City": "Cidade do Kuwait",
  "PA|Panama City": "Cidade do Panamá",
  "UY|Montevideo": "Montevidéu",
  "PY|Asunción": "Assunção",
  "GT|Guatemala City": "Cidade da Guatemala",
  "MA|Rabat": "Rabat",
  "SN|Dakar": "Dacar",
  "GH|Accra": "Acra",
  "AO|Luanda": "Luanda",
  "MZ|Maputo": "Maputo",
  "NZ|Wellington": "Wellington",
  "IN|New Delhi": "Nova Délhi",
  "SO|Mogadishu": "Mogadíscio",
  "IN|Kolkata": "Calcutá",
  "FM|Palikir - National Government Center": "Palikir",
  "SA|Mecca": "Meca",
  "PS|Ramallah": "Ramala",
  "DE|Cologne": "Colônia",
  "LB|Beirut": "Beirute",
  "SY|Damascus": "Damasco",
  "JO|Amman": "Amã",
  "TW|Taipei": "Taipé",
  "MM|Naypyidaw": "Naypyidaw",
  "CD|Kinshasa": "Kinshasa",
  "SD|Khartoum": "Cartum",
  "CU|Havana": "Havana",
  "JM|Kingston": "Kingston",
  "IQ|Mosul": "Mossul",
};

const MIN_POP = 700_000;
/** Automatic non-capital picks per country, so huge-but-obscure cities don't crowd the globe. */
const AUTO_CITY_CAP = { CN: 5, IN: 7, BR: 9, US: 10, RU: 6, JP: 5, DEFAULT: 4 };
const autoCount = new Map();
for (const { city } of chosen.values()) autoCount.set(city.country, (autoCount.get(city.country) ?? 0) + 1);
const candidates = allCities
  .filter((c) => c.featureCode === "PPLC" || pop(c) >= MIN_POP)
  .sort((a, b) => pop(b) - pop(a));

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const [lng1, lat1] = a.loc.coordinates;
  const [lng2, lat2] = b.loc.coordinates;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Greedy declutter: a big city's suburbs/neighbours (within 70 km, smaller) are dropped.
const kept = [...chosen.values()].map((entry) => entry.city);
// Capitals are always shown, so their suburbs/neighbours never need a second label.
for (const city of candidates) if (city.featureCode === "PPLC" && !chosen.has(city.cityId)) kept.push(city);
for (const city of candidates) {
  if (chosen.has(city.cityId)) continue;
  const isCapital = city.featureCode === "PPLC";
  if (!isCapital && kept.some((other) => distanceKm(city, other) < 70)) continue;
  const cap = AUTO_CITY_CAP[city.country] ?? AUTO_CITY_CAP.DEFAULT;
  if (!isCapital && (autoCount.get(city.country) ?? 0) >= cap) continue;
  const base = AUTO_NAME_OVERRIDES[key(city.country, city.name)] ?? city.name;
  const name = clean(base);
  if (!name) continue;
  // Small capitals wait for a closer zoom than the big ones.
  const tier = isCapital ? (pop(city) >= 1_000_000 ? 2 : 3) : pop(city) >= 3_000_000 ? 3 : 4;
  if (!isCapital) autoCount.set(city.country, (autoCount.get(city.country) ?? 0) + 1);
  chosen.set(city.cityId, { city, name, tier });
  kept.push(city);
}

for (const { city, name, tier } of chosen.values()) {
  if (!name) continue;
  const [lng, lat] = city.loc.coordinates;
  places.push({ k: "city", n: name, t: tier, s: -pop(city), lng: round(lng, 3), lat: round(lat, 3) });
}
for (const [, name, lat, lng, tier] of CITY_EXTRAS) {
  places.push({ k: "city", n: name, t: tier, s: 0, lng, lat });
}

// --- Regions (states / provinces) for the countries chosen for the globe -------------------

/** Portuguese names where they differ from the data's English ones, keyed "CC:code". */
const R = (cc, entries) => Object.fromEntries(Object.entries(entries).map(([code, name]) => [`${cc}:${code}`, name]));
const REGION_NAMES = {
  ...R("US", {
    AL: "Alabama", AK: "Alasca", AZ: "Arizona", AR: "Arkansas", CA: "Califórnia", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Flórida", GA: "Geórgia", HI: "Havaí", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Luisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "Nova Hampshire", NJ: "Nova Jersey", NM: "Novo México", NY: "Nova York",
    NC: "Carolina do Norte", ND: "Dakota do Norte", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pensilvânia", RI: "Rhode Island", SC: "Carolina do Sul", SD: "Dakota do Sul",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virgínia", WA: "Washington",
    WV: "Virgínia Ocidental", WI: "Wisconsin", WY: "Wyoming",
  }),
  ...R("CA", {
    AB: "Alberta", BC: "Colúmbia Britânica", MB: "Manitoba", NB: "Novo Brunswick",
    NL: "Terra Nova e Labrador", NT: "Territórios do Noroeste", NS: "Nova Escócia", NU: "Nunavut",
    ON: "Ontário", PE: "Ilha do Príncipe Eduardo", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
  }),
  ...R("AU", {
    ACT: "Território da Capital", NSW: "Nova Gales do Sul", NT: "Território do Norte",
    QLD: "Queensland", SA: "Austrália do Sul", TAS: "Tasmânia", VIC: "Vitória", WA: "Austrália Ocidental",
  }),
  ...R("MX", {
    CDMX: "Cidade do México", MEX: "Estado do México", COA: "Coahuila", MIC: "Michoacán",
    VER: "Veracruz", ROO: "Quintana Roo",
  }),
  ...R("AR", { C: "Buenos Aires (CABA)", S: "Santa Fé", E: "Entre Rios", R: "Rio Negro", V: "Terra do Fogo" }),
  ...R("FR", {
    ARA: "Auvérnia-Ródano-Alpes", BFC: "Borgonha-Franche-Comté", BRE: "Bretanha",
    CVL: "Centro-Vale do Loire", GES: "Grande Leste", HDF: "Alta França", NOR: "Normandia",
    NAQ: "Nova Aquitânia", OCC: "Occitânia", PDL: "País do Loire", PAC: "Provença-Alpes-Costa Azul",
    IDF: "Ilha de França",
  }),
  ...R("IT", {
    65: "Abruzos", 23: "Vale de Aosta", 75: "Apúlia", 77: "Basilicata", 78: "Calábria", 72: "Campânia",
    45: "Emília-Romanha", 36: "Friul-Veneza Júlia", 62: "Lácio", 42: "Ligúria", 25: "Lombardia",
    57: "Marcas", 67: "Molise", 21: "Piemonte", 88: "Sardenha", 82: "Sicília",
    32: "Trentino-Alto Ádige", 52: "Toscana", 55: "Úmbria", 34: "Vêneto",
  }),
  ...R("ES", {
    AN: "Andaluzia", AR: "Aragão", AS: "Astúrias", PM: "Ilhas Baleares", PV: "País Basco",
    CN: "Ilhas Canárias", CB: "Cantábria", CL: "Castela e Leão", CM: "Castela-La Mancha",
    CT: "Catalunha", EX: "Estremadura", GA: "Galícia", RI: "La Rioja", MD: "Madri",
    MC: "Múrcia", NC: "Navarra", VC: "Comunidade Valenciana",
  }),
  ...R("DE", {
    BW: "Baden-Württemberg", BY: "Baviera", BE: "Berlim", BB: "Brandemburgo", HB: "Bremen",
    HH: "Hamburgo", HE: "Hesse", MV: "Meclemburgo-Pomerânia", NI: "Baixa Saxônia",
    NW: "Renânia do Norte-Vestfália", RP: "Renânia-Palatinado", SL: "Sarre", SN: "Saxônia",
    ST: "Saxônia-Anhalt", SH: "Schleswig-Holstein", TH: "Turíngia",
  }),
  ...R("PT", {
    "01": "Aveiro", 20: "Açores", "02": "Beja", "03": "Braga", "04": "Bragança", "05": "Castelo Branco",
    "06": "Coimbra", "08": "Faro", "09": "Guarda", 10: "Leiria", 11: "Lisboa", 30: "Madeira",
    12: "Portalegre", 13: "Porto", 14: "Santarém", 15: "Setúbal", 16: "Viana do Castelo",
    17: "Vila Real", 18: "Viseu", "07": "Évora",
  }),
  ...R("GB", { ENG: "Inglaterra", NIR: "Irlanda do Norte", SCT: "Escócia", WLS: "País de Gales" }),
  ...R("ID", { JK: "Jacarta", JB: "Java Ocidental", JT: "Java Central", JI: "Java Oriental", YO: "Yogyakarta", SU: "Sumatra do Norte", SB: "Sumatra Ocidental", SS: "Sumatra do Sul", KB: "Bornéu Ocidental", KT: "Bornéu Central", KS: "Bornéu do Sul", KI: "Bornéu Oriental", PA: "Papua", NT: "Nusa Tenggara Oriental", NB: "Nusa Tenggara Ocidental", SN: "Celebes do Sul", SA: "Celebes do Norte", ST: "Celebes Central" }),
  ...R("CN", { BJ: "Pequim", SH: "Xangai", XJ: "Xinjiang", XZ: "Tibete", NM: "Mongólia Interior", HK: "Hong Kong", MO: "Macau", TJ: "Tianjin", CQ: "Chongqing", HL: "Heilongjiang" }),
  ...R("IN", { DH: "Dadra e Nagar Haveli e Daman e Diu", DL: "Délhi", JK: "Jammu e Caxemira", LA: "Ladaque", KL: "Querala", TN: "Tâmil Nadu", WB: "Bengala Ocidental", MH: "Maharashtra", GJ: "Guzerate", PB: "Punjab", RJ: "Rajastão", UP: "Uttar Pradesh", AN: "Ilhas Andamão" }),
  ...R("JP", { 13: "Tóquio", 26: "Quioto", 27: "Osaka", 1: "Hokkaido", 47: "Okinawa", 14: "Kanagawa", 23: "Aichi", 40: "Fukuoka", 34: "Hiroshima", 28: "Hyogo", 29: "Nara", 22: "Shizuoka", 20: "Nagano" }),
};

const REGION_COUNTRIES = ["BR", "US", "CA", "AU", "MX", "AR", "FR", "IT", "ES", "DE", "PT", "GB", "ID", "JP", "CN", "IN"];
/** Big countries show their regions earlier (tier 1); compact ones later (tier 2). */
const BIG_REGION_COUNTRIES = new Set(["BR", "US", "CA", "AU", "MX", "AR", "CN", "IN", "ID"]);
const US_EXCLUDED = new Set(["AS", "GU", "MP", "PR", "UM", "VI", "DC"]);
const REGION_FILTERS = {
  US: (s) => !US_EXCLUDED.has(s.isoCode) && !s.isoCode.startsWith("UM-"),
  ES: (s) => ["AN", "AR", "AS", "PM", "PV", "CN", "CB", "CL", "CM", "CT", "EX", "GA", "RI", "MD", "MC", "NC", "VC"].includes(s.isoCode),
  FR: (s) => /^[A-Z]{3}$/.test(s.isoCode),
  IT: (s) => /^\d{2}$/.test(s.isoCode),
  GB: (s) => ["ENG", "NIR", "SCT", "WLS"].includes(s.isoCode),
};

for (const cc of REGION_COUNTRIES) {
  const filter = REGION_FILTERS[cc] ?? (() => true);
  const states = State.getStatesOfCountry(cc).filter(
    (s) => filter(s) && s.latitude && s.longitude,
  );
  // Rank regions by the people living nearest to each (sum of nearby cities' populations).
  const weight = new Map(states.map((s) => [s.isoCode, 0]));
  const here = (c) => c.country === cc && pop(c) >= 100_000;
  for (const city of allCities.filter(here)) {
    let best = null;
    let bestDistance = Infinity;
    for (const s of states) {
      const d = distanceKm(city, { loc: { coordinates: [Number(s.longitude), Number(s.latitude)] } });
      if (d < bestDistance) {
        bestDistance = d;
        best = s;
      }
    }
    if (best) weight.set(best.isoCode, weight.get(best.isoCode) + pop(city));
  }
  for (const s of states) {
    const raw = REGION_NAMES[`${cc}:${s.isoCode}`] ?? s.name.replace(/ (Prefecture|Province|State)$/i, "");
    const name = clean(raw);
    if (!name) continue;
    places.push({
      k: "region",
      n: name,
      t: BIG_REGION_COUNTRIES.has(cc) ? 1 : 2,
      s: -weight.get(s.isoCode),
      lng: round(Number(s.longitude), 3),
      lat: round(Number(s.latitude), 3),
    });
  }
}

// --- Write ----------------------------------------------------------------------------------

const placesJson = {
  type: "FeatureCollection",
  features: places.map((p) => ({
    type: "Feature",
    properties: { k: p.k, n: p.n, t: p.t, s: Math.round(p.s) },
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
  })),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "borders-v1.json"), JSON.stringify(bordersJson));
writeFileSync(path.join(OUT_DIR, "places-v1.json"), JSON.stringify(placesJson));

const count = (k, t) => places.filter((p) => p.k === k && (t === undefined || p.t === t)).length;
console.log("missed curated cities:", missed.length ? missed.join(", ") : "none");
console.log(
  `countries ${count("country")} (t1-4: ${[1, 2, 3, 4].map((t) => count("country", t)).join("/")})`,
  `cities ${count("city")} (t1-4: ${[1, 2, 3, 4].map((t) => count("city", t)).join("/")})`,
  `regions ${count("region")} (t1/t2: ${count("region", 1)}/${count("region", 2)})`,
);
