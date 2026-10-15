import { useId } from "react";

import {
  WORLD_OUTLINE_PATH,
  WORLD_OUTLINE_VIEWBOX,
} from "@/lib/geo/world-outline";

import styles from "./trip.module.css";

/**
 * Decorative backdrop behind the place title: a quiet world map (simplified continent outlines, see
 * `lib/geo/world-outline.ts`), dotted great-circle style routes, thin orbital and topographic curves, a small
 * aeroplane on one route and a compass detail. It is purely generic: no pins, no destination markers and no
 * trip-specific data, so the same artwork serves every country, city and trip. Inline vector, no animation,
 * `aria-hidden` and never interactive. Colours come from the theme (`--route-*` in trip.module.css).
 */
export function TripRouteArt() {
  const uid = useId().replace(/:/gu, "");
  const land = `route-land-${uid}`;
  const fade = `route-fade-${uid}`;

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
        <linearGradient id={land} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--route-2)" />
          <stop offset="0.55" stopColor="var(--route-1)" />
          <stop offset="1" stopColor="var(--route-3)" />
        </linearGradient>
        <linearGradient id={fade} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--route-3)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--route-3)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--route-3)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* World map: fine outlines with a barely-there fill. */}
      <path
        d={WORLD_OUTLINE_PATH}
        fill="var(--route-1)"
        fillOpacity="0.05"
        stroke={`url(#${land})`}
        strokeLinejoin="round"
        strokeOpacity="0.45"
        strokeWidth="0.7"
      />

      {/* Topographic contours (bottom-left) and orbital curves. */}
      <g stroke={`url(#${fade})`} strokeLinecap="round" strokeWidth="0.7">
        <ellipse cx="120" cy="230" rx="150" ry="58" opacity="0.5" />
        <ellipse cx="120" cy="230" rx="118" ry="44" opacity="0.4" />
        <ellipse cx="120" cy="230" rx="86" ry="30" opacity="0.32" />
        <ellipse cx="120" cy="230" rx="54" ry="17" opacity="0.25" />
        <ellipse cx="400" cy="120" rx="330" ry="104" opacity="0.5" transform="rotate(-12 400 120)" />
        <ellipse cx="410" cy="116" rx="262" ry="70" opacity="0.4" transform="rotate(-20 410 116)" />
      </g>

      {/* Dotted flight routes (no end markers). */}
      <g stroke="var(--route-3)" strokeDasharray="0.5 6" strokeLinecap="round" strokeWidth="1.8">
        <path d="M190 172C280 28 450 18 548 112" opacity="0.9" />
        <path d="M70 120C150 40 250 36 330 96" opacity="0.55" />
        <path d="M300 200C400 150 520 150 650 70" opacity="0.5" />
      </g>

      {/* Small aeroplane on the main route, rotated to the route's direction there. */}
      <g fill="var(--route-3)" transform="translate(405.6 51) rotate(2.6) scale(0.9)">
        <path d="M15 0 6 -1.6 -3 -9.5 -6.5 -9.5 -3.2 -1.4 -10 -1 -12.5 -4.5 -15 -4.5 -13.5 0 -15 4.5 -12.5 4.5 -10 1 -3.2 1.4 -6.5 9.5 -3 9.5 6 1.6Z" />
      </g>

      {/* Compass detail. */}
      <g stroke="var(--route-3)" strokeLinecap="round" strokeWidth="0.8" transform="translate(618 204)" opacity="0.7">
        <circle r="22" opacity="0.6" />
        <circle r="15" opacity="0.4" />
        <path d="M0 -27V27M-27 0H27" opacity="0.45" />
        <path d="M0 -22 4 -4 22 0 4 4 0 22-4 4-22 0-4-4Z" fill="var(--route-1)" fillOpacity="0.28" />
      </g>
    </svg>
  );
}
