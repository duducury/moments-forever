import Link from "next/link";

import styles from "./admin.module.css";

export function AdminNav({
  active,
}: {
  readonly active: "dashboard" | "users" | "codes" | "plans";
}) {
  const items: readonly { readonly key: typeof active; readonly href: string; readonly label: string }[] = [
    { key: "dashboard", href: "/admin", label: "Dashboard" },
    { key: "users", href: "/admin/users", label: "Usuários" },
    { key: "codes", href: "/admin/codes", label: "Códigos" },
    { key: "plans", href: "/admin/plans", label: "Planos" },
  ];

  return (
    <div className={styles.adminNavRow}>
      <nav className={styles.adminNav} aria-label="Admin">
        {items.map((item) => (
          <Link
            className={styles.adminNavLink}
            data-active={item.key === active ? "true" : "false"}
            href={item.href}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className={styles.backToProfile} href="/perfil">
        ← Meu perfil
      </Link>
    </div>
  );
}
