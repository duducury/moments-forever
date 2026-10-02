"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  titleCase,
  whatsappHref,
  type PricingPlanRow,
} from "@/app/pricing-section";
import {
  ACTIVATION_CODE_PATTERN,
  formatActivationCode,
} from "@/lib/activation/format-code";

import styles from "./license-gate.module.css";

/**
 * Shown on the owner's own profile while the account has no active license
 * (a new sign-up can't create trips until it redeems a key — see
 * enforce_trip_limit): say so up front, let them redeem a key right here, and
 * list the plans with the WhatsApp contact button, same as the landing page.
 */
export function LicenseGate({
  plans,
}: {
  readonly plans: readonly PricingPlanRow[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!ACTIVATION_CODE_PATTERN.test(trimmed)) {
      setMessage("Digite o código no formato MF-XXXX-XXXX-XX.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/activation/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        readonly error?: string;
      };
      if (!response.ok) {
        setMessage(data.error ?? "Não foi possível ativar a key.");
        return;
      }
      setActivated(true);
      setCode("");
      router.refresh();
    } catch {
      setMessage("Não foi possível ativar a key agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="license-gate-title" className={styles.gate}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Para começar</p>
        <h2 id="license-gate-title">Ative sua key para criar viagens</h2>
        <p className={styles.lead}>
          Sua conta já está pronta. Para criar viagens e álbuns, ative o código
          que veio com seu pacote — ou escolha um plano abaixo.
        </p>
        <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
          <label htmlFor="license-gate-code">Código de ativação</label>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            disabled={busy || activated}
            id="license-gate-code"
            onChange={(event) =>
              setCode(formatActivationCode(event.target.value))
            }
            placeholder="MF-____-____-__"
            value={code}
          />
          <button
            className="button primary"
            disabled={busy || activated || !code.trim()}
            type="submit"
          >
            {activated ? "Key ativada!" : busy ? "Ativando…" : "Ativar"}
          </button>
          {message ? (
            <p className={styles.error} role="alert">
              {message}
            </p>
          ) : null}
        </form>
      </div>
      {plans.length > 0 ? (
        <div className={styles.plans}>
          <h3>Ou escolha um plano</h3>
          <p className={styles.lead}>
            Pagamento único, sem assinatura. Cada plano inclui tags NFC para
            vincular às suas viagens.
          </p>
          <ul className={styles.planList}>
            {plans.map((plan) => (
              <li
                className={styles.plan}
                data-highlight={plan.highlight ? "true" : "false"}
                key={plan.name}
              >
                {plan.highlight ? (
                  <span className={styles.badge}>Mais popular</span>
                ) : null}
                <p className={styles.planName}>{titleCase(plan.name)}</p>
                <p className={styles.planPrice}>
                  {plan.priceLabel}
                  <span>{plan.priceNote}</span>
                </p>
                <ul className={styles.features}>
                  <li>{plan.trips} viagens</li>
                  <li>
                    {plan.photosPerTrip} fotos por viagem
                    <span>
                      {" "}
                      (
                      {(plan.trips * plan.photosPerTrip).toLocaleString("pt-BR")}{" "}
                      no total)
                    </span>
                  </li>
                  <li>{plan.nfcTags} tags NFC inclusas</li>
                </ul>
                <a
                  className="button secondary"
                  href={whatsappHref(plan.name)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Começar
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
