"use client";

import { useEffect, useRef } from "react";

import styles from "./globe-space.module.css";

interface StarLayer {
  readonly count: number;
  readonly radius: readonly [number, number];
  readonly alpha: readonly [number, number];
  /** Soft glow around the brightest stars. */
  readonly glow: boolean;
}

const LAYERS: Readonly<Record<"far" | "mid" | "near", StarLayer>> = {
  far: { count: 150, radius: [0.35, 0.8], alpha: [0.22, 0.55], glow: false },
  mid: { count: 70, radius: [0.55, 1.1], alpha: [0.35, 0.8], glow: false },
  near: { count: 22, radius: [0.85, 1.5], alpha: [0.55, 1], glow: true },
};

const TINTS = ["255,255,255", "200,220,255", "255,238,214", "180,205,255"];

/** Small deterministic PRNG so the sky looks the same on every visit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintStars(
  canvas: HTMLCanvasElement,
  layer: StarLayer,
  seed: number,
  dust: boolean,
): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = canvas.width / Math.max(1, canvas.clientWidth);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const random = mulberry32(seed);
  const between = ([min, max]: readonly [number, number]) => min + random() * (max - min);

  for (let i = 0; i < layer.count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = between(layer.radius);
    const alpha = between(layer.alpha);
    const tint = TINTS[Math.floor(random() * TINTS.length)]!;
    if (layer.glow) {
      const halo = context.createRadialGradient(x, y, 0, x, y, radius * 5);
      halo.addColorStop(0, `rgba(${tint},${(alpha * 0.35).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${tint},0)`);
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, radius * 5, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  if (dust) {
    // A few very faint, soft specks of cosmic dust.
    for (let i = 0; i < 26; i += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = 1.6 + random() * 2.6;
      const speck = context.createRadialGradient(x, y, 0, x, y, radius);
      speck.addColorStop(0, `rgba(170,195,255,${(0.05 + random() * 0.05).toFixed(3)})`);
      speck.addColorStop(1, "rgba(170,195,255,0)");
      context.fillStyle = speck;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

/**
 * Deep-space background for the globe: a faint nebula (pure CSS) and three
 * star layers (painted once to canvas, drifted/twinkled by CSS animations, so
 * there is no per-frame JavaScript). Sits behind the map, ignores pointer
 * events, and stands still under prefers-reduced-motion.
 */
export function GlobeSpaceBackdrop() {
  const farRef = useRef<HTMLCanvasElement | null>(null);
  const midRef = useRef<HTMLCanvasElement | null>(null);
  const nearRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvases = [
      [farRef.current, LAYERS.far, 11, false],
      [midRef.current, LAYERS.mid, 29, true],
      [nearRef.current, LAYERS.near, 47, false],
    ] as const;

    let frame = 0;
    function paintAll() {
      // Capped pixel ratio: stars are tiny, and three full-screen layers add up.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      for (const [canvas, layer, seed, dust] of canvases) {
        if (!canvas) continue;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) continue;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        paintStars(canvas, layer, seed, dust);
      }
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paintAll);
    }

    schedule();
    const parent = farRef.current?.parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    if (parent && observer) observer.observe(parent);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  return (
    <div aria-hidden="true" className={styles.space}>
      <canvas className={`${styles.layer} ${styles.far}`} ref={farRef} />
      <canvas className={`${styles.layer} ${styles.mid}`} ref={midRef} />
      <canvas className={`${styles.layer} ${styles.near}`} ref={nearRef} />
    </div>
  );
}
