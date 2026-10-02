"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./journey-sky.module.css";

type Star = {
  x: number;
  y: number;
  r: number;
  layer: number;
  color: string;
  alpha: number;
  phase: number;
  speed: number;
};

type Shot = { x: number; y: number; vx: number; vy: number; born: number };

// How far each depth layer drifts per px scrolled — far stars barely move,
// near ones drift up faster, so the sky slides past as the plane descends.
const PARALLAX = [0.05, 0.12, 0.22] as const;
const TAU = Math.PI * 2;
const SHOT_LIFE_MS = 950;

/**
 * Full-width night-sky band behind its children (the travel journey). The
 * children keep the exact content column they had before; this only adds the
 * backdrop — twinkling stars in three parallax layers plus an occasional
 * shooting star. Dark theme only; in the light theme it renders nothing.
 */
export function JourneySky({ children }: { children: ReactNode }) {
  const bandRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const band = bandRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!band || !canvas || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    const isDark = () => root.dataset.resolvedTheme === "dark";
    const random = (min: number, max: number) => min + Math.random() * (max - min);

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let shot: Shot | null = null;
    let nextShot = 0;
    let raf = 0;
    let running = false;
    let visible = false;

    const makeStar = (): Star => {
      const warm = Math.random() < 0.08;
      const hue = warm ? random(22, 40) : random(200, 225);
      const saturation = warm ? 85 : random(30, 80);
      const lightness = warm ? 78 : random(82, 94);
      const layer = Math.floor(Math.random() * PARALLAX.length);
      return {
        x: random(0, width),
        y: random(0, height),
        r: random(0.5, 1.1) + layer * 0.35,
        layer,
        color: `hsl(${hue.toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%)`,
        alpha: random(0.35, 0.95),
        phase: random(0, TAU),
        speed: random(0.0006, 0.0021),
      };
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const offset = -band.getBoundingClientRect().top;

      for (const star of stars) {
        const drift = star.y - offset * PARALLAX[star.layer];
        const y = ((drift % height) + height) % height;
        const twinkle = reduced ? 1 : 0.62 + 0.38 * Math.sin(time * star.speed + star.phase);
        context.globalAlpha = star.alpha * twinkle;
        context.fillStyle = star.color;
        context.beginPath();
        context.arc(star.x, y, star.r, 0, TAU);
        context.fill();
      }
      context.globalAlpha = 1;

      if (reduced) return;
      if (!shot && time > nextShot) {
        const angle = random(0.45, 0.7);
        const speed = random(0.9, 1.3);
        shot = {
          x: random(width * 0.1, width * 0.8),
          y: random(0, height * 0.35),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          born: time,
        };
      }
      if (shot) {
        const age = time - shot.born;
        if (age > SHOT_LIFE_MS) {
          shot = null;
          nextShot = time + random(6000, 12000);
        } else {
          const headX = shot.x + shot.vx * age;
          const headY = shot.y + shot.vy * age;
          const tail = 110;
          const length = Math.hypot(shot.vx, shot.vy);
          const tailX = headX - (shot.vx / length) * tail;
          const tailY = headY - (shot.vy / length) * tail;
          const fade = 1 - age / SHOT_LIFE_MS;
          const gradient = context.createLinearGradient(tailX, tailY, headX, headY);
          gradient.addColorStop(0, "rgba(190, 220, 255, 0)");
          gradient.addColorStop(1, `rgba(235, 245, 255, ${(0.85 * fade).toFixed(3)})`);
          context.strokeStyle = gradient;
          context.lineWidth = 1.4;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(headX, headY);
          context.stroke();
        }
      }
    };

    const loop = (time: number) => {
      raf = 0;
      if (!visible || document.hidden || !isDark()) {
        running = false;
        return;
      }
      draw(time);
      raf = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced || running || !visible || !isDark()) return;
      running = true;
      nextShot = performance.now() + random(2500, 5000);
      raf = window.requestAnimationFrame(loop);
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(width < 720 ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(70, Math.round((width * height) / 5500));
      stars = Array.from({ length: count }, makeStar);
      if (!running && isDark()) draw(0);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    intersection.observe(band);
    const themeObserver = new MutationObserver(() => {
      if (isDark()) start();
    });
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-resolved-theme"],
    });
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return () => {
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.band} ref={bandRef}>
      <div aria-hidden="true" className={styles.sky}>
        <div className={styles.pin}>
          <canvas className={styles.canvas} ref={canvasRef} />
        </div>
        <div className={`${styles.fade} ${styles.fadeTop}`} />
        <div className={`${styles.fade} ${styles.fadeBottom}`} />
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
