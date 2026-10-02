import { AppWordmark } from "@/components/app-wordmark";

/** Landing for /n/<token> when the tag resolves to no visible trip/album. */
export default function NfcTagNotLinkedPage() {
  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Navegação">
        <AppWordmark />
      </nav>
      <section className="narrow" style={{ textAlign: "center" }}>
        <h1>Esta tag ainda não foi vinculada a uma viagem.</h1>
        <p className="lead">
          Assim que o dono desta tag escolher uma viagem, este link vai levar
          direto até ela.
        </p>
      </section>
    </main>
  );
}
