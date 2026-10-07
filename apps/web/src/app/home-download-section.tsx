import Image from "next/image";

import { HomeAppStoreBadge } from "./home-app-store-badge";
import styles from "./home.module.css";

/**
 * "Baixe o Moments Forever": download section between the plans and the final
 * banner. Web only — CSS hides the whole section inside the iOS app (the
 * `data-native-ios-app` marker, see nativeIosAppMarkerScript). Appears with the
 * shared `data-reveal` scroll mechanism; the staging of its parts lives in
 * home.module.css.
 */
export function HomeDownloadSection() {
  return (
    <section
      aria-labelledby="home-download-title"
      className={styles.download}
      data-reveal
    >
      <svg
        aria-hidden="true"
        className={styles.downloadRoute}
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 600 360"
      >
        <path
          d="M-10 300 C 140 80, 330 40, 610 150"
          stroke="currentColor"
          strokeDasharray="2 9"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle cx="96" cy="206" fill="currentColor" r="4" />
        <circle cx="468" cy="96" fill="currentColor" r="4" />
      </svg>

      <div className={styles.downloadCopy}>
        <div className={styles.downloadText}>
          <p className={styles.downloadEyebrow}>Aplicativo para iPhone</p>
          <h2 className={styles.downloadTitle} id="home-download-title">
            Baixe o Moments Forever
          </h2>
          <p className={styles.downloadLead}>Leve suas memórias com você.</p>
          <p className={styles.downloadBody}>
            Tenha suas viagens, fotos e momentos especiais sempre à mão, para
            reviver onde e quando quiser.
          </p>
        </div>
        <div className={styles.downloadAction}>
          <HomeAppStoreBadge />
        </div>
      </div>

      <div className={styles.downloadVisual} aria-hidden="true">
        <div className={`${styles.downloadPolaroid} ${styles.downloadPolaroidLeft}`}>
          <Image
            alt=""
            className={styles.downloadPolaroidImage}
            height={1500}
            sizes="120px"
            src="/home/amalfi.jpg"
            width={1200}
          />
        </div>
        <div className={`${styles.downloadPolaroid} ${styles.downloadPolaroidRight}`}>
          <Image
            alt=""
            className={styles.downloadPolaroidImage}
            height={798}
            sizes="120px"
            src="/home/paris.jpg"
            width={1200}
          />
        </div>
        <div className={styles.downloadPhone}>
          <div className={styles.downloadScreen}>
            <Image
              alt=""
              className={styles.downloadScreenImage}
              height={1600}
              sizes="240px"
              src="/home/santorini.jpg"
              width={1200}
            />
            <span className={styles.downloadIsland} />
            <div className={styles.downloadScreenCard}>
              <p className={styles.downloadScreenKicker}>Perfil</p>
              <p className={styles.downloadScreenTitle}>Santorini, Grécia</p>
              <p className={styles.downloadScreenMeta}>12 jun 2024 · 9 fotos</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
