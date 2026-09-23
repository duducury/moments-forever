"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  CodesIcon,
  DashboardIcon,
  MenuIcon,
  PlansIcon,
  ProfileIcon,
  SettingsIcon,
  UsersIcon,
} from "./admin-icons";
import styles from "./admin-shell.module.css";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: DashboardIcon },
  { href: "/admin/users", label: "Usuários", Icon: UsersIcon },
  { href: "/admin/codes", label: "Códigos", Icon: CodesIcon },
  { href: "/admin/plans", label: "Planos", Icon: PlansIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className={styles.mobileHeader}>
        <button
          aria-label="Abrir menu"
          className={styles.hamburger}
          onClick={() => setOpen(true)}
          type="button"
        >
          <MenuIcon />
        </button>
        <span className={styles.mobileBrand}>
          Moments Forever<em>Admin</em>
        </span>
      </header>

      {open ? (
        <div
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          role="presentation"
        />
      ) : null}

      <aside className={styles.sidebar} data-open={open ? "true" : "false"}>
        <button
          aria-label="Fechar menu"
          className={styles.closeDrawer}
          onClick={() => setOpen(false)}
          type="button"
        >
          ×
        </button>

        <div className={styles.brand}>
          <span className={styles.brandName}>Moments Forever</span>
          <span className={styles.brandEyebrow}>Admin</span>
        </div>

        <nav aria-label="Admin" className={styles.nav}>
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link
              className={styles.navLink}
              data-active={isActive(pathname, href) ? "true" : "false"}
              href={href}
              key={href}
              onClick={() => setOpen(false)}
            >
              <span className={styles.navIcon}>
                <Icon />
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.navDivider} />

        <nav aria-label="Conta" className={styles.nav}>
          <Link className={styles.navLink} href="/perfil" onClick={() => setOpen(false)}>
            <span className={styles.navIcon}>
              <ProfileIcon />
            </span>
            Meu perfil
          </Link>
          <Link className={styles.navLink} href="/geral" onClick={() => setOpen(false)}>
            <span className={styles.navIcon}>
              <SettingsIcon />
            </span>
            Configurações
          </Link>
        </nav>

        <div className={styles.brandFooter}>
          <p className={styles.brandTagline}>Colecione momentos, não coisas.</p>
        </div>
      </aside>
    </>
  );
}
