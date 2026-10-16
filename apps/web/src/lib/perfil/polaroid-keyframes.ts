/**
 * Keyframes of the "stacked photos" animation for `n` photos, equivalent to the original Sass:
 *
 *   @keyframes slide {
 *     #{50/$n}%  { transform: translateX(120%) rotate(var(--r)) }
 *     0%, 100%, #{100/$n}% { transform: translateX(0%) rotate(var(--r)) }
 *   }
 *   @keyframes z-order      { #{50/$n}%, #{100/$n}% { z-index: 1 }  #{100 - 100/$n}% { z-index: 2 } }
 *   @keyframes z-order-last { #{50/$n}%, #{100/$n}% { z-index: 1 }  #{100 - 50/$n}%  { z-index: 2 } }
 *
 * Keyframe selectors cannot use var(), and the number of photos is only known at runtime, so the percentages are
 * computed here and emitted as plain CSS. Each photo's turn takes the first `100/n` % of its cycle (out at `50/n` %,
 * back at `100/n` %), the rest of the cycle it rests; its `--i`/`--n` delay staggers the turns.
 */
export const POLAROID_SLIDE_DISTANCE = "120%";

function pct(value: number): string {
  return `${Number(value.toFixed(3))}%`;
}

export function polaroidAnimationNames(n: number): {
  readonly slide: string;
  readonly z: string;
  readonly zLast: string;
} {
  return {
    slide: `mf-polaroid-slide-${n}`,
    z: `mf-polaroid-z-${n}`,
    zLast: `mf-polaroid-z-last-${n}`,
  };
}

/** The CSS for `n` photos (n >= 2). */
export function polaroidKeyframesCss(n: number): string {
  const names = polaroidAnimationNames(n);
  const out = pct(50 / n);
  const back = pct(100 / n);
  return [
    `@keyframes ${names.slide}{`,
    `${out}{transform:translateX(${POLAROID_SLIDE_DISTANCE}) rotate(var(--r))}`,
    `0%,100%,${back}{transform:translateX(0%) rotate(var(--r))}`,
    `}`,
    `@keyframes ${names.z}{`,
    `${out},${back}{z-index:1}`,
    `${pct(100 - 100 / n)}{z-index:2}`,
    `}`,
    `@keyframes ${names.zLast}{`,
    `${out},${back}{z-index:1}`,
    `${pct(100 - 50 / n)}{z-index:2}`,
    `}`,
  ].join("");
}

/** Stable per-photo rotation in -19deg..20deg, like the original `(-20 + random(40)) * 1deg`. */
export function polaroidRotationDegrees(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  }
  return (hash % 40) - 19;
}
