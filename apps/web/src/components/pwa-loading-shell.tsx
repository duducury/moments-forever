import styles from "./pwa-loading-shell.module.css";

type Variant = "profile" | "passport" | "minimal";

/**
 * Instant paint while server data loads — avoids a blank wait when opening the
 * site from the iPhone home screen (standalone PWA).
 */
export function PwaLoadingShell({
  hint,
  variant = "profile",
}: {
  readonly hint: string;
  readonly variant?: Variant;
}) {
  return (
    <main
      className="page-shell"
      data-bottom-nav={variant === "profile" ? "true" : undefined}
    >
      <nav className="topbar" aria-label="Navegação">
        <span className={styles.brand}>Moments Forever</span>
      </nav>
      <div className={styles.page} aria-busy="true" aria-live="polite">
        <div className={styles.identity}>
          <span className={styles.avatar} />
          <div className={styles.copy}>
            <span className={styles.line} style={{ width: "28%" }} />
            <span className={styles.line} style={{ width: "55%" }} />
            <span className={styles.line} style={{ width: "72%" }} />
          </div>
        </div>
        <div className={styles.panel} />
        {variant === "profile" ? <div className={styles.grid} /> : null}
        {variant === "passport" ? <div className={styles.map} /> : null}
        <p className={styles.hint}>{hint}</p>
      </div>
    </main>
  );
}
