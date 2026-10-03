import Link from "next/link";

import styles from "./home.module.css";

export function HomeFooterNav() {
  return (
    <nav aria-label="Rodapé" className={styles.footerNav}>
      <Link className={styles.footerLink} href="/privacidade">
        Privacidade
      </Link>
      <Link className={styles.footerLink} href="/politica-de-privacidade">
        Política de Privacidade
      </Link>
      <Link className={styles.footerLink} href="/login">
        Entrar
      </Link>
    </nav>
  );
}
