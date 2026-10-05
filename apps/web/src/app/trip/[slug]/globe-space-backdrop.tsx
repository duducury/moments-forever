"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import {
  PARALLAX_DEPTH,
  easeToward,
  softClamp,
  wrapOffset,
  type ParallaxLayer,
} from "@/lib/map/globe-parallax";

import styles from "./globe-space.module.css";

/** What GlobeMapCanvas calls as the camera moves. */
export interface GlobeParallaxHandle {
  /** How far (px) the globe's surface just moved on screen. The sky follows a fraction of it. */
  nudge(dx: number, dy: number): void;
}

type StarLayerName = Exclude<ParallaxLayer, "nebula">;

interface StarLayer {
  /** Tile size in CSS px (different per layer, so the repeats never line up). */
  readonly tile: number;
  readonly count: number;
  readonly radius: readonly [number, number];
  readonly alpha: readonly [number, number];
  /** Soft glow around the brightest stars. */
  readonly glow: boolean;
  readonly dust: boolean;
  readonly seed: number;
}

const STAR_LAYERS: Readonly<Record<StarLayerName, StarLayer>> = {
  far: { tile: 480, count: 100, radius: [0.35, 0.8], alpha: [0.2, 0.45], glow: false, dust: false, seed: 11 },
  mid: { tile: 560, count: 55, radius: [0.55, 1.1], alpha: [0.3, 0.7], glow: false, dust: true, seed: 29 },
  near: { tile: 640, count: 26, radius: [0.8, 1.4], alpha: [0.5, 0.9], glow: true, dust: false, seed: 47 },
};
const STAR_ORDER: readonly StarLayerName[] = ["far", "mid", "near"];

const TINTS = ["255,255,255", "200,220,255", "255,238,214", "180,205,255"];

/** The sky settles about this fast once the camera stops (half the gap every ...). */
const EASE_HALF_LIFE_MS = 110;
/** Nebula can't tile, so it is bounded to this share of the stage's short side. */
const NEBULA_RANGE = 0.2;

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

