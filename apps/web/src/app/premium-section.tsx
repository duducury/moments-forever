"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

export function PremiumSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current || !videoRef.current) return;

      const rect = sectionRef.current.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (isVisible && !isInView) {
        setIsInView(true);
        videoRef.current.play();
      } else if (!isVisible && isInView) {
        setIsInView(false);
        videoRef.current.pause();
      }

      // Sync video progress with scroll
      const sectionStart = rect.top;
      const sectionHeight = rect.height;
      const windowHeight = window.innerHeight;

      const scrollStart = sectionStart - windowHeight;
      const scrollEnd = sectionStart + sectionHeight;
      const totalScroll = scrollEnd - scrollStart;

      let progress = (scrollStart * -1) / totalScroll;
      progress = Math.max(0, Math.min(1, progress));

      if (videoRef.current.duration) {
        videoRef.current.currentTime = progress * videoRef.current.duration;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isInView]);

  return (
    <section
      ref={sectionRef}
      className={styles.premiumSection}
      aria-labelledby="premium-title"
    >
      <div className={styles.premiumInner}>
        <div className={styles.premiumVisual}>
          <video
            ref={videoRef}
            className={styles.premiumVideo}
            autoPlay
            muted
            playsInline
            preload="metadata"
          >
            <source src="/premium-animation.mp4" type="video/mp4" />
          </video>
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
