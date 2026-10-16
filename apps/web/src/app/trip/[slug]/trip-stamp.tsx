import { useId } from "react";

import { stampLabels, stampLandmark, type StampLandmark } from "@/lib/geo/stamp-landmark";

import styles from "./trip.module.css";

/**
 * Decorative passport/postage stamp behind the polaroids in "Sobre essa viagem". It is built from the trip's own
 * destination data: the city (or the place name) is printed on the stamp and the country on the postmark. A
 * silhouette is drawn only for cities recognised with certainty (see `lib/geo/stamp-landmark.ts`); every other
 * destination gets a generic compass, never an invented landmark. Fine copper outlines with a distressed ink texture,
 * low opacity, `aria-hidden`, no interaction. No per-destination assets: pure SVG generated from text.
 */
export function TripStamp({
  city,
  place,
  country,
}: {
  readonly city: string | null | undefined;
  readonly place: string;
  readonly country: string | null | undefined;
}) {
  const uid = useId().replace(/:/gu, "");
  const labels = stampLabels({ city, place, country });
  const landmark = stampLandmark([city, place]);

  const nameSize = labels.name.length <= 8 ? 10 : labels.name.length <= 12 ? 8.4 : 6.8;
  const nameLength = Math.min(54, labels.name.length * nameSize * 0.74);
  const ringTop = `stamp-ring-top-${uid}`;
  const ringBottom = `stamp-ring-bottom-${uid}`;
  const distress = `stamp-distress-${uid}`;
  const ticks = Array.from({ length: 24 }, (_, index) => index * 15);

  return (
    <svg
      aria-hidden="true"
      className={styles.albumAboutPostmark}
      fill="none"
      focusable="false"
      viewBox="0 0 160 110"
    >
      <defs>
        {/* Ink wear: erodes the strokes with fine noise. */}
        <filter id={distress} x="0" y="0" width="100%" height="100%">
          <feTurbulence baseFrequency="0.85" numOctaves="2" result="noise" seed="7" type="fractalNoise" />
          <feColorMatrix
            in="noise"
            result="mask"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.2"
          />
          <feComposite in="SourceGraphic" in2="mask" operator="in" />
        </filter>
        <path d="M79 62A25 25 0 0 1 129 62" id={ringTop} />
        <path d="M80 62A24 24 0 0 0 128 62" id={ringBottom} />
      </defs>

      <g filter={`url(#${distress})`} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* postage stamp: perforated edge, inner frame */}
        <rect height="94" rx="2" strokeDasharray="1.6 2.6" strokeWidth="2.2" width="72" x="8" y="8" />
        <rect height="82" rx="1" strokeWidth="0.9" width="60" x="14" y="14" />

        {/* destination name */}
        <text
          fill="currentColor"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize={nameSize}
          fontWeight="700"
          lengthAdjust="spacingAndGlyphs"
          stroke="none"
          textAnchor="middle"
          textLength={nameLength}
          x="44"
          y="29"
        >
          {labels.name}
        </text>

        {/* illustration window: a recognised landmark, otherwise a generic compass */}
        <path d="M18 84H70" strokeWidth="0.8" />
        {landmark ? <Landmark kind={landmark} /> : <Compass />}

        {labels.country ? (
          <text
            fill="currentColor"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="4.6"
            lengthAdjust="spacingAndGlyphs"
            stroke="none"
            textAnchor="middle"
            textLength={Math.min(52, labels.country.length * 3.5)}
            x="44"
            y="92"
          >
            {labels.country}
          </text>
        ) : null}

        {/* circular postmark overlapping the stamp */}
        <g transform="translate(0 0)">
          <circle cx="104" cy="62" r="31" strokeWidth="1.1" />
          <circle cx="104" cy="62" r="19" strokeWidth="0.7" />
          {ticks.map((angle) => (
            <line
              key={angle}
              strokeWidth="0.7"
              transform={`rotate(${angle} 104 62)`}
              x1="104"
              x2="104"
              y1="28.5"
              y2="31.2"
            />
          ))}
          <text
            fill="currentColor"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="4.8"
            stroke="none"
            textAnchor="middle"
          >
            <textPath
              href={`#${ringTop}`}
              lengthAdjust="spacingAndGlyphs"
              startOffset="50%"
              textLength={Math.min(60, (labels.country || labels.name).length * 3.6)}
            >
              {labels.country || labels.name}
            </textPath>
          </text>
          <text fill="currentColor" fontSize="5" stroke="none" textAnchor="middle">
            <textPath href={`#${ringBottom}`} startOffset="50%">
              ★ ★ ★
            </textPath>
          </text>
          <path d="M96 62h16M104 54v16" strokeWidth="0.7" />
        </g>

        {/* cancellation waves */}
        <path
          d="M128 34c6-3 9 3 15 0s9 3 15 0M134 44c6-3 9 3 15 0M134 80c6-3 9 3 15 0s9 3 15 0"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}

/** Fine-line silhouettes drawn on a common baseline (y = 84, centred on x = 44). */
function Landmark({ kind }: { readonly kind: StampLandmark }) {
  return (
    <g strokeWidth="0.9" transform="translate(1 14)">
      {kind === "burj-khalifa" ? (
        <>
          <path d="M36 70V60H38V52H40V44H41.5V36L43 22L44.5 36V44H46V52H48V60H50V70Z" />
          <path d="M22 70V54H30V70M56 70V58H64V70" />
          <path d="M43 22V14" />
        </>
      ) : null}
      {kind === "eiffel-tower" ? (
        <>
          <path d="M28 70L40 40L43 22L46 40L58 70" />
          <path d="M36 70Q43 54 50 70" />
          <path d="M35.5 56H50.5M38.5 46H47.5M40 40H46" />
          <path d="M43 22V16" />
        </>
      ) : null}
      {kind === "big-ben" ? (
        <>
          <path d="M39 70V36H47V70" />
          <path d="M38 36H48V30H38Z" />
          <path d="M38 30L43 16L48 30" />
          <circle cx="43" cy="44" r="3.2" />
          <path d="M43 44V42M43 44H45" />
          <path d="M20 70V58H39M47 58H66V70" />
        </>
      ) : null}
    </g>
  );
}

function Compass() {
  return (
    <g strokeWidth="0.9" transform="translate(0 0)">
      <circle cx="44" cy="58" r="17" />
      <circle cx="44" cy="58" r="12" strokeDasharray="1.6 2.4" strokeWidth="0.7" />
      <path d="M44 38V78M24 58H64" strokeWidth="0.7" />
      <path d="M44 41 47.5 54.5 61 58 47.5 61.5 44 75 40.5 61.5 27 58 40.5 54.5Z" fill="currentColor" fillOpacity="0.25" />
    </g>
  );
}
