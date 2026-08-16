import styles from "../perfil/perfil.module.css";

/**
 * Instant shell while /{nome} server data loads —
 * avoids a blank wait when opening Início on the phone.
 */
export default function ProfileLoading() {
  return (
    <main className="page-shell" data-bottom-nav="true">
      <nav className="topbar" aria-label="Navegação">
        <span className={styles.profileLoadingBrand}>Moments Forever</span>
      </nav>
      <div
        aria-busy="true"
        aria-live="polite"
        className={styles.profileLoadingPage}
      >
        <div className={styles.profileLoadingIdentity}>
          <span className={styles.profileLoadingAvatar} />
          <div className={styles.profileLoadingCopy}>
            <span className={styles.profileLoadingLine} style={{ width: "42%" }} />
            <span className={styles.profileLoadingLine} style={{ width: "68%" }} />
            <span className={styles.profileLoadingLine} style={{ width: "55%" }} />
          </div>
        </div>
        <div className={styles.profileLoadingGrid}>
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className={styles.profileLoadingHint}>Abrindo perfil…</p>
      </div>
    </main>
  );
}
