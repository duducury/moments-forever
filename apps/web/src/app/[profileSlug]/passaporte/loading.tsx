import styles from "../../passaporte/passaporte.module.css";

/**
 * Instant shell while the public /{profileSlug}/passaporte data loads —
 * mirrors /passaporte/loading.tsx.
 */
export default function PublicProfilePassportLoading() {
  return (
    <main className="page-shell" data-bottom-nav="true">
      <nav className="topbar" aria-label="Navegação">
        <span className={styles.loadingBrand}>Moments Forever</span>
      </nav>
      <div className={styles.loadingPage} aria-busy="true" aria-live="polite">
        <div className={styles.loadingIdentity}>
          <span className={styles.loadingAvatar} />
          <div className={styles.loadingCopy}>
            <span className={styles.loadingLine} style={{ width: "28%" }} />
            <span className={styles.loadingLine} style={{ width: "55%" }} />
            <span className={styles.loadingLine} style={{ width: "72%" }} />
          </div>
        </div>
        <div className={styles.loadingPanel} />
        <div className={styles.loadingMap} />
        <p className={styles.loadingHint}>Abrindo passaporte…</p>
      </div>
    </main>
  );
}
