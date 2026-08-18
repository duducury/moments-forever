import styles from "./app-boot-splash.module.css";

const splashStyle = {
  background:
    "radial-gradient(90% 60% at 50% 18%, rgb(208 138 110 / 18%), transparent 58%), #121110",
  color: "#f3efe8",
} as const;

/**
 * Branded wait state for iPhone home-screen / login cold start.
 * Inline colors so the screen stays dark before the CSS module loads.
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
      style={splashStyle}
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
