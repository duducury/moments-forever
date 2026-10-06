import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiscoverCandidates,
  buildRelatedCandidate,
  experiencesToCheck,
} from "./candidates";
import { discoverTrips } from "./discover-trips";
import { assetSourceId } from "./match-existing";
import { PARIS, ROME, existingTrip, homeLife, photosBetween } from "./test-helpers";
import type { PhotoLibraryContext } from "./types";

const emptyContext: PhotoLibraryContext = { trips: [], knownAssets: [], legacyPhotos: [] };

function library() {
  return [
    ...homeLife(),
    ...photosBetween("2026-05-20", "2026-05-25", ROME),
    ...photosBetween("2026-06-10", "2026-06-15", PARIS),
  ];
}

test("with nothing in Moments Forever both trips are new, named by their place", () => {
  const trips = discoverTrips(library());
  const labels = { [trips[0]!.id]: "França, Paris", [trips[1]!.id]: "Itália, Roma" };
  const { fresh, existing } = buildDiscoverCandidates({ trips, labels, context: emptyContext });
  assert.deepEqual(fresh.map((c) => c.title), ["França, Paris", "Itália, Roma"]);
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
    labels: { [paris.id]: "França, Paris" },
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
  const { existing } = buildDiscoverCandidates({ trips, labels: {}, context });
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
  const { fresh } = buildDiscoverCandidates({ trips, labels: {}, context });
  assert.deepEqual(fresh.map((c) => c.period?.start), ["2026-06-10"]);
});

test("same country, another year: new trip with a hint, never merged", () => {
  const trips = discoverTrips(library());
  const paris = trips[0]!;
  const context: PhotoLibraryContext = {
    trips: [existingTrip({ startsAt: "2024-06-10T10:00:00Z", endsAt: "2024-06-15T10:00:00Z" })],
    knownAssets: [],
    legacyPhotos: [],
  };
  const { fresh, existing } = buildDiscoverCandidates({ trips, labels: { [paris.id]: "França, Paris" }, context });
  assert.equal(existing.length, 0);
  assert.equal(fresh.find((c) => c.key === paris.id)?.hint, "Parece com “França, Paris”");
});

test("older photos are fetched only for the trips that matched", () => {
  const trips = discoverTrips(library());
  const context: PhotoLibraryContext = { trips: [existingTrip()], knownAssets: [], legacyPhotos: [] };
  assert.deepEqual(experiencesToCheck(trips, context, {}), ["exp-1"]);
  assert.deepEqual(experiencesToCheck(trips, emptyContext, {}), []);
});

test("no trip found in an empty library", () => {
  const { fresh, existing } = buildDiscoverCandidates({ trips: [], labels: {}, context: emptyContext });
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
