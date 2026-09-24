"use client";

import { useAuth } from "@/components/auth-provider";

import styles from "./home.module.css";

export interface PricingPlanRow {
  readonly name: string;
  readonly priceLabel: string;
  readonly priceNote: string;
  readonly trips: number;
  readonly photosPerTrip: number;
  readonly nfcTags: number;
  readonly highlight: boolean;
}

/** Digits only (country code + number), no "+" or formatting — wa.me's format. */
const SALES_WHATSAPP_NUMBER = "12033947243";

function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

function whatsappHref(planName: string): string {
  const message = `Olá, tenho interesse no plano ${titleCase(planName)}!`;
  return `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function PricingSection({
  plans,
}: {
  readonly plans: readonly PricingPlanRow[];
}) {
  const { loading } = useAuth();

  if (loading || plans.length === 0) return null;

  return (
    <section
      aria-labelledby="home-pricing-title"
      className={styles.section}
    >
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="home-pricing-title">
          Escolha seu plano.
        </h2>
        <p className={styles.sectionLead}>
          Pagamento único, sem assinatura. Cada plano inclui tags NFC para
          vincular às suas viagens.
        </p>
      </div>
      <ul className={styles.pricingGrid}>
        {plans.map((plan) => (
          <li
            className={styles.pricingCard}
            data-highlight={plan.highlight ? "true" : "false"}
            key={plan.name}
          >
            {plan.highlight ? (
              <span className={styles.pricingBadge}>Mais popular</span>
            ) : null}
            <p className={styles.pricingName}>{titleCase(plan.name)}</p>
            <p className={styles.pricingPrice}>
              {plan.priceLabel}
              <span>{plan.priceNote}</span>
            </p>
            <ul className={styles.pricingFeatures}>
              <li>{plan.trips} viagens</li>
              <li>
                {plan.photosPerTrip} fotos por viagem
                <span>
                  {" "}
                  ({(plan.trips * plan.photosPerTrip).toLocaleString("pt-BR")}
                  {" "}
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
    </section>
  );
}
