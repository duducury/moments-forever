import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { ThemeSelector } from "@/components/theme-selector";

export default function LoginPage() {
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <Link className="wordmark" href="/">
          Moments Forever
        </Link>
        <div className="auth-actions">
          <ThemeSelector />
          <Link className="text-link" href="/">
            Voltar
          </Link>
        </div>
      </nav>
      <section className="narrow">
        <p className="eyebrow">Sua coleção privada</p>
        <h1>Entre para guardar o que importa.</h1>
        <p className="lead">
          Novas memórias permanecem privadas até você decidir publicá-las.
        </p>
        <AuthForm />
      </section>
    </main>
  );
}
