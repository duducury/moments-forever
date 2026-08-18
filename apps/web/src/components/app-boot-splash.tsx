import styles from "./app-boot-splash.module.css";

/**
 * Branded wait state for iPhone home-screen / login cold start.
 * Inline layout splash mirrors this so the first paint is never a blank page.
 */
export function AppBootSplash({
  hint = "Abrindo sua coleção…",
  overlay = false,
}: {
  readonly hint?: string;
  readonly overlay?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={styles.splash}
      data-overlay={overlay ? "true" : undefined}
      role="status"
    >
      <div className={styles.stage}>
        {/* Static PNG so the mark appears before Next/Image hydrates. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className={styles.mark}
          height={88}
          src="/brand/apple-touch-icon.png"
          width={88}
        />
        <p className={styles.wordmark}>Moments Forever</p>
        <p className={styles.slogan}>Colecione momentos, não coisas.</p>
        <p className={styles.hint}>{hint}</p>
        <span aria-hidden="true" className={styles.pulse} />
      </div>
    </div>
  );
}
