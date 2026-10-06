import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoverCandidates,
  buildRelatedCandidate,
  experiencesToCheck,
} from "./candidates";
import { discoverTrips } from "./discover-trips";
import type { DiscoveredTrip } from "./types";
import { assetSourceId } from "./match-existing";
import { PARIS, ROME, asset, existingTrip, homeLife, photosBetween } from "./test-helpers";
import type { PhotoLibraryContext } from "./types";

const emptyContext: PhotoLibraryContext = { trips: [], knownAssets: [], legacyPhotos: [] };

/** Labels (and "lookup finished") for the first stop of each given trip. */
function placed(...entries: readonly (readonly [DiscoveredTrip, string])[]) {
  const labels: Record<string, string> = {};
  const settled = new Set<string>();
  for (const [trip, label] of entries) {
    const stopId = trip.stops[0]?.id as string;
    labels[stopId] = label;
    settled.add(stopId);
  }
  return { labels, settled };
}
const unresolved = { labels: {}, settled: new Set<string>() };

function library() {
  return [
    ...homeLife(),
    ...photosBetween("2026-05-20", "2026-05-25", ROME),
    ...photosBetween("2026-06-10", "2026-06-15", PARIS),
  ];
}

test("with nothing in Moments Forever both trips are new, named by their place", () => {
  const trips = discoverTrips(library());
  const { fresh, existing } = buildDiscoverCandidates({
    trips,
    ...placed([trips[0]!, "França, Paris"], [trips[1]!, "Itália, Roma"]),
    context: emptyContext,
  });
  assert.deepEqual(fresh.map((c) => c.title), ["Paris", "Roma"]);
  assert.deepEqual(fresh.map((c) => c.name), ["França, Paris", "Itália, Roma"]);
  assert.equal(existing.length, 0);
  assert.equal(fresh[0]?.countryCode, "FR");
});

test("a trip already in Moments Forever is not offered as new; only its missing photos are", () => {
  const trips = discoverTrips(library());
  const paris = trips[0]!;
  const stored = paris.assets.slice(0, 10);
  const context: PhotoLibraryContext = {
    trips: [existingTrip()],
    knownAssets: stored.map((asset) => ({ assetId: assetSourceId(asset), experienceId: "exp-1", albumId: "album-1" })),
    legacyPhotos: [],
  };
  const { fresh, existing } = buildDiscoverCandidates({
    trips,
    ...placed([paris, "França, Paris"]),
    context,
  });
  assert.deepEqual(fresh.map((c) => c.period?.start), ["2026-05-20"]); // only Rome is new
  assert.equal(existing.length, 1);
  assert.equal(existing[0]?.target?.albumId, "album-1");
  assert.equal(existing[0]?.assets.length, paris.assets.length - 10);
});

test("an existing trip with every photo already in it has nothing left to add", () => {
  const trips = discoverTrips(library());
  const paris = trips[0]!;
  const context: PhotoLibraryContext = {
    trips: [existingTrip()],
    knownAssets: paris.assets.map((asset) => ({ assetId: assetSourceId(asset), experienceId: "exp-1", albumId: "album-1" })),
    legacyPhotos: [],
  };
  const { existing } = buildDiscoverCandidates({ trips, ...unresolved, context });
  assert.equal(existing[0]?.assets.length, 0);
});

test("photos stored in another trip are not offered again as a new trip", () => {
  const trips = discoverTrips(library());
  const rome = trips[1]!;
  const context: PhotoLibraryContext = {
    trips: [],
    knownAssets: rome.assets.map((asset) => ({ assetId: assetSourceId(asset), experienceId: "exp-9", albumId: "a9" })),
    legacyPhotos: [],
  };
  const { fresh } = buildDiscoverCandidates({ trips, ...unresolved, context });
  assert.deepEqual(fresh.map((c) => c.period?.start), ["2026-06-10"]);
});

test("same country, another year: a new trip, never merged — and no 'parece com' noise in the list", () => {
  const trips = discoverTrips(library());
  const paris = trips[0]!;
  const context: PhotoLibraryContext = {
    trips: [existingTrip({ startsAt: "2024-06-10T10:00:00Z", endsAt: "2024-06-15T10:00:00Z" })],
    knownAssets: [],
    legacyPhotos: [],
  };
  const { fresh, existing } = buildDiscoverCandidates({
    trips,
    ...placed([paris, "França, Paris"]),
    context,
  });
  assert.equal(existing.length, 0);
  const candidate = fresh.find((c) => c.key === paris.id);
  assert.equal(candidate?.title, "Paris");
  assert.equal("hint" in (candidate ?? {}), false);
});

