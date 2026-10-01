"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "./auth-provider";
import { ReportContentDialog } from "./report-content-dialog";
import styles from "./profile-user-menu.module.css";

/**
 * "•••" menu on a public profile — Bloquear/Desbloquear usuário and
 * Denunciar usuário. Self-gates on auth + not-the-owner, so it renders
 * nothing on your own profile or for a signed-out visitor (both block and
 * report require an authenticated caller — see /api/blocks, /api/reports).
 */
export function ProfileUserMenu({ ownerId }: { readonly ownerId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isVisitor = Boolean(user) && user?.id !== ownerId;

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

  if (!isVisitor) return null;

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
