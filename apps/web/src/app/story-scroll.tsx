"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import styles from "./story-scroll.module.css";

const STEPS = [
  "Suas viagens são feitas de momentos.",
  "Cada destino guarda uma história.",
  "Cada foto guarda um pedaço dela.",
  "E algumas memórias merecem ficar por perto.",
] as const;

// How much scroll each step owns. The last one is longer so the closing
// phrase stays on screen for a beat before the section releases.
const WEIGHTS = [1, 1, 1, 1, 1.6] as const;
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

export function StoryScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);

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

  const position = (index: number) =>
    !entered ? "next" : index < active ? "past" : index === active ? "active" : "next";

  return (
    <section
      aria-labelledby="story-title"
      className={styles.story}
      ref={sectionRef}
      style={{ "--story-units": TOTAL_WEIGHT } as React.CSSProperties}
    >
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.copy}>
          <div className={styles.phrases}>
            {STEPS.map((text, index) => (
              <div className={styles.phrase} data-pos={position(index)} key={text}>
                <p className={styles.line}>{text}</p>
              </div>
            ))}
            <div
              className={`${styles.phrase} ${styles.final}`}
              data-pos={position(STEPS.length)}
            >
              <h2 className={`${styles.line} ${styles.finalLine}`} id="story-title">
                Transforme suas viagens em <em>uma coleção de histórias.</em>
              </h2>
              <p className={styles.support}>
                Organize suas experiências, reúna suas fotos e transforme cada
                destino em uma parte da sua própria história.
              </p>
            </div>
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
    </section>
  );
}