test("a trip whose place is still being looked up has no title yet (nothing invented)", () => {
  const trips = discoverTrips(library());
  const { fresh } = buildDiscoverCandidates({ trips, ...unresolved, context: emptyContext });
  assert.ok(fresh.every((c) => c.titleState === "pending" && c.title === ""));
});

test("photos with no GPS are not suggested as trips; one with GPS but unresolved stays unnamed, not 'Viagem de …'", () => {
  const trips = discoverTrips(library());
  const settledOnly = { labels: {}, settled: new Set(trips.flatMap((t) => t.stops.map((s) => s.id))) };
  const { fresh } = buildDiscoverCandidates({ trips, ...settledOnly, context: emptyContext });
  assert.ok(fresh.every((c) => c.titleState === "unnamed" && !c.title.startsWith("Viagem de")));
});

test("older photos are fetched only for the trips that matched", () => {
  const trips = discoverTrips(library());
  const context: PhotoLibraryContext = { trips: [existingTrip()], knownAssets: [], legacyPhotos: [] };
  assert.deepEqual(experiencesToCheck(trips, context, {}, new Set()), ["exp-1"]);
  assert.deepEqual(experiencesToCheck(trips, emptyContext, {}, new Set()), []);
});

test("no trip found in an empty library", () => {
  const { fresh, existing } = buildDiscoverCandidates({ trips: [], ...unresolved, context: emptyContext });
  assert.deepEqual([fresh.length, existing.length], [0, 0]);
});

test("inside a trip: the candidate is the trip itself (never a new trip) with only missing photos", () => {
  const all = photosBetween("2026-06-10", "2026-06-15", PARIS, 5);
  const stored = all.slice(0, 12);
  const context: PhotoLibraryContext = {
    trips: [existingTrip()],
    knownAssets: stored.map((asset) => ({ assetId: assetSourceId(asset), experienceId: "exp-1", albumId: "album-1" })),
    legacyPhotos: [],
  };
  const { candidate, unavailable } = buildRelatedCandidate({
    assets: all,
    context,
    experienceId: "exp-1",
    albumId: "album-1",
  });
  assert.equal(unavailable, null);
  assert.equal(candidate?.kind, "existing");
  assert.equal(candidate?.assets.length, all.length - 12);
});

test("inside a trip that is unknown or has no dates, it says why nothing can be found", () => {
  assert.equal(
    buildRelatedCandidate({ assets: [], context: emptyContext, experienceId: "x", albumId: null }).unavailable,
    "no-trip",
  );
  assert.equal(
    buildRelatedCandidate({
      assets: [],
      context: { trips: [existingTrip({ startsAt: null, endsAt: null })], knownAssets: [], legacyPhotos: [] },
      experienceId: "exp-1",
      albumId: null,
    }).unavailable,
    "no-dates",
  );
});

test("1–2 GPS photos: listed as 'Possível viagem' with a limited-location note — no place, no flag, no default name", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2025-11-04", 10, PARIS),
    asset("2025-11-04", 11, PARIS),
    ...photosBetween("2025-11-04", "2025-11-04", null, 7),
  ]);
  const { fresh } = buildDiscoverCandidates({ trips, ...unresolved, context: emptyContext });
  const candidate = fresh.find((c) => c.period?.start === "2025-11-04");
  assert.equal(candidate?.title, "Possível viagem");
  assert.equal(candidate?.titleState, "possible");
  assert.equal(candidate?.locationNote, "Localização limitada");
  assert.equal(candidate?.countryCode, null);
  assert.equal(candidate?.name, "");
});

test("0 GPS: 'Possível viagem' too, and the note says there is no location in the photos", () => {
  const trips = discoverTrips([...homeLife(), ...photosBetween("2025-11-04", "2025-11-07", null, 9)]);
  const { fresh } = buildDiscoverCandidates({ trips, ...unresolved, context: emptyContext });
  assert.equal(fresh[0]?.title, "Possível viagem");
  assert.equal(fresh[0]?.locationNote, "Sem localização nas fotos");
});

test("a possible trip is never matched to an existing trip by place", () => {
  const trips = discoverTrips([
    ...homeLife(),
    asset("2026-06-11", 10, PARIS),
    ...photosBetween("2026-06-11", "2026-06-11", null, 8),
  ]);
  const context: PhotoLibraryContext = { trips: [existingTrip()], knownAssets: [], legacyPhotos: [] };
  const { fresh, existing } = buildDiscoverCandidates({ trips, ...unresolved, context });
  assert.equal(existing.length, 0);
  assert.equal(fresh.length, 1);
});
