"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BOOT_READY_ATTR } from "@/lib/pwa/boot-ready";

const STORAGE_KEY = "mf-perf";
const DOC_LOADS_KEY = "mf-perf-doc-loads";

/**
 * On-screen stopwatch for real navigations, for measuring on a phone without any log viewer.
 * Invisible and inert unless switched on: open any page once with `?perf=1` (it is remembered on this device;
 * `?perf=0` switches it off). Then every tap on an in-app link shows a small badge at the bottom of the screen:
 *
 *   Perfil → Passaporte   shell 38 ms · conteúdo 612 ms · rsc 540 ms   (docs 1)
 *
 * shell    tap until the new route's loading screen is on screen (the route changed);
 * conteúdo tap until the new page's own content marker is on screen (the loading screen is gone);
 * rsc      tap until the page's data request finished, from the browser's resource timing;
 * docs     how many full document loads happened this session (it must not grow on tab switches: if it does, the
 *          app is reloading instead of navigating in place).
 * It records durations and path names only, nothing is sent anywhere.
 */
export function NavTimer() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<string[]>([]);
  const tap = useRef<{ at: number } | null>(null);
  const previous = useRef(pathname);

  useEffect(() => {
    try {
      const flag = new URLSearchParams(window.location.search).get("perf");
      if (flag === "1") window.localStorage.setItem(STORAGE_KEY, "1");
      if (flag === "0") window.localStorage.removeItem(STORAGE_KEY);
      const on = window.localStorage.getItem(STORAGE_KEY) === "1";
      if (on) {
        window.sessionStorage.setItem(
          DOC_LOADS_KEY,
          String(Number(window.sessionStorage.getItem(DOC_LOADS_KEY) ?? "0") + 1),
        );
      }
      if (on) queueMicrotask(() => setEnabled(true));
    } catch {
      // storage unavailable: stays off
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onPointerDown = (event: Event) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link && link.origin === window.location.origin) tap.current = { at: performance.now() };
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || pathname === previous.current) return;
    const from = previous.current;
    previous.current = pathname;
    const started = tap.current;
    tap.current = null;
    if (!started) return;

    const shellMs = Math.round(performance.now() - started.at);
    const hasContent = () => document.querySelector(`[${BOOT_READY_ATTR}]`) !== null;
    let observer: MutationObserver | null = null;

    const finish = () => {
      observer?.disconnect();
      const contentMs = Math.round(performance.now() - started.at);
      const rsc = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((entry) => entry.name.includes("_rsc=") && entry.startTime >= started.at - 5)
        .map((entry) => Math.round(entry.responseEnd - started.at))
        .filter((ms) => ms > 0)
        .sort((a, b) => b - a)[0];
      let docs = "?";
      try {
        docs = window.sessionStorage.getItem(DOC_LOADS_KEY) ?? "?";
      } catch {
        // ignore
      }
      const line = `${from} → ${pathname}  shell ${shellMs} ms · conteúdo ${contentMs} ms${rsc ? ` · rsc ${rsc} ms` : ""}  (docs ${docs})`;
      setRows((current) => [line, ...current].slice(0, 4));
    };

    // The page's marker is rendered by the NEW page only; the old page's marker leaves with the old page, so wait
    // for it to be present after the route changed.
    if (hasContent() && shellMs > 0) {
      // Still check on the next frame: the old page may be unmounting right now.
      requestAnimationFrame(() => (hasContent() ? finish() : watch()));
    } else {
      watch();
    }

    function watch() {
      observer = new MutationObserver(() => {
        if (hasContent()) finish();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => {
        if (observer) {
          observer.disconnect();
          setRows((current) => [`${from} → ${pathname}  sem marcador de conteúdo em 15 s`, ...current].slice(0, 4));
        }
      }, 15000);
    }

    return () => observer?.disconnect();
  }, [enabled, pathname]);

  if (!enabled || rows.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
        zIndex: 2147483647,
        pointerEvents: "none",
        padding: "6px 8px",
        borderRadius: 10,
        background: "rgba(0,0,0,0.82)",
        color: "#9be39b",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {rows.map((row, index) => (
        <div key={`${index}-${row}`} style={{ opacity: index === 0 ? 1 : 0.65 }}>
          {row}
        </div>
      ))}
    </div>
  );
}
