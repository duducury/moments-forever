/**
 * Nominatim reverse geocoding client (OpenStreetMap).
 *
 * Policy (https://operations.osmfoundation.org/policies/nominatim/):
 * - Max 1 request / second (absolute ceiling for the public API)
 * - Valid User-Agent identifying the application
 * - Cache results aggressively
 * - Only lat/lon are sent — never photo bytes or other personal content
 *
 * Attribution: © OpenStreetMap contributors (ODbL).
 */

import {
  pickTravelPlaceName,
  type NominatimReverseLike,
} from "@moments-forever/shared";

export const NOMINATIM_REVERSE_URL =
  "https://nominatim.openstreetmap.org/reverse";

/** Identifies Moments Forever on Nominatim (required by usage policy). */
export const NOMINATIM_USER_AGENT =
  "MomentsForever/0.1 (local travel photo organizer; reverse-geocode places only)";

/** Stay just under the 1 req/s public ceiling. */
export const NOMINATIM_MIN_INTERVAL_MS = 1100;

export const NOMINATIM_TIMEOUT_MS = 8_000;

export type NominatimFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ReverseGeocodeResult {
  readonly label: string | null;
  readonly status: "ok" | "empty" | "error" | "rate_limited" | "timeout";
  readonly httpStatus?: number;
}

export interface NominatimClientOptions {
  readonly fetchImpl?: NominatimFetch;
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createNominatimClient(options: NominatimClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const minIntervalMs = options.minIntervalMs ?? NOMINATIM_MIN_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? NOMINATIM_TIMEOUT_MS;
  const userAgent = options.userAgent ?? NOMINATIM_USER_AGENT;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  let lastRequestAt = 0;

  async function throttle(): Promise<void> {
    const elapsed = now() - lastRequestAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
  }

  async function reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { label: null, status: "empty" };
    }

    await throttle();
    lastRequestAt = now();

    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    // City / town / borough detail — avoid building-level street names.
    url.searchParams.set("zoom", "12");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
          "Accept-Language": "pt,en",
        },
        signal: controller.signal,
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          await sleep(Math.min(retryAfter * 1000, 10_000));
        } else {
          await sleep(minIntervalMs * 2);
        }
        return { label: null, status: "rate_limited", httpStatus: 429 };
      }

      if (!response.ok) {
        return {
          label: null,
          status: "error",
          httpStatus: response.status,
        };
      }

      const payload = (await response.json()) as NominatimReverseLike;
      const label = pickTravelPlaceName(payload);
      return {
        label,
        status: label ? "ok" : "empty",
        httpStatus: response.status,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { label: null, status: "timeout" };
      }
      return { label: null, status: "error" };
    } finally {
      clearTimeout(timer);
    }
  }

  return { reverseGeocode };
}

export type NominatimClient = ReturnType<typeof createNominatimClient>;
