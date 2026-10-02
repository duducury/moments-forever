import styles from "@/app/trip/[slug]/trip.module.css";

import { SignalPwaBootReady } from "./signal-pwa-boot-ready";

/**
 * Instant album-shaped shell while album server data loads — avoids a blank
 * wait when opening a place from the profile grid or an NFC link. It also
 * dismisses the cold-start splash: once this shell is on screen it IS the
 * loading state, so there is no second "loading" screen after the splash.
 */
export function AlbumLoadingShell() {
  return (
    <main className="page-shell" data-bottom-nav="true">
      <SignalPwaBootReady />
      <nav className="topbar" aria-label="Navegação">
        <span className={styles.albumLoadingBrand}>Moments Forever</span>
      </nav>
      <div
        aria-busy="true"
        aria-live="polite"
        className={styles.albumLoadingPage}
      >
        <div className={styles.albumLoadingHero} />
        <div className={styles.albumLoadingMap} />
        <div className={styles.albumLoadingGrid}>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className={styles.albumLoadingHint}>Abrindo álbum…</p>
      </div>
    </main>
  );
}
