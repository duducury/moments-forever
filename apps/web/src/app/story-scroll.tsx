"use client";

import Image from "next/image";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { useEffect, useRef, useState } from "react";

import styles from "./story-scroll.module.css";

const display = Plus_Jakarta_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-story-display",
  weight: ["800"],
});
const body = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-story-body",
  weight: ["400"],
});

type Segment = { readonly text: string; readonly accent?: boolean };
type Word = { readonly text: string; readonly accent: boolean; readonly index: number };

const STEPS: readonly (readonly Segment[])[] = [
  [{ text: "Suas viagens são feitas de " }, { text: "momentos.", accent: true }],
  [{ text: "Cada destino guarda uma " }, { text: "história.", accent: true }],
  [
    { text: "Cada foto guarda um " },
    { text: "pedaço dessa história.", accent: true },
    { text: " E algumas memórias merecem ficar " },
    { text: "por perto.", accent: true },
  ],
  [
    { text: "Transforme suas viagens em " },
    { text: "uma coleção de histórias.", accent: true },
  ],
];

function toWords(segments: readonly Segment[]): readonly Word[] {
  return segments
    .flatMap((segment) =>
      segment.text
        .trim()
        .split(/\s+/)
        .map((text) => ({ text, accent: Boolean(segment.accent) })),
    )
    .map((word, index) => ({ ...word, index }));
}

const PHRASES = STEPS.map(toWords);
const FINAL_INDEX = PHRASES.length - 1;

// How much scroll each step owns. The last one is longer so the closing
// phrase stays on screen for a beat before the section releases.
const WEIGHTS = [1, 1, 1, 1.6] as const;
const TOTAL_WEIGHT = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
const THRESHOLDS = WEIGHTS.map(
  (_, index) =>
    WEIGHTS.slice(0, index + 1).reduce((sum, weight) => sum + weight, 0) /
    TOTAL_WEIGHT,
);

function stepForProgress(progress: number): number {
  const index = THRESHOLDS.findIndex((threshold) => progress < threshold);
  return index === -1 ? WEIGHTS.length - 1 : index;
}

type Particle = { x: number; y: number; z: number; r: number; h: number; a: number };

export function StoryScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);

  // Scroll → step + gradient drift.
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    let frame = 0;
    const render = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const stageHeight = stage.offsetHeight || window.innerHeight;
      const travel = Math.max(1, section.offsetHeight - stageHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      progressRef.current = progress;
      section.style.setProperty("--gp", (progress * 100).toFixed(2));
      section.style.setProperty("--ga", `${(90 + progress * 60).toFixed(1)}deg`);
      setEntered(rect.top < window.innerHeight * 0.55);
      setActive(stepForProgress(progress));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // Background particles: drift back in depth as the visitor scrolls. Only
  // animates while the section is on screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const section = sectionRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !stage || !section || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let camera = 0;
    let pointerX = 0;
    let pointerY = 0;
    let raf = 0;
    let running = false;
    let visible = false;
    const random = (min: number, max: number) => min + Math.random() * (max - min);

    const draw = () => {
      const light = document.documentElement.dataset.resolvedTheme === "light";
      const progress = progressRef.current;
      context.clearRect(0, 0, width, height);
      camera += (progress * 1400 - camera) * 0.07;
      for (const p of particles) {
        let z = p.z - camera;
        while (z < 60) {
          p.z += 1600;
          z = p.z - camera;
        }
        while (z > 1900) {
          p.z -= 1600;
          z = p.z - camera;
        }
        const scale = 320 / z;
        const sx = (p.x + pointerX * 120) * scale + width / 2;
        const sy = (p.y + pointerY * 120) * scale + height / 2;
        const radius = p.r * Math.max(0.2, scale * 4);
        const alpha = (0.07 + p.a * (0.6 + 0.4 * (1 - progress))) * (light ? 0.8 : 1);
        const color = light ? `hsla(${p.h}, 70%, 45%,` : `hsla(${p.h}, 90%, 72%,`;
        const gradient = context.createRadialGradient(sx, sy, 0, sx, sy, radius * 7);
        gradient.addColorStop(0, `${color}${alpha})`);
        gradient.addColorStop(1, `${color}0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(sx, sy, radius, 0, Math.PI * 2);
        context.fill();
        p.a = Math.min(0.16, Math.max(0.02, p.a + (Math.random() - 0.5) * 0.004));
      }
    };

    const loop = () => {
      raf = 0;
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      draw();
      raf = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced || running || !visible) return;
      running = true;
      raf = window.requestAnimationFrame(loop);
    };

    const resize = () => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      const ratio = Math.min(width < 720 ? 1.5 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: width < 720 ? 200 : 440 }, () => ({
        x: random(-1, 1) * width * 0.85,
        y: random(-1, 1) * height * 0.85,
        z: random(250, 1900),
        r: random(0.6, 1.6),
        h: 14 + Math.random() * 28,
        a: random(0.05, 0.12),
      }));
      if (!running) draw();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    const onVisibility = () => start();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    intersection.observe(section);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return () => {
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const position = (index: number) =>
    !entered ? "next" : index < active ? "past" : index === active ? "active" : "next";

  return (
    <section
      aria-labelledby="story-title"
      className={`${styles.story} ${display.variable} ${body.variable}`}
      ref={sectionRef}
      style={{ "--story-units": TOTAL_WEIGHT } as React.CSSProperties}
    >
      <div className={styles.stage} ref={stageRef}>
        <canvas aria-hidden="true" className={styles.space} ref={canvasRef} />

        <div className={styles.inner}>
          <div className={styles.copy}>
            <div className={styles.phrases}>
              {PHRASES.map((words, step) => {
                const isFinal = step === FINAL_INDEX;
                const Heading = isFinal ? "h2" : "p";
                return (
                  <div
                    className={styles.phrase}
                    data-pos={position(step)}
                    key={step}
                  >
                    <Heading
                      className={styles.line}
                      id={isFinal ? "story-title" : undefined}
                    >
                      {words.map((word) => (
                        <span key={word.index}>
                          <span
                            className={`${styles.word} ${word.accent ? styles.accent : ""}`}
                            style={{ "--i": word.index } as React.CSSProperties}
                          >
                            {word.text}
                          </span>{" "}
                        </span>
                      ))}
                    </Heading>
                    {isFinal ? (
                      <p className={styles.support}>
                        Organize suas experiências, reúna suas fotos e
                        transforme cada destino em uma parte da sua própria
                        história.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <ol aria-hidden="true" className={styles.dots} data-entered={entered}>
              {WEIGHTS.map((_, index) => (
                <li className={styles.dot} data-active={index === active} key={index} />
              ))}
            </ol>
          </div>

          <div className={styles.visual}>
            <Image
              alt="Ímã de souvenir de Nova York ao lado de duas telas do app Moments Forever, com o mapa de lugares e o perfil de uma viagem"
              className={styles.image}
              fill
              sizes="(max-width: 719px) 90vw, 46vw"
              src="/home/story-memories.webp"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
