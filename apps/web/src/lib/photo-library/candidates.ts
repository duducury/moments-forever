/**
 * Turns "what the library holds" + "what Moments Forever already has" into the
 * rows the person chooses from. Pure: no network, no side effects, nothing is
 * created — a candidate is only a suggestion until the final confirmation.
 */

import { countryCodeFromPlaceLabel } from "@moments-forever/shared";

import {
  buildPresenceIndex,
  findRelatedAssets,
  matchDiscoveredTrip,
  withoutPresent,
} from "./match-existing";
import type { Candidate } from "./selection";
import type {
  DiscoveredTrip,
  ExistingTrip,
  LegacyPhoto,
  LibraryAsset,
  PhotoLibraryContext,
} from "./types";

export interface DiscoverCandidates {
  /** Trips that are not in Moments Forever yet. */
  readonly fresh: readonly Candidate[];
  /** Trips that already exist; `assets` are only the photos missing from them. */
  readonly existing: readonly Candidate[];
}

/** Default name when the place could not be named (geocoder offline / no GPS). */
export function fallbackTripTitle(trip: DiscoveredTrip): string {
  return `Viagem de ${trip.startDate.slice(8, 10)}/${trip.startDate.slice(5, 7)}/${trip.startDate.slice(0, 4)}`;
}

export function buildDiscoverCandidates(input: {
  readonly trips: readonly DiscoveredTrip[];
  /** Reverse-geocoded "País, Localidade" per discovered trip id (may be missing). */
  readonly labels: Readonly<Record<string, string | undefined>>;
  readonly context: PhotoLibraryContext;
  /** Older photos (no source_asset_id) of the experiences that matched, once loaded. */
  readonly legacyPhotos?: readonly (LegacyPhoto & { readonly experienceId: string })[];
}): DiscoverCandidates {
  const fresh: Candidate[] = [];
  const existing: Candidate[] = [];
  const everywhere = buildPresenceIndex({ knownAssets: input.context.knownAssets });

  for (const trip of input.trips) {
    const label = input.labels[trip.id] ?? null;
    const countryCode = countryCodeFromPlaceLabel(label);
    const match = matchDiscoveredTrip({
      trip,
      countryCode,
      existingTrips: input.context.trips,
      knownAssets: input.context.knownAssets,
    });
    const base = {
      key: trip.id,
      period: { start: trip.startDate, end: trip.endDate },
      countryCode,
      withoutLocationCount: trip.withoutLocationCount,
    };

    if (match.kind === "existing") {
      const presence = buildPresenceIndex({
        knownAssets: input.context.knownAssets,
        legacyPhotos: (input.legacyPhotos ?? []).filter(
          (photo) => photo.experienceId === match.trip.experienceId,
        ),
        experienceId: match.trip.experienceId,
      });
      existing.push({
        ...base,
        kind: "existing",
        title: match.trip.title,
        target: match.trip,
        assets: withoutPresent(trip.assets, presence),
        hint: null,
        countryCode: countryCode ?? match.trip.countryCode,
      });
      continue;
    }

    fresh.push({
      ...base,
      kind: "new",
      title: label ?? fallbackTripTitle(trip),
      target: null,
      // Already stored anywhere in the account (and not deleted since): not offered again.
      assets: withoutPresent(trip.assets, everywhere),
      hint: match.similarTo ? `Parece com “${match.similarTo.title}”` : null,
    });
  }

  return { fresh: fresh.filter((candidate) => candidate.assets.length > 0), existing };
}

/** Experiences whose older photos are needed to count what is really missing. */
export function experiencesToCheck(
  trips: readonly DiscoveredTrip[],
  context: PhotoLibraryContext,
  labels: Readonly<Record<string, string | undefined>>,
): string[] {
  const ids = new Set<string>();
  for (const trip of trips) {
    const match = matchDiscoveredTrip({
      trip,
      countryCode: countryCodeFromPlaceLabel(labels[trip.id] ?? null),
      existingTrips: context.trips,
      knownAssets: context.knownAssets,
    });
    if (match.kind === "existing") ids.add(match.trip.experienceId);
  }
  return [...ids];
}

/** "Encontrar fotos" inside one trip: a single candidate, never a new trip. */
export function buildRelatedCandidate(input: {
  readonly assets: readonly LibraryAsset[];
  readonly context: PhotoLibraryContext;
  readonly experienceId: string;
  /** Destination album when it is a root album with its own dates. */
  readonly albumId: string | null;
  readonly legacyPhotos?: readonly LegacyPhoto[];
}): { readonly candidate: Candidate | null; readonly unavailable: "no-dates" | "no-trip" | null } {
  const own = input.context.trips.filter(
    (trip) => trip.experienceId === input.experienceId,
  );
  if (own.length === 0) return { candidate: null, unavailable: "no-trip" };

  const focus: readonly ExistingTrip[] = (() => {
    const album = own.find((trip) => trip.albumId === input.albumId);
    return album ? [album] : own;
  })();

  const presence = buildPresenceIndex({
    knownAssets: input.context.knownAssets,
    legacyPhotos: input.legacyPhotos,
    experienceId: input.experienceId,
  });
  const related = findRelatedAssets({ assets: input.assets, trips: focus, presence });
  if (related.unavailable) return { candidate: null, unavailable: related.unavailable };

  const target = focus[0] as ExistingTrip;
  return {
    candidate: {
      key: `related-${input.experienceId}`,
      kind: "existing",
      title: focus.length === 1 ? target.title : target.title,
      target,
      assets: related.assets,
      period: related.window
        ? { start: related.window.start, end: related.window.end }
        : null,
      countryCode: target.countryCode,
      hint: null,
      withoutLocationCount: related.assets.filter(
        (asset) => asset.latitude === null || asset.longitude === null,
      ).length,
    },
    unavailable: null,
  };
}
