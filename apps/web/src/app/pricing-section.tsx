"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import { PRICING_PLANS } from "@/lib/pricing/pricing-plans";

import styles from "./home.module.css";

export function PricingSection() {
  const { loading, user } = useAuth();

  if (loading || user) return null;

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
        {PRICING_PLANS.map((plan) => (
          <li
            className={styles.pricingCard}
            data-highlight={plan.highlight ? "true" : "false"}
            key={plan.name}
          >
            {plan.highlight ? (
              <span className={styles.pricingBadge}>Mais popular</span>
            ) : null}
            <p className={styles.pricingName}>{plan.name}</p>
            <p className={styles.pricingPrice}>
              {plan.price}
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
            <Link className="button secondary" href="/login">
              Começar
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
