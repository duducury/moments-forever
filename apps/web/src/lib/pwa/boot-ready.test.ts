import assert from "node:assert/strict";
import test from "node:test";

import { bootReadyScript } from "./boot-ready";

type Listener = () => void;

class FakeEl {
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners = new Map<string, Listener>();
  parentElement: FakeEl | null = null;
  previousElementSibling: FakeEl | null = null;
  complete = true;
  constructor(public tagName: string) {}
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(type: string, fn: Listener) { this.listeners.set(type, fn); }
  closest(sel: string): FakeEl | null {
    assert.equal(sel, "[hidden]");
    if (this.attrs.has("hidden")) return this;
    return this.parentElement ? this.parentElement.closest(sel) : null;
  }
}

function setup(opts: { readyState?: string; theme?: string } = {}) {
  const splash = new FakeEl("DIV");
  splash.attrs.set("aria-live", "polite");
  splash.attrs.set("role", "status");
  const root = new FakeEl("HTML");
  if (opts.theme) root.dataset.resolvedTheme = opts.theme;
  const markers: FakeEl[] = [];
  const docListeners = new Map<string, Listener>();
  const doc = {
    readyState: opts.readyState ?? "loading",
    documentElement: root,
    getElementById: (id: string) => (id === "pwa-boot-splash" ? splash : null),
    querySelectorAll: (sel: string) => { assert.equal(sel, "[data-boot-ready]"); return markers; },
    addEventListener: (t: string, fn: Listener) => docListeners.set(t, fn),
    removeEventListener: (t: string) => docListeners.delete(t),
  };
  let mutate: Listener = () => {};
  class FakeObserver {
    disconnected = false;
    constructor(cb: Listener) { mutate = cb; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const timers = new Map<number, Listener>();
  let timerId = 0;
  const timeouts: number[] = [];
  new Function("document", "MutationObserver", "requestAnimationFrame", "setTimeout", "clearTimeout", bootReadyScript())(
    doc,
    FakeObserver,
    (fn: Listener) => fn(),
    (fn: Listener, ms: number) => { timers.set(++timerId, fn); timeouts.push(ms); return timerId; },
    (id: number) => timers.delete(id),
  );
  return {
    splash, root, markers, doc, docListeners, timers, timeouts,
    mutate: () => mutate(),
    dismissed: () => splash.dataset.dismissed === "true",
    addMarker(init: { previous?: boolean; hiddenParent?: boolean } = {}) {
      const m = new FakeEl("SPAN");
      const parent = new FakeEl("MAIN");
      if (init.hiddenParent) parent.attrs.set("hidden", "");
      m.parentElement = parent;
      if (init.previous) m.previousElementSibling = new FakeEl("SECTION");
      markers.push(m);
      return { m, parent };
    },
  };
}

test("no marker → splash stays", () => {
  const t = setup();
  t.mutate();
  assert.equal(t.dismissed(), false);
});

test("marker after content hides the splash right away, without waiting for the document", () => {
  const t = setup({ readyState: "loading" });
  t.addMarker({ previous: true });
  t.mutate();
  assert.equal(t.dismissed(), true);
  assert.equal(t.splash.style.opacity, "0");
  assert.equal(t.splash.style.pointerEvents, "none");
  assert.equal(t.splash.getAttribute("aria-hidden"), "true");
  assert.equal(t.splash.getAttribute("aria-live"), null);
  assert.equal(t.splash.getAttribute("role"), null);
});

test("a marker that leads its container waits for the document to be parsed (no bare first paint)", () => {
  const t = setup({ readyState: "loading" });
  t.addMarker({ previous: false });
  t.mutate();
  assert.equal(t.dismissed(), false, "content after the marker may not exist yet");
  t.doc.readyState = "interactive";
  t.docListeners.get("DOMContentLoaded")!();
  assert.equal(t.dismissed(), true);
});

test("marker already present in a parsed document hides at install time", () => {
  const t = setup({ readyState: "interactive" });
  // setup() ran the script before any marker existed; the next mutation/check sees it
  t.addMarker({ previous: false });
  t.mutate();
  assert.equal(t.dismissed(), true);
});

test("marker inside an unrevealed Suspense boundary is ignored until it is swapped in", () => {
  const t = setup({ readyState: "interactive" });
  const { parent } = t.addMarker({ previous: true, hiddenParent: true });
  t.mutate();
  assert.equal(t.dismissed(), false);
  parent.attrs.delete("hidden");
  t.mutate();
  assert.equal(t.dismissed(), true);
});

test("does not wait for images: the hero photo fills in progressively", () => {
  const t = setup();
  t.addMarker({ previous: true });
  t.mutate();
  assert.equal(t.dismissed(), true);
  assert.equal(t.timers.size, 0, "no timers involved");
});

test("light theme keeps its background after the splash goes (no dark flash)", () => {
  const t = setup({ theme: "light" });
  t.addMarker({ previous: true });
  t.mutate();
  assert.equal(t.root.style.backgroundColor, "#e8e0d4");
  assert.equal(t.root.style.color, "#1a1612");
});

test("dark theme leaves the document colors alone", () => {
  const t = setup({ theme: "dark" });
  t.addMarker({ previous: true });
  t.mutate();
  assert.equal(t.root.style.backgroundColor, undefined);
});

test("idempotent: a second run or an already-dismissed splash is a no-op", () => {
  const t = setup();
  t.splash.dataset.dismissed = "true";
  t.splash.style.opacity = "keep";
  t.addMarker({ previous: true });
  t.mutate();
  assert.equal(t.splash.style.opacity, "keep");
});

test("no splash element (skip mode / other layout) never throws", () => {
  const t = setup();
  t.doc.getElementById = () => null;
  t.addMarker({ previous: true });
  assert.doesNotThrow(() => t.mutate());
});
