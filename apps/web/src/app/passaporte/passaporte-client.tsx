"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

import { flagEmojiFromCountryCode } from "@moments-forever/shared";

import { ExperienceCoverThumb } from "@/components/experience-cover-thumb";
import type { PassportData } from "@/lib/passport/build-passport";

import styles from "./passaporte.module.css";

const PassportWorldMap = dynamic(
  () => import("./passport-world-map").then((mod) => mod.PassportWorldMap),
  { ssr: false },
);

function formatIssued(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Datas nas fotos";
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };
  const a = start ? new Intl.DateTimeFormat("pt-BR", opts).format(new Date(start)) : null;
  const b = end ? new Intl.DateTimeFormat("pt-BR", opts).format(new Date(end)) : null;
  if (a && b && a !== b) return `${a} — ${b}`;
  return a ?? b ?? "Datas nas fotos";
}

function formatMonthYear(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function stampYear(iso: string | null): string {
  if (!iso) return "";
  return String(new Date(iso).getUTCFullYear());
}

export function PassaporteClient({
  displayName,
  passport,
}: {
  readonly displayName: string;
  readonly passport: PassportData;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(
    passport.countries[0]?.code ?? null,
  );
  const [bookOpen, setBookOpen] = useState(true);

  const selected = useMemo(
    () => passport.countries.find((country) => country.code === selectedCode) ?? null,
    [passport.countries, selectedCode],
  );

  const journeyByYear = useMemo(() => {
    const groups = new Map<string, typeof passport.journey>();
    for (const item of passport.journey) {
      const year = stampYear(item.startsAt ?? item.endsAt) || "Sem data";
      const list = groups.get(year) ?? [];
      list.push(item);
      groups.set(year, list);
    }
    return [...groups.entries()];
  }, [passport.journey]);

  const visitedCodes = passport.countries.map((country) => country.code);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Passaporte</p>
        <h1 className={styles.title}>Meu Passaporte</h1>
        <p className={styles.lead}>
          Uma coleção dos lugares que fizeram parte da minha história.
        </p>
      </header>

      <section aria-label="Estatísticas" className={styles.stats}>
        <StatCard label="Países visitados" value={passport.countryCount} />
        <StatCard label="Cidades visitadas" value={passport.cityCount} />
        <StatCard label="Viagens" value={passport.tripCount} />
        <StatCard label="Fotos" value={passport.photoCount} />
        <StatCard label="Dias viajando" value={passport.dayCount} wide />
      </section>

      <section aria-labelledby="mundo-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="mundo-title">
          Meu mundo
        </h2>
        <div className={styles.worldCard}>
          {visitedCodes.length > 0 ? (
            <PassportWorldMap
              onSelectCountry={setSelectedCode}
              visitedCodes={visitedCodes}
            />
          ) : (
            <p className={styles.empty}>
              Importe fotos com destino para ver seus países no mapa.
            </p>
          )}
        </div>
        {selected ? (
          <article className={styles.countryPanel}>
            <h3 className={styles.countryName}>
              <span aria-hidden="true">
                {flagEmojiFromCountryCode(selected.code)}
              </span>{" "}
              {selected.name}
            </h3>
            <p className={styles.countryMeta}>
              {selected.tripCount} viagem{selected.tripCount === 1 ? "" : "ns"} ·{" "}
              {selected.photoCount} foto{selected.photoCount === 1 ? "" : "s"}
              {selected.lastVisitAt
                ? ` · Última visita: ${formatMonthYear(selected.lastVisitAt)}`
                : ""}
            </p>
            {selected.cities.length > 0 ? (
              <p className={styles.cities}>{selected.cities.join(" · ")}</p>
            ) : null}
            <div className={styles.albumLinks}>
              {selected.albumHrefs.map((album) => (
                <Link className={styles.albumChip} href={album.href} key={album.href}>
                  {album.title}
                </Link>
              ))}
            </div>
          </article>
        ) : null}
      </section>

      <section aria-labelledby="book-title" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="book-title">
            Passaporte
          </h2>
          <button
            className={styles.toggleBook}
            onClick={() => setBookOpen((open) => !open)}
            type="button"
          >
            {bookOpen ? "Fechar" : "Abrir"}
          </button>
        </div>
        <div
          className={styles.book}
          data-open={bookOpen ? "true" : "false"}
        >
          <article className={styles.bookPage}>
            <p className={styles.bookBrand}>Moments Forever</p>
            <h3 className={styles.bookHeading}>Travel Passport</h3>
            <dl className={styles.bookMeta}>
              <div>
                <dt>Nome</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>Emitido</dt>
                <dd>{formatIssued(passport.issuedAt)}</dd>
              </div>
              <div>
                <dt>Países</dt>
                <dd>{passport.countryCount}</dd>
              </div>
            </dl>
          </article>
          <article className={styles.bookPage}>
            <p className={styles.stampsLabel}>Carimbos</p>
            {passport.countries.length === 0 ? (
              <p className={styles.empty}>Ainda sem carimbos.</p>
            ) : (
              <div className={styles.stamps}>
                {passport.countries.map((country, index) => (
                  <button
                    className={styles.stamp}
                    data-tone={String((index % 3) + 1)}
                    key={country.code}
                    onClick={() => setSelectedCode(country.code)}
                    type="button"
                  >
                    <span className={styles.stampFlag}>
                      {flagEmojiFromCountryCode(country.code)}
                    </span>
                    <span className={styles.stampName}>{country.name}</span>
                    <span className={styles.stampMark}>
                      Visited · {stampYear(country.lastVisitAt) || "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <section aria-labelledby="journey-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="journey-title">
          Minha jornada
        </h2>
        {journeyByYear.length === 0 ? (
          <p className={styles.empty}>Suas viagens aparecem aqui.</p>
        ) : (
          journeyByYear.map(([year, items]) => (
            <div className={styles.yearBlock} key={year}>
              <h3 className={styles.year}>{year}</h3>
              <ul className={styles.journeyList}>
                {items.map((item) => (
                  <li key={item.albumId}>
                    <Link className={styles.journeyCard} href={item.href}>
                      <ExperienceCoverThumb
                        className={styles.journeyCover}
                        coverPhotoId={item.coverPhotoId}
                        fallbackClassName={styles.journeyCoverFallback}
                        imageClassName={styles.journeyCoverImg}
                        title={item.title}
                        variant="thumbnail"
                      />
                      <div className={styles.journeyCopy}>
                        <p className={styles.journeyTitle}>
                          {item.countryCode
                            ? `${flagEmojiFromCountryCode(item.countryCode)} `
                            : ""}
                          {item.title}
                        </p>
                        <p className={styles.journeyMeta}>
                          {formatRange(item.startsAt, item.endsAt)} ·{" "}
                          {item.photoCount} foto
                          {item.photoCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="ach-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="ach-title">
          Conquistas
        </h2>
        <p className={styles.achLead}>
          {passport.achievements.filter((item) => item.unlocked).length} de{" "}
          {passport.achievements.length} troféus desbloqueados
        </p>
        <ul className={styles.achievements}>
          {passport.achievements.map((item) => (
            <li
              className={styles.achievement}
              data-unlocked={item.unlocked ? "true" : "false"}
              key={item.id}
            >
              <span className={styles.trophy} data-icon={item.icon}>
                <AchievementGlyph icon={item.icon} />
              </span>
              <span className={styles.achCopy}>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <em>{item.unlocked ? "Desbloqueado" : "Bloqueado"}</em>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AchievementGlyph({
  icon,
}: {
  readonly icon: PassportData["achievements"][number]["icon"];
}) {
  if (icon === "plane") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <path
          d="M8 26.5 42 12 28.5 40l-3.2-10.4L8 26.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  if (icon === "globe") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="12.5" stroke="currentColor" strokeWidth="2.2" />
        <path
          d="M12 24h24M24 12c4.2 3.6 6.6 7.8 6.6 12S28.2 32.4 24 36c-4.2-3.6-6.6-7.8-6.6-12S19.8 15.6 24 12Z"
          stroke="currentColor"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  if (icon === "camera") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <rect
          height="16"
          rx="3"
          stroke="currentColor"
          strokeWidth="2.2"
          width="22"
          x="13"
          y="16"
        />
        <circle cx="24" cy="24" r="4.2" stroke="currentColor" strokeWidth="2.2" />
        <path d="M18 16l2.2-3h7.6L30 16" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    );
  }
  if (icon === "palm") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <path
          d="M24 40V22"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
        <path
          d="M24 22c-7-1-11-6-12-12 6 1 11 5 12 12Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path
          d="M24 22c7-1 11-6 12-12-6 1-11 5-12 12Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path
          d="M16 40h16"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
      <rect
        height="18"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="2.2"
        width="14"
        x="17"
        y="14"
      />
      <circle cx="24" cy="23" r="3.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  wide = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly wide?: boolean;
}) {
  return (
    <article className={styles.stat} data-wide={wide ? "true" : "false"}>
      <p className={styles.statValue}>{value}</p>
      <p className={styles.statLabel}>{label}</p>
    </article>
  );
}
