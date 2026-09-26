"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./home.module.css";

const BENEFITS = [
  {
    label: "Uma viagem por ímã",
    icon: (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 21s7-7.58 7-12A7 7 0 1 0 5 9c0 4.42 7 12 7 12Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    label: "Toque para reviver",
    icon: (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path
          d="M8 12.5a4 4 0 0 1 8 0"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <path
          d="M5.3 12.5a6.7 6.7 0 0 1 13.4 0"
          opacity="0.55"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="16.5" fill="currentColor" r="1.3" />
      </svg>
    ),
  },
  {
    label: "Fotos e histórias no mesmo lugar",
    icon: (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <rect
          height="11"
          rx="1.8"
          stroke="currentColor"
          strokeWidth="1.5"
          width="13"
          x="5"
          y="7.5"
        />
        <path
          d="M8.2 7.5V5.9A1.9 1.9 0 0 1 10.1 4h3.8a1.9 1.9 0 0 1 1.9 1.9v1.6"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
] as const;

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
          <span className={styles.premiumEyebrow}>Memórias que ficam</span>
          <h2 className={styles.premiumTitle} id="premium-title">
            Seu souvenir agora conta a história da viagem.
          </h2>
          <p className={styles.premiumLead}>
            Cada ímã guarda uma viagem. Com um simples toque, você volta
            para as fotos, lugares e momentos que fizeram parte dela.
          </p>
          <ul className={styles.premiumBenefits}>
            {BENEFITS.map((benefit) => (
              <li className={styles.premiumBenefit} key={benefit.label}>
                <span className={styles.premiumBenefitIcon}>{benefit.icon}</span>
                <span>{benefit.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
