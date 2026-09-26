"use client";

import Image from "next/image";
import styles from "./home.module.css";

export function PremiumSection() {
  return (
    <section className={styles.premiumSection} aria-labelledby="premium-title">
      <div className={styles.premiumInner}>
        <div className={styles.premiumVisual}>
          <div className={styles.premiumPhone}>
            <div className={styles.premiumPhoneScreen}>
              <div className={styles.premiumPhoneContent}>
                <svg
                  className={styles.premiumPhoneIcon}
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <rect
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    width="16"
                    x="4"
                    y="6"
                  />
                  <path
                    d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <p className={styles.premiumPhoneLabel}>
                  Moments Forever
                </p>
                <p className={styles.premiumPhoneDescription}>
                  Guarde suas viagens
                </p>
              </div>
            </div>
          </div>
          <div className={styles.premiumPhotoFrame}>
            <Image
              alt="Santorini — cenário de exemplo"
              className={styles.premiumPhotoFrameImage}
              height={600}
              src="/home/santorini.jpg"
              width={400}
            />
          </div>
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
