import styles from "./passaporte.module.css";

/**
 * Instant shell while /passaporte server data loads —
 * avoids a blank 3–4s wait when switching tabs on the phone.
 */
export default function PassaporteLoading() {
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
