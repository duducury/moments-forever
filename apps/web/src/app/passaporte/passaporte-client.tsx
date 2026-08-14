"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { ProfileAvatar } from "@/app/perfil/profile-avatar";
import { AppCreditFooter } from "@/components/app-credit-footer";
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

function selectedStampLabel(tripCount: number, lastVisitAt: string | null): string {
  const year = stampYear(lastVisitAt) || "—";
  if (tripCount > 1) return `${tripCount}x · ${year}`;
  return `Visitado · ${year}`;
}

export function PassaporteClient({
  ownerId,
  displayName,
  bio,
  avatarPhotoId,
  avatarRemoteSrc = null,
  passport,
}: {
  readonly ownerId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarPhotoId: string | null;
  readonly avatarRemoteSrc?: string | null;
  readonly passport: PassportData;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(
    passport.countries[0]?.code ?? null,
  );
  const [bookOpen, setBookOpen] = useState(true);

  const [achFilter, setAchFilter] = useState<"all" | "unlocked" | "locked">("all");
  const lastTrip = passport.journey[0] ?? null;

  const selected = useMemo(
    () => passport.countries.find((country) => country.code === selectedCode) ?? null,
    [passport.countries, selectedCode],
  );

  const journeyByYear = useMemo(() => {
    const groups = new Map<string, PassportData["journey"][number][]>();
    for (const item of passport.journey) {
      const year = stampYear(item.startsAt ?? item.endsAt) || "Sem data";
      const list = groups.get(year) ?? [];
      list.push(item);
      groups.set(year, list);
    }
    return [...groups.entries()].map(([year, items]) => ({
      year,
      items,
      photos: items.reduce((sum, item) => sum + item.photoCount, 0),
      countries: new Set(items.map((item) => item.countryCode).filter(Boolean)).size,
    }));
  }, [passport.journey]);

  const visibleAchievements = useMemo(() => {
    if (achFilter === "unlocked") return passport.achievements.filter((item) => item.unlocked);
    if (achFilter === "locked") return passport.achievements.filter((item) => !item.unlocked);
    return passport.achievements;
  }, [achFilter, passport.achievements]);

  const visitedCodes = passport.countries.map((country) => country.code);

  return (
    <div className={styles.page}>
      <header className={styles.identity}>
        <ProfileAvatar
          avatarPhotoId={avatarPhotoId}
          displayName={displayName}
          ownerId={ownerId}
          remoteSrc={avatarRemoteSrc}
        />
        <div className={styles.identityCopy}>
          <p className={styles.eyebrow}>Passaporte</p>
          <h1 className={styles.identityName}>{displayName}</h1>
          {visitedCodes.length > 0 ? (
            <ul aria-label="Países visitados" className={styles.identityFlags}>
              {visitedCodes.map((code) => (
                <li key={code}>
                  <CountryFlag code={code} size={20} />
                </li>
              ))}
            </ul>
          ) : null}
          <p className={styles.identityBio}>
            {bio?.trim() ||
              "Uma coleção dos lugares que fizeram parte da minha história."}
          </p>
        </div>
      </header>

      <section aria-label="Estatísticas" className={styles.statsPanel}>
        <ul className={styles.statsRow}>
          <StatItem icon={<GlobeIcon />} label="Países visitados" value={passport.countryCount} />
          <StatItem icon={<CityIcon />} label="Cidades visitadas" value={passport.cityCount} />
          <StatItem icon={<TripIcon />} label="Viagens" value={passport.tripCount} />
          <StatItem icon={<PhotoIcon />} label="Fotos" value={passport.photoCount} />
        </ul>
          {passport.dayCount > 0 ? (
          <p className={styles.statsFoot}>
            {passport.dayCount} {passport.dayCount === 1 ? "dia viajando" : "dias viajando"}
            {passport.continents.length > 0
              ? ` · ${passport.continents.length} continente${passport.continents.length === 1 ? "" : "s"}`
              : ""}
          </p>
        ) : null}
      </section>

      <nav aria-label="Seções do passaporte" className={styles.jumpNav}>
        <a href="#mundo-title">Mundo</a>
        <a href="#book-title">Passaporte</a>
        <a href="#journey-title">Jornada</a>
        <a href="#ach-title">Conquistas</a>
      </nav>

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
            {selected.lastCoverPhotoId ? (
              <ExperienceCoverThumb
                className={styles.countryCover}
                coverPhotoId={selected.lastCoverPhotoId}
                fallbackClassName={styles.countryCoverFallback}
                imageClassName={styles.countryCoverImg}
                title={selected.name}
                variant="thumbnail"
              />
            ) : null}
            <div className={styles.countryCopy}>
              <h3 className={styles.countryName}>
                <CountryFlag code={selected.code} size={22} />
                {selected.name}
              </h3>
              <p className={styles.countryMeta}>
                {selected.tripCount} viagem{selected.tripCount === 1 ? "" : "ns"} ·{" "}
                {selected.photoCount} foto{selected.photoCount === 1 ? "" : "s"}
                {selected.lastVisitAt
                  ? ` · ${formatMonthYear(selected.lastVisitAt)}`
                  : ""}
              </p>
              {selected.years.length > 0 ? (
                <p className={styles.cities}>{selected.years.join(" · ")}</p>
              ) : null}
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
            {passport.countries.length > 0 ? (
              <div className={styles.bookFlags}>
                {passport.countries.map((country) => (
                  <CountryFlag
                    code={country.code}
                    key={country.code}
                    size={18}
                  />
                ))}
              </div>
            ) : null}
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
                      <CountryFlag code={country.code} size={28} />
                    </span>
                    <span className={styles.stampName}>{country.name}</span>
                    <span className={styles.stampMark}>
                      {selectedStampLabel(country.tripCount, country.lastVisitAt)}
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
        {lastTrip ? (
          <Link className={styles.lastTrip} href={lastTrip.href}>
            <ExperienceCoverThumb
              className={styles.lastTripCover}
              coverPhotoId={lastTrip.coverPhotoId}
              fallbackClassName={styles.journeyCoverFallback}
              imageClassName={styles.journeyCoverImg}
              title={lastTrip.title}
              variant="thumbnail"
            />
            <div>
              <p className={styles.lastTripEyebrow}>Última viagem</p>
              <p className={styles.journeyTitle}>
                {lastTrip.countryCode ? (
                  <CountryFlag code={lastTrip.countryCode} size={18} />
                ) : null}
                {lastTrip.title}
              </p>
              <p className={styles.journeyMeta}>
                {formatRange(lastTrip.startsAt, lastTrip.endsAt)} · {lastTrip.photoCount} foto
                {lastTrip.photoCount === 1 ? "" : "s"}
              </p>
            </div>
          </Link>
        ) : null}
        {journeyByYear.length === 0 ? (
          <p className={styles.empty}>Suas viagens aparecem aqui.</p>
        ) : (
          <div className={styles.journeyScroll}>
            {journeyByYear.map((group) => (
              <div className={styles.yearBlock} key={group.year}>
                <h3 className={styles.year}>{group.year}</h3>
                <p className={styles.yearRecap}>
                  {group.items.length} viagem{group.items.length === 1 ? "" : "ns"}
                  {group.countries > 0
                    ? ` · ${group.countries} país${group.countries === 1 ? "" : "es"}`
                    : ""}{" "}
                  · {group.photos} foto{group.photos === 1 ? "" : "s"}
                </p>
                <ul className={styles.journeyList}>
                  {group.items.map((item) => (
                    <li key={item.albumId}>
                      <Link className={styles.journeyCard} href={item.href}>
                        <span className={styles.journeyMedia}>
                          <ExperienceCoverThumb
                            className={styles.journeyCover}
                            coverPhotoId={item.coverPhotoId}
                            fallbackClassName={styles.journeyCoverFallback}
                            imageClassName={styles.journeyCoverImg}
                            title={item.title}
                            variant="thumbnail"
                          />
                        </span>
                        <div className={styles.journeyCopy}>
                          <p className={styles.journeyTitle}>
                            {item.countryCode ? (
                              <CountryFlag code={item.countryCode} size={18} />
                            ) : null}
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
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="ach-title" className={styles.section}>
        <h2 className={styles.sectionTitle} id="ach-title">
          Conquistas
        </h2>
        <div className={styles.scoreboard}>
          <p className={styles.scoreRank}>{passport.rank.title}</p>
          <p className={styles.scoreValue}>{passport.achievementPoints}</p>
          <p className={styles.scoreLabel}>pontos</p>
          <div className={styles.rankBar} aria-hidden="true">
            <span style={{ width: `${Math.round(passport.rank.progress * 100)}%` }} />
          </div>
          <p className={styles.scoreMeta}>
            {passport.rank.nextTitle && passport.rank.nextPoints != null
              ? `${passport.rank.nextPoints - passport.achievementPoints} pts para ${passport.rank.nextTitle}`
              : "Nível máximo"}
            {" · "}
            {passport.achievements.filter((item) => item.unlocked).length} de{" "}
            {passport.achievements.length} troféus
          </p>
        </div>
        {passport.nextAchievement ? (
          <p className={styles.nextAch}>
            Próxima: <strong>{passport.nextAchievement.title}</strong> ·{" "}
            {passport.nextAchievement.description} (+{passport.nextAchievement.points} pts)
          </p>
        ) : null}
        <div className={styles.achFilters} aria-label="Filtrar conquistas">
          <button
            aria-pressed={achFilter === "all"}
            className={styles.achFilter}
            onClick={() => setAchFilter("all")}
            type="button"
          >
            Todas
          </button>
          <button
            aria-pressed={achFilter === "unlocked"}
            className={styles.achFilter}
            onClick={() => setAchFilter("unlocked")}
            type="button"
          >
            Desbloqueadas
          </button>
          <button
            aria-pressed={achFilter === "locked"}
            className={styles.achFilter}
            onClick={() => setAchFilter("locked")}
            type="button"
          >
            Faltam
          </button>
        </div>
        <div className={styles.achScroll}>
          {visibleAchievements.length === 0 ? (
            <p className={styles.empty}>Nenhuma conquista neste filtro.</p>
          ) : (
          <ul className={styles.achievements}>
            {visibleAchievements.map((item) => (
              <li
                className={styles.achievement}
                data-tier={
                  item.points >= 150
                    ? "legend"
                    : item.points >= 90
                      ? "gold"
                      : item.points >= 45
                        ? "silver"
                        : "bronze"
                }
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
                <span className={styles.achPoints}>
                  {item.points}
                  <small>pts</small>
                </span>
              </li>
            ))}
          </ul>
          )}
        </div>
      </section>

      <footer>
        <AppCreditFooter />
      </footer>
    </div>
  );
}

function CountryFlag({
  code,
  size,
  className,
}: {
  readonly code: string;
  readonly size: number;
  readonly className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small flag CDN asset
    <img
      alt=""
      className={`${styles.flag} ${className ?? ""}`.trim()}
      decoding="async"
      height={Math.round(size * (14 / 18))}
      src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
      width={size}
    />
  );
}

function AchievementGlyph({
  icon,
}: {
  readonly icon: PassportData["achievements"][number]["icon"];
}) {
  if (icon === "map") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <path
          d="M10 14.5 20 12l8 4 10-2.5v20l-10 2.5-8-4-10 2.5v-20Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
        <path d="M20 12v20M28 16v20" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (icon === "calendar") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <rect
          height="18"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="2.2"
          width="22"
          x="13"
          y="15"
        />
        <path
          d="M17 15v-3M31 15v-3M13 21h22"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  if (icon === "star") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 48 48">
        <path
          d="M24 12.5 27.2 21l8.8.8-6.6 5.6 2 8.6L24 31.6 16.6 36l2-8.6-6.6-5.6 8.8-.8L24 12.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
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

function StatItem({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <li className={styles.statItem}>
      <span aria-hidden="true" className={styles.statIcon}>
        {icon}
      </span>
      <strong className={styles.statValue}>{value}</strong>
      <span className={styles.statLabel}>{label}</span>
    </li>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.8 12h16.4M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s6.2-5.1 6.2-10.1A6.2 6.2 0 0 0 12 4.7a6.2 6.2 0 0 0-6.2 6.2C5.8 15.9 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="10.8" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TripIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 8.2V7a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 16.5 7v1.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect x="4.5" y="8.2" width="15" height="10.3" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.8" y="6.2" width="16.4" height="12.2" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 6.2 10.2 4.4h3.6L15 6.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12.4" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