/** Paints one seamless tile: anything near an edge is repeated on the opposite side. */
function paintTile(canvas: HTMLCanvasElement, layer: StarLayer, ratio: number): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const size = layer.tile;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size, size);
  const random = mulberry32(layer.seed);
  const between = ([min, max]: readonly [number, number]) => min + random() * (max - min);

  const wrapped = (x: number, y: number, reach: number, draw: (px: number, py: number) => void) => {
    const xs = [x, ...(x < reach ? [x + size] : []), ...(x > size - reach ? [x - size] : [])];
    const ys = [y, ...(y < reach ? [y + size] : []), ...(y > size - reach ? [y - size] : [])];
    for (const px of xs) for (const py of ys) draw(px, py);
  };

  for (let i = 0; i < layer.count; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = between(layer.radius);
    const alpha = between(layer.alpha);
    const tint = TINTS[Math.floor(random() * TINTS.length)]!;
    wrapped(x, y, radius * 5, (px, py) => {
      if (layer.glow) {
        const halo = context.createRadialGradient(px, py, 0, px, py, radius * 5);
        halo.addColorStop(0, `rgba(${tint},${(alpha * 0.35).toFixed(3)})`);
        halo.addColorStop(1, `rgba(${tint},0)`);
        context.fillStyle = halo;
        context.beginPath();
        context.arc(px, py, radius * 5, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`;
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fill();
    });
  }

  if (layer.dust) {
    // A few very faint, soft specks of cosmic dust.
    for (let i = 0; i < 18; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = 1.6 + random() * 2.6;
      const alpha = 0.05 + random() * 0.05;
      wrapped(x, y, radius, (px, py) => {
        const speck = context.createRadialGradient(px, py, 0, px, py, radius);
        speck.addColorStop(0, `rgba(170,195,255,${alpha.toFixed(3)})`);
        speck.addColorStop(1, "rgba(170,195,255,0)");
        context.fillStyle = speck;
        context.beginPath();
        context.arc(px, py, radius, 0, Math.PI * 2);
        context.fill();
      });
    }
  }
}

interface Offset {
  x: number;
  y: number;
}

/**
 * Deep-space background for the globe: a faint nebula (pure CSS) and three star
 * layers (painted once to a tile, repeated, drifted/twinkled by CSS animations).
 * As the MapLibre camera moves, GlobeMapCanvas reports how far the globe's
 * surface moved and each layer follows a small fraction of it — nearer stars
 * more, the nebula least — eased so the sky glides and settles. Work happens
 * only while the sky is catching up; at rest there is no per-frame code. It
 * sits behind the map, ignores pointer events, and stands still under
 * prefers-reduced-motion.
 */
export function GlobeSpaceBackdrop({ ref }: { readonly ref?: Ref<GlobeParallaxHandle> }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nebulaRef = useRef<HTMLDivElement | null>(null);
  const layerRefs = useRef<Record<StarLayerName, HTMLDivElement | null>>({
    far: null,
    mid: null,
    near: null,
  });
  const tileRefs = useRef<Record<StarLayerName, HTMLDivElement | null>>({
    far: null,
    mid: null,
    near: null,
  });
  const engine = useRef({
    target: {
      far: { x: 0, y: 0 },
      mid: { x: 0, y: 0 },
      near: { x: 0, y: 0 },
      nebula: { x: 0, y: 0 },
    } as Record<ParallaxLayer, Offset>,
    current: {
      far: { x: 0, y: 0 },
      mid: { x: 0, y: 0 },
      near: { x: 0, y: 0 },
      nebula: { x: 0, y: 0 },
    } as Record<ParallaxLayer, Offset>,
    frame: 0,
    last: 0,
    reducedMotion: false,
    nebulaRange: 0,
  });
  const startRef = useRef<() => void>(() => {});

  useImperativeHandle(
    ref,
    () => ({
      nudge(dx: number, dy: number) {
        const state = engine.current;
        if (state.reducedMotion || (dx === 0 && dy === 0)) return;
        for (const name of Object.keys(PARALLAX_DEPTH) as ParallaxLayer[]) {
          state.target[name].x += dx * PARALLAX_DEPTH[name];
          state.target[name].y += dy * PARALLAX_DEPTH[name];
        }
        startRef.current();
      },
    }),
    [],
  );

  // Paint the star tiles once.
  useEffect(() => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const urls: string[] = [];
    let cancelled = false;
    for (const name of STAR_ORDER) {
      const layer = STAR_LAYERS[name];
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(layer.tile * ratio);
      canvas.height = Math.round(layer.tile * ratio);
      paintTile(canvas, layer, ratio);
      canvas.toBlob((blob) => {
        const tile = tileRefs.current[name];
        if (cancelled || !blob || !tile) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        tile.style.backgroundImage = `url("${url}")`;
        tile.style.backgroundSize = `${layer.tile}px ${layer.tile}px`;
      });
    }
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  // The parallax loop: only alive while the sky is still catching up.
  useEffect(() => {
    const state = engine.current;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reducedMotion = query.matches;
    const onMotionPreference = () => {
      state.reducedMotion = query.matches;
    };
    query.addEventListener("change", onMotionPreference);

    const root = rootRef.current;
    const measure = () => {
      if (!root) return;
      state.nebulaRange = NEBULA_RANGE * Math.min(root.clientWidth, root.clientHeight);
    };
    measure();
    const observer =
      root && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (root && observer) observer.observe(root);

    function apply() {
      for (const name of STAR_ORDER) {
        const layer = layerRefs.current[name];
        if (!layer) continue;
        const { tile } = STAR_LAYERS[name];
        const { x, y } = state.current[name];
        layer.style.transform = `translate3d(${wrapOffset(x, tile).toFixed(2)}px, ${wrapOffset(y, tile).toFixed(2)}px, 0)`;
      }
      const nebula = nebulaRef.current;
      if (nebula) {
        const { x, y } = state.current.nebula;
        nebula.style.transform = `translate3d(${softClamp(x, state.nebulaRange).toFixed(2)}px, ${softClamp(y, state.nebulaRange).toFixed(2)}px, 0)`;
      }
    }

    function step(now: number) {
      const elapsed = state.last ? Math.min(now - state.last, 64) : 16;
      state.last = now;
      let moving = false;
      for (const name of Object.keys(PARALLAX_DEPTH) as ParallaxLayer[]) {
        const current = state.current[name];
        const target = state.target[name];
        current.x = easeToward(current.x, target.x, elapsed, EASE_HALF_LIFE_MS);
        current.y = easeToward(current.y, target.y, elapsed, EASE_HALF_LIFE_MS);
        if (Math.abs(target.x - current.x) < 0.02 && Math.abs(target.y - current.y) < 0.02) {
          current.x = target.x;
          current.y = target.y;
        } else {
          moving = true;
        }
      }
      apply();
      if (moving) {
        state.frame = requestAnimationFrame(step);
      } else {
        state.frame = 0;
        state.last = 0;
      }
    }

    startRef.current = () => {
      if (state.frame === 0) state.frame = requestAnimationFrame(step);
    };

    return () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.last = 0;
      startRef.current = () => {};
      query.removeEventListener("change", onMotionPreference);
      observer?.disconnect();
    };
  }, []);

  return (
    <div aria-hidden="true" className={styles.space} ref={rootRef}>
      <div className={styles.nebula} ref={nebulaRef} />
      {STAR_ORDER.map((name) => {
        const { tile } = STAR_LAYERS[name];
        return (
          <div
            className={styles.starLayer}
            key={name}
            ref={(element) => {
              layerRefs.current[name] = element;
            }}
            style={{
              left: -tile,
              top: -tile,
              width: `calc(100% + ${tile * 2}px)`,
              height: `calc(100% + ${tile * 2}px)`,
            }}
          >
            <div
              className={`${styles.tile} ${styles[name]}`}
              ref={(element) => {
                tileRefs.current[name] = element;
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
