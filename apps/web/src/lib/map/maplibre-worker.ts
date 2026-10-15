import * as maplibregl from "maplibre-gl";

let configured = false;

/**
 * MapLibre GL 6 loads its worker from a file next to its own module, found through `import.meta.url`.
 * Once Next bundles the library that URL is not an http(s) one, so the worker URL came out empty and every map
 * stayed blank ("Worker failed to load"). `new URL(..., import.meta.url)` makes the bundler emit the worker as a
 * static asset and hand back its real (hashed) URL. Call this once, before creating any `Map`.
 */
export function configureMapLibreWorker(): void {
  if (configured) return;
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
  configured = true;
}
