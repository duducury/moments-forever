"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "./auth-provider";
import { ReportContentDialog } from "./report-content-dialog";
import styles from "./profile-user-menu.module.css";

/**
 * "•••" menu on a public profile — Copiar link and Compartilhar are always
 * available; Denunciar/Bloquear usuário only show for a signed-in visitor
 * (never on your own profile — both require an authenticated, non-owner
 * caller, see /api/blocks and /api/reports). Replaces a previous standalone
 * "Denunciar" button that sat directly over the album cover photo — this
 * consolidates every profile-level action behind one discreet trigger.
 * "Sair" is shown to any signed-in user, last and set apart.
 */
export function ProfileUserMenu({ ownerId }: { readonly ownerId: string }) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVisitor = Boolean(user) && user?.id !== ownerId;
  // Only read when the menu is actually open — i.e. only after a client
  // interaction, never during the initial render — so this never causes a
  // server/client hydration mismatch (navigator isn't defined during SSR).
  const canShare = open && typeof navigator !== "undefined" && Boolean(navigator.share);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!isVisitor) return;
    let alive = true;
    void fetch(`/api/blocks?userId=${encodeURIComponent(ownerId)}`)
      .then((response) => response.json())
      .then((data: { readonly blocked?: boolean }) => {
        if (alive) setBlocked(Boolean(data.blocked));
      })
      .catch(() => {
        if (alive) setBlocked(false);
      });
    return () => {
      alive = false;
    };
  }, [isVisitor, ownerId]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function copyLink() {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Link copiado");
    } catch {
      window.prompt("Copie o link:", window.location.href);
    }
  }

  async function shareLink() {
    setOpen(false);
    try {
      await navigator.share({ url: window.location.href });
    } catch {
      // User cancelled the share sheet, or it failed — nothing to report.
    }
  }

  // Same behaviour as "Sair" in Geral: end the session, then back to the login.
  async function onSignOut() {
    setOpen(false);
    await signOut();
    router.replace("/login");
  }

  async function toggleBlock() {
    setBusy(true);
    setOpen(false);
    try {
      const response = blocked
        ? await fetch(`/api/blocks?userId=${encodeURIComponent(ownerId)}`, {
            method: "DELETE",
          })
        : await fetch("/api/blocks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockedId: ownerId }),
          });
      if (response.ok) {
        const nextBlocked = !blocked;
        setBlocked(nextBlocked);
        setStatus(nextBlocked ? "Usuário bloqueado" : "Usuário desbloqueado");
      } else {
        setStatus("Não foi possível concluir a ação.");
      }
    } catch {
      setStatus("Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label="Mais opções"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        •••
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button
            className={styles.menuItem}
            onClick={() => void copyLink()}
            role="menuitem"
            type="button"
          >
            Copiar link
          </button>
          {canShare ? (
            <button
              className={styles.menuItem}
              onClick={() => void shareLink()}
              role="menuitem"
              type="button"
            >
              Compartilhar
            </button>
          ) : null}
          {isVisitor ? (
            <>
              <button
                className={styles.menuItem}
                disabled={busy || blocked === null}
                onClick={() => void toggleBlock()}
                role="menuitem"
                type="button"
              >
                {blocked ? "Desbloquear usuário" : "Bloquear usuário"}
              </button>
              <button
                className={styles.menuItem}
                onClick={() => {
                  setOpen(false);
                  setReportOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                Denunciar usuário
              </button>
            </>
          ) : null}
          {user ? (
            <button
              className={`${styles.menuItem} ${styles.menuItemSignOut}`}
              onClick={() => void onSignOut()}
              role="menuitem"
              type="button"
            >
              Sair
            </button>
          ) : null}
        </div>
      ) : null}
      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {reportOpen ? (
        <ReportContentDialog
          onClose={() => setReportOpen(false)}
          targetId={ownerId}
          targetType="user"
        />
      ) : null}
    </div>
  );
}
