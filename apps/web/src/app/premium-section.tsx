"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

export function PremiumSection() {
  const copyRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = copyRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.premiumSection} aria-labelledby="premium-title">
      <div className={styles.premiumInner}>
        <div className={styles.premiumVisual}>
          <video
            className={styles.premiumVideo}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          >
            <source src="/premium-animation.mp4" type="video/mp4" />
          </video>
        </div>

        <div
          className={`${styles.premiumCopy} ${isVisible ? styles.premiumCopyVisible : ""}`}
          ref={copyRef}
        >
          <h2 className={styles.premiumTitle} id="premium-title">
            Um toque leva você direto à viagem.
          </h2>
          <p className={styles.premiumLead}>
            Usamos tecnologia NFC: aproxime o celular de um ímã e o
            aplicativo abre, na hora, o álbum daquela viagem específica.
          </p>
          <ul className={styles.premiumList}>
            <li>Cada ímã é vinculado a uma viagem específica</li>
            <li>Basta aproximar o celular, sem precisar abrir o app</li>
            <li>Suas fotos ficam organizadas automaticamente por lugar</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
