import { useId } from "react";

import {
  WORLD_OUTLINE_PATH,
  WORLD_OUTLINE_VIEWBOX,
} from "@/lib/geo/world-outline";

import styles from "./trip.module.css";

/**
 * Decorative backdrop behind the place title: a dark, atmospheric world map (continents as soft bronze-lit masses with
 * a warm bloom, not outlines), layered topographic contours, one elegant dashed flight route ending in a small
 * aeroplane, and a compass detail near the edge. It is purely generic: no pins, no destination markers, no labels and
 * no trip-specific data, so the same artwork serves every country, city and trip, and it never replaces the real map.
 * Inline vector, no animation, `aria-hidden`, never interactive. Colours come from the theme (`--route-*` in
 * trip.module.css); the stage is strongest around the title and fades toward the edges (mask in the CSS).
 */
export function TripRouteArt() {
  const uid = useId().replace(/:/gu, "");
  const id = (name: string) => `route-${name}-${uid}`;

  return (
    <svg
      aria-hidden="true"
      className={styles.albumHeroRoute}
      fill="none"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox={WORLD_OUTLINE_VIEWBOX}
    >
      <defs>
        {/* Land: bronze-lit towards the centre, nearly dark at the rim. */}
        <radialGradient id={id("land")} cx="0.42" cy="0.45" r="0.75">
          <stop offset="0" stopColor="var(--route-3)" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="var(--route-1)" stopOpacity="0.11" />
          <stop offset="1" stopColor="var(--route-2)" stopOpacity="0.03" />
        </radialGradient>
        {/* Warm illumination that sits behind the title. */}
        <radialGradient id={id("glow")} cx="0.38" cy="0.5" r="0.6">
          <stop offset="0" stopColor="var(--route-1)" stopOpacity="0.1" />
          <stop offset="0.6" stopColor="var(--route-2)" stopOpacity="0.03" />
          <stop offset="1" stopColor="var(--route-2)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("line")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--route-3)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--route-3)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--route-3)" stopOpacity="0" />
        </linearGradient>
        <filter id={id("bloom")} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <path d={WORLD_OUTLINE_PATH} id={id("world")} />
      </defs>

      <rect fill={`url(#${id("glow")})`} height="270" width="720" />

      {/* Continents: blurred copy for the bronze bloom, then the crisp lit shapes with a hairline coast. */}
      <use filter={`url(#${id("bloom")})`} href={`#${id("world")}`} opacity="0.45" fill={`url(#${id("land")})`} />
      <use
        fill={`url(#${id("land")})`}
        href={`#${id("world")}`}
        stroke="var(--route-3)"
        strokeLinejoin="round"
        strokeOpacity="0.22"
        strokeWidth="0.5"
      />

      {/* Topographic contours: two quiet families near the lower edge. */}
      <g stroke={`url(#${id("line")})`} strokeLinecap="round" strokeWidth="0.6">
        <path d="M-10 196C60 150 130 232 210 206S330 150 420 190" opacity="0.55" />
        <path d="M-10 203C60 155.6 130 235.5 210 210.2S330 157 420 194.9" opacity="0.51" />
        <path d="M-10 210C60 161.2 130 239 210 214.4S330 164 420 199.8" opacity="0.46" />
        <path d="M-10 217C60 166.8 130 242.5 210 218.6S330 171 420 204.7" opacity="0.42" />
        <path d="M-10 224C60 172.4 130 246 210 222.8S330 178 420 209.6" opacity="0.37" />
        <path d="M-10 231C60 178 130 249.5 210 227S330 185 420 214.5" opacity="0.33" />
        <path d="M-10 238C60 183.6 130 253 210 231.2S330 192 420 219.4" opacity="0.28" />
        <path d="M-10 245C60 189.2 130 256.5 210 235.4S330 199 420 224.3" opacity="0.24" />
        <path d="M-10 252C60 194.8 130 260 210 239.6S330 206 420 229.2" opacity="0.19" />
      </g>
      <g stroke={`url(#${id("line")})`} strokeLinecap="round" strokeWidth="0.6">
        <path d="M430 262C500 200 560 250 640 196S720 170 760 188" opacity="0.50" />
        <path d="M430 254C500 192 560 242.8 640 189.6S720 162 760 180" opacity="0.44" />
        <path d="M430 246C500 184 560 235.6 640 183.2S720 154 760 172" opacity="0.38" />
        <path d="M430 238C500 176 560 228.4 640 176.8S720 146 760 164" opacity="0.32" />
        <path d="M430 230C500 168 560 221.2 640 170.4S720 138 760 156" opacity="0.26" />
        <path d="M430 222C500 160 560 214 640 164S720 130 760 148" opacity="0.20" />
      </g>

      {/* One tasteful dashed route that ends in the aeroplane. */}
      <path
        d="M250 236C360 232 485 190 530 92"
        stroke="var(--route-3)"
        strokeDasharray="5 6"
        strokeLinecap="round"
        strokeWidth="1.5"
        opacity="0.9"
      />
      <path
        d="M120 200C200 120 330 80 440 60"
        stroke={`url(#${id("line")})`}
        strokeDasharray="1 6"
        strokeLinecap="round"
        strokeWidth="1.2"
        opacity="0.55"
      />

      {/* Aeroplane at the end of the route, rotated to the route's direction there. */}
      <g fill="var(--route-3)" transform="translate(530 92) rotate(-65.3) scale(1.5)">
        <path d="M15 0 7 -1.8 -2 -10.5 -6 -10.5 -3 -1.6 -9.5 -1.2 -12 -5 -15 -5 -13.4 0 -15 5 -12 5 -9.5 1.2 -3 1.6 -6 10.5 -2 10.5 7 1.8Z" />
      </g>

      {/* Compass detail near the edge. */}
      <g opacity="0.65" stroke="var(--route-3)" strokeLinecap="round" strokeWidth="0.7" transform="translate(586 214)">
        <circle opacity="0.55" r="21" />
        <circle opacity="0.35" r="14" />
        <path d="M0 -26V26M-26 0H26" opacity="0.4" />
        <path d="M0 -21 4 -4 21 0 4 4 0 21-4 4-21 0-4-4Z" fill="var(--route-1)" fillOpacity="0.3" />
      </g>
    </svg>
  );
}
