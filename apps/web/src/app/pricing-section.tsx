"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  SALES_WHATSAPP_NUMBER,
  customPlanWhatsappHref,
  type CustomPlanRequest,
} from "@/lib/pricing/custom-plan-request";

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

export function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}

export function whatsappHref(planName: string): string {
  const message = `Olá, tenho interesse no plano ${titleCase(planName)}!`;
  return `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function CustomPlanCard() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (key: string) => String(data.get(key) ?? "");
    const request: CustomPlanRequest = {
      name: read("name"),
      email: read("email"),
      trips: read("trips"),
      photosPerTrip: read("photosPerTrip"),
      nfcTags: read("nfcTags"),
    };
    const counts = [request.trips, request.photosPerTrip, request.nfcTags].map(Number);
    if (!request.name.trim() || !/^\S+@\S+\.\S+$/.test(request.email.trim())) {
      setError("Informe seu nome e um e-mail válido.");
      return;
    }
    if (counts.some((value) => !Number.isInteger(value) || value < 1)) {
      setError("Informe quantas viagens, fotos por viagem e tags NFC você precisa.");
      return;
    }
    setError(null);
    window.open(customPlanWhatsappHref(request), "_blank", "noopener,noreferrer");
  }

  return (
    <li className={styles.pricingCard} data-custom="true">
      <p className={styles.pricingName}>Plano personalizado</p>
      <p className={styles.pricingCustomLead}>
        Escolha exatamente o que você precisa. Para quem precisa de mais do
        que o Premium.
      </p>
      <ul className={styles.pricingFeatures}>
        <li>Mais viagens</li>
        <li>Mais fotos</li>
        <li>Mais tags NFC</li>
        <li>Plano ajustado à sua necessidade</li>
      </ul>
      {open ? (
        <form className={styles.pricingCustomForm} onSubmit={onSubmit}>
          <label>
            <span>Nome</span>
            <input autoComplete="name" name="name" required type="text" />
          </label>
          <label>
            <span>E-mail</span>
            <input autoComplete="email" name="email" required type="email" />
          </label>
          <label>
            <span>Viagens desejadas</span>
            <input inputMode="numeric" min={1} name="trips" required type="number" />
          </label>
          <label>
            <span>Fotos por viagem</span>
            <input inputMode="numeric" min={1} name="photosPerTrip" required type="number" />
          </label>
          <label>
            <span>Tags NFC</span>
            <input inputMode="numeric" min={1} name="nfcTags" required type="number" />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button className="button secondary" type="submit">
            Enviar pelo WhatsApp
          </button>
        </form>
      ) : (
        <button className="button secondary" onClick={() => setOpen(true)} type="button">
          Montar meu plano
        </button>
      )}
    </li>
  );
}

export function PricingSection({
  plans,
}: {
  readonly plans: readonly PricingPlanRow[];
}) {
  const { loading } = useAuth();
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (loading || plans.length === 0) return null;

  return (
    <section
      aria-labelledby="home-pricing-title"
      className={`${styles.pricingSection} ${isVisible ? styles.pricingSectionVisible : ""}`}
      ref={sectionRef}
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
        <CustomPlanCard />
      </ul>
    </section>
  );
}
