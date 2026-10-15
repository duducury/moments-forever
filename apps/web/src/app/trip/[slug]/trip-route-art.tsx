import { useId } from "react";

import styles from "./trip.module.css";

/**
 * Decorative flight-path illustration behind the place title. Pure inline SVG: layered, fading curves in
 * copper / terracotta / salmon tones taken from the theme (see `.albumHeroRoute` in trip.module.css), a few orbital
 * and contour arcs for depth, and a small aeroplane sitting on the main route and following its direction.
 * It is independent of the destination and the title length, `aria-hidden`, and never takes pointer events.
 */
export function TripRouteArt() {
  const uid = useId().replace(/:/gu, "");
  const fadeIn = `route-fade-in-${uid}`;
  const fadeOut = `route-fade-out-${uid}`;
  const fadeBoth = `route-fade-both-${uid}`;

  return (
    <svg
      aria-hidden="true"
      className={styles.albumHeroRoute}
      fill="none"
      focusable="false"
      preserveAspectRatio="xMaxYMid meet"
      viewBox="0 0 600 220"
    >
      <defs>
        {/* Left end fades out so the curves dissolve behind the title. */}
        <linearGradient id={fadeIn} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--route-1)" stopOpacity="0" />
          <stop offset="0.45" stopColor="var(--route-1)" stopOpacity="0.85" />
          <stop offset="1" stopColor="var(--route-3)" stopOpacity="0.95" />
        </linearGradient>
        {/* Right end fades out. */}
        <linearGradient id={fadeOut} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--route-2)" stopOpacity="0.8" />
          <stop offset="1" stopColor="var(--route-2)" stopOpacity="0" />
        </linearGradient>
        {/* Both ends fade out. */}
        <linearGradient id={fadeBoth} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--route-3)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--route-3)" stopOpacity="0.7" />
          <stop offset="1" stopColor="var(--route-3)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Contour-like arcs: depth, very quiet. */}
      <g stroke={`url(#${fadeBoth})`} strokeWidth="0.8">
        <path d="M120 214C230 150 330 150 470 196" opacity="0.55" />
        <path d="M150 218C250 166 340 168 450 208" opacity="0.4" />
        <path d="M200 8C300 40 420 30 540 94" opacity="0.5" />
        <path d="M230 2C320 28 430 20 560 76" opacity="0.35" />
      </g>

      {/* Orbital curves. */}
      <g strokeLinecap="round">
        <ellipse
          cx="330"
          cy="108"
          rx="250"
          ry="74"
          stroke={`url(#${fadeOut})`}
          strokeWidth="0.9"
          transform="rotate(-14 330 108)"
          opacity="0.6"
        />
        <ellipse
          cx="352"
          cy="100"
          rx="196"
          ry="48"
          stroke={`url(#${fadeBoth})`}
          strokeWidth="0.8"
          transform="rotate(-22 352 100)"
          opacity="0.7"
        />
      </g>

      {/* Secondary routes: thinner, different opacity. */}
      <g strokeLinecap="round">
        <path
          d="M40 150C140 170 210 96 320 118S470 150 580 88"
          stroke={`url(#${fadeBoth})`}
          strokeWidth="1"
          opacity="0.75"
        />
        <path
          d="M90 120C170 70 250 70 330 52S470 20 590 66"
          stroke={`url(#${fadeOut})`}
          strokeDasharray="1 7"
          strokeWidth="1.4"
          opacity="0.8"
        />
      </g>

      {/* Main route. */}
      <path
        d="M10 176C120 196 190 64 318 92S500 24 592 38"
        stroke={`url(#${fadeIn})`}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M10 176C120 196 190 64 318 92S500 24 592 38"
        stroke={`url(#${fadeIn})`}
        strokeDasharray="2 9"
        strokeLinecap="round"
        strokeWidth="3.2"
        opacity="0.35"
      />

      {/* Waypoints. */}
      <g fill="var(--route-3)">
        <circle cx="318" cy="92" r="2.4" opacity="0.85" />
        <circle cx="592" cy="38" r="2" opacity="0.7" />
        <circle cx="318" cy="92" fill="none" r="7" stroke="var(--route-3)" strokeWidth="0.8" opacity="0.45" />
      </g>

      {/* Small aeroplane on the route, rotated to the route's direction at that point. */}
      <g transform="translate(504.6 53.7) rotate(-23.5) scale(1)" fill="var(--route-3)">
        <path d="M15 0 6 -1.6 -3 -9.5 -6.5 -9.5 -3.2 -1.4 -10 -1 -12.5 -4.5 -15 -4.5 -13.5 0 -15 4.5 -12.5 4.5 -10 1 -3.2 1.4 -6.5 9.5 -3 9.5 6 1.6Z" />
      </g>
    </svg>
  );
}
