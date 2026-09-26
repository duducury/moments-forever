"use client";

import styles from "./home.module.css";

export function PremiumSection() {
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
