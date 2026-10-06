/**
 * Continent (NA, SA, EU, AS, AF, OC, AN) and tropical-country data keyed by
 * ISO 3166-1 alpha-2, covering every country in `country-names.generated.ts`
 * (a test enforces that) so a trip to any country counts in the passport.
 */

const CONTINENT_CODES: Readonly<Record<string, string>> = {
  NA: "AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI",
  SA: "AR BO BR CL CO EC FK GF GY PE PY SR UY VE",
  EU: "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK",
  AS: "AE AF AM AZ BD BH BN BT CC CN CX GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE",
  AF: "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW",
  OC: "AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS",
  AN: "AQ BV GS HM TF",
};

export const CONTINENT_BY_COUNTRY_CODE: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(CONTINENT_CODES).flatMap(([continent, codes]) =>
      codes.split(" ").map((code) => [code, continent] as const),
    ),
  );

/** Countries (mostly) between the tropics — drives the "tropical" achievement. */
export const TROPICAL_COUNTRY_CODES: ReadonlySet<string> = new Set(
  (
    "AG AI AO AW BB BD BF BI BJ BL BN BO BQ BR BS BZ CD CF CG CI CM CO CR CU CV CW DJ DM DO EC ER ET FJ FM GA GD GF GH GM GN GP GQ GT GU GW GY HN HT ID IN JM KE KH KI KM KN KY LA LC LK LR MF MG MH ML MM MP MQ MS MU MV MW MX MY MZ NC NE NG NI NR OM PA PE PF PG PH PR PW PY RE RW SB SC SD SG SL SN SO SR SS ST SV SX TC TG TH TL TT TV TZ UG VC VE VG VI VN VU WS YE YT ZM"
  ).split(" "),
);
