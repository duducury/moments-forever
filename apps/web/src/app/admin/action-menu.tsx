"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./admin.module.css";

/** "⋮" trigger that reveals a small popover — reused wherever a row/card needs more than one action without crowding the layout. */
export function ActionMenu({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className={styles.actionMenu} ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-label="Ações"
        className={styles.actionMenuTrigger}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        ⋮
      </button>
      {open ? <div className={styles.actionMenuPanel}>{children}</div> : null}
    </div>
  );
}
