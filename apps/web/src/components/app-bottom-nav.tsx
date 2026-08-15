"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "./auth-provider";
import { NewTripButton } from "./new-trip-button";

import styles from "./app-bottom-nav.module.css";

function AlbumsIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="16"
        x="4"
        y="6"
      />
      <path
        d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M8.5 4.5 3.5 6.2v13.3l5-1.7 7 1.7 5-1.7V4.5l-5 1.7-7-1.7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M8.5 4.5v13.3M15.5 6.2v13.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 5.5v13M5.5 12h13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PassportIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect
        height="16.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
        width="13"
        x="5.5"
        y="3.75"
      />
      <circle cx="12" cy="11" r="3.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8.4 18.2h7.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="6.5" cy="12" fill="currentColor" r="1.6" />
      <circle cx="12" cy="12" fill="currentColor" r="1.6" />
      <circle cx="17.5" cy="12" fill="currentColor" r="1.6" />
    </svg>
  );
}

/**
 * App tabs: Álbuns · Mapa · + · Passaporte · Mais
 * Floating pill on phone and a centered dock on desktop.
 */
export function AppBottomNav({
  homeHref,
  mapHref = "/mapa",
  showCreate = false,
}: {
  readonly homeHref: string;
  readonly mapHref?: string;
  readonly showCreate?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const showMore = Boolean(user);
  const showPassport = Boolean(user);
  const slotCount =
    2 + (showCreate ? 1 : 0) + (showPassport ? 1 : 0) + (showMore ? 1 : 0);

  const mapActive =
    pathname === "/mapa" ||
    pathname.endsWith("/mapa") ||
    pathname === mapHref;
  const passportActive = pathname.startsWith("/passaporte");
  const moreActive =
    pathname.startsWith("/geral") || pathname.startsWith("/privacidade");
  const homeActive =
    !mapActive &&
    !passportActive &&
    !moreActive &&
    (pathname === homeHref ||
      pathname === "/perfil" ||
      pathname.includes("/album/") ||
      (homeHref.length > 1 && pathname.startsWith(homeHref)));

  return (
    <nav aria-label="Navegação principal" className={styles.bar}>
      <ul className={styles.list} data-slots={String(slotCount)}>
        <li className={styles.item}>
          <Link
            aria-current={homeActive ? "page" : undefined}
            className={styles.tab}
            data-active={homeActive ? "true" : "false"}
            href={homeHref}
          >
            <span className={styles.icon}>
              <AlbumsIcon />
            </span>
            <span className={styles.label}>Álbuns</span>
          </Link>
        </li>

        <li className={styles.item}>
          <Link
            aria-current={mapActive ? "page" : undefined}
            className={styles.tab}
            data-active={mapActive ? "true" : "false"}
            href={mapHref}
          >
            <span className={styles.icon}>
              <MapIcon />
            </span>
            <span className={styles.label}>Mapa</span>
          </Link>
        </li>

        {showCreate ? (
          <li className={styles.item}>
            <span className={styles.createWrap}>
              <NewTripButton className={styles.create}>
                <span className={styles.icon}>
                  <PlusIcon />
                </span>
                <span className={styles.label}>Nova viagem</span>
              </NewTripButton>
            </span>
          </li>
        ) : null}

        {showPassport ? (
          <li className={styles.item}>
            <Link
              aria-current={passportActive ? "page" : undefined}
              className={styles.tab}
              data-active={passportActive ? "true" : "false"}
              href="/passaporte"
            >
              <span className={styles.icon}>
                <PassportIcon />
              </span>
              <span className={styles.label}>Passaporte</span>
            </Link>
          </li>
        ) : null}

        {showMore ? (
          <li className={styles.item}>
            <Link
              aria-current={moreActive ? "page" : undefined}
              className={styles.tab}
              data-active={moreActive ? "true" : "false"}
              href="/geral"
            >
              <span className={styles.icon}>
                <MoreIcon />
              </span>
              <span className={styles.label}>Mais</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
