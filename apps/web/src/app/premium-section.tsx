"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

const TOTAL_FRAMES = 80;

export function PremiumSection() {
  const [frameIndex, setFrameIndex] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;

      const rect = sectionRef.current.getBoundingClientRect();
      const sectionStart = rect.top;
      const sectionHeight = rect.height;
      const windowHeight = window.innerHeight;

      const scrollStart = sectionStart - windowHeight;
      const scrollEnd = sectionStart + sectionHeight;
      const totalScroll = scrollEnd - scrollStart;

      let progress = (scrollStart * -1) / totalScroll;
      progress = Math.max(0, Math.min(1, progress));

      const newFrameIndex = Math.floor(progress * (TOTAL_FRAMES - 1));
      setFrameIndex(newFrameIndex);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const frameNumber = String(frameIndex + 1).padStart(3, "0");

  return (
    <section
      ref={sectionRef}
      className={styles.premiumSection}
      aria-labelledby="premium-title"
    >
      <div className={styles.premiumInner}>
        <div className={styles.premiumVisual}>
          <Image
            src={`/premium-frames/ezgif-frame-${frameNumber}.jpg`}
            alt="Animação de apresentação do Moments Forever"
            width={700}
            height={800}
            sizes="(max-width: 720px) 76vw, 390px"
            priority={frameIndex < 5}
          />
        </div>

        <div className={styles.premiumCopy}>
          <h2 className={styles.premiumTitle} id="premium-title">
            Leve suas memórias com você.
          </h2>
          <p className={styles.premiumLead}>
            Organize viagens, marque lugares, e acesse suas melhores fotos em qualquer lugar. Sem assinatura, sem complicações.
          </p>
          <ul className={styles.premiumList}>
            <li>Coleções organizadas por viagem</li>
            <li>Marque locais com tags NFC</li>
            <li>Acesso ilimitado aos seus momentos</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
