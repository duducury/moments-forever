import styles from "@/app/trip/[slug]/trip.module.css";

/**
 * Instant shell while album server data loads —
 * avoids a blank wait when opening a place from the profile grid.
 */
export default function AlbumLoading() {
  return (
    <main className="page-shell" data-bottom-nav="true">
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
