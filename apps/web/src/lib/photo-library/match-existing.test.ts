import assert from "node:assert/strict";
import test from "node:test";

import { discoverTrips } from "./discover-trips";
import {
  assetSourceId,
  buildPresenceIndex,
  findRelatedAssets,
  isAlreadyInTrip,
  matchDiscoveredTrip,
  matchesLegacyPhoto,
  withoutPresent,
} from "./match-existing";
import { CANCUN, PARIS, asset, existingTrip, homeLife, photosBetween } from "./test-helpers";
import type { KnownAsset, LegacyPhoto } from "./types";

function parisTrip() {
  const [trip] = discoverTrips([...homeLife(), ...photosBetween("2026-06-10", "2026-06-15", PARIS)]);
  assert.ok(trip);
  return trip;
}

function known(assets: readonly { nativeId: string; platform: "ios" | "android" }[], albumId = "album-1"): KnownAsset[] {
  return assets.map((item) => ({
    assetId: assetSourceId(item as never),
    experienceId: "exp-1",
    albumId,
  }));
}

test("a trip that is not in Moments Forever is new", () => {
  const match = matchDiscoveredTrip({
    trip: parisTrip(),
    countryCode: "FR",
    existingTrips: [],
    knownAssets: [],
  });
  assert.deepEqual(match, { kind: "new", similarTo: null });
});

test("the same period and place is recognised as the existing trip", () => {
  const match = matchDiscoveredTrip({
    trip: parisTrip(),
    countryCode: "FR",
    existingTrips: [existingTrip()],
    knownAssets: [],
  });
  assert.equal(match.kind, "existing");
});

test("Brasil 2024 is not confused with Brasil 2026: same country, other dates = new, with a hint", () => {
  const match = matchDiscoveredTrip({
    trip: parisTrip(),
    countryCode: "FR",
    existingTrips: [existingTrip({ startsAt: "2024-06-10T10:00:00Z", endsAt: "2024-06-15T10:00:00Z" })],
    knownAssets: [],
  });
  assert.equal(match.kind, "new");
  assert.equal(match.kind === "new" ? match.similarTo?.title : null, "França, Paris");
});

test("two different trips are not merged just because of the country", () => {
  const match = matchDiscoveredTrip({
    trip: parisTrip(),
    countryCode: "FR",
    existingTrips: [
      existingTrip({ center: { latitude: 43.3, longitude: 5.37 }, startsAt: "2026-06-12T10:00:00Z", endsAt: "2026-06-14T10:00:00Z" }),
    ],
    knownAssets: [],
  });
  // Marseille is ~660 km from Paris: same dates, same country, different place.
  assert.equal(match.kind, "new");
});

test("a trip whose photos are already stored is recognised even if dates differ", () => {
  const trip = parisTrip();
  const match = matchDiscoveredTrip({
    trip,
    countryCode: null,
    existingTrips: [existingTrip({ startsAt: null, endsAt: null, center: null, radiusKm: null })],
    knownAssets: known(trip.assets),
  });
  assert.equal(match.kind, "existing");
  assert.equal(match.kind === "existing" ? match.reason : "", "photos");
});

test("an existing trip without dates cannot be matched by period", () => {
  const match = matchDiscoveredTrip({
    trip: parisTrip(),
    countryCode: "FR",
    existingTrips: [existingTrip({ startsAt: null, endsAt: null })],
    knownAssets: [],
  });
  assert.equal(match.kind, "new");
});

test("a photo already in the trip is not offered again; one that is not there is", () => {
  const trip = parisTrip();
  const [inTrip, notInTrip] = trip.assets;
  assert.ok(inTrip && notInTrip);
  const presence = buildPresenceIndex({ knownAssets: known([inTrip]), experienceId: "exp-1" });
  assert.equal(isAlreadyInTrip(inTrip, presence), true);
  assert.equal(isAlreadyInTrip(notInTrip, presence), false);
  assert.deepEqual(withoutPresent([inTrip, notInTrip], presence), [notInTrip]);
});

test("a photo that was imported and then deleted is offered again", () => {
  const trip = parisTrip();
  const photos = trip.assets.slice(0, 10);
  // Day 1: 10 photos are in the trip.
  const before = buildPresenceIndex({ knownAssets: known(photos), experienceId: "exp-1" });
  assert.equal(withoutPresent(photos, before).length, 0);
  // Day 2: the person deleted 4 of them — their rows (and source_asset_id) are gone.
  const after = buildPresenceIndex({ knownAssets: known(photos.slice(4)), experienceId: "exp-1" });
  assert.deepEqual(
    withoutPresent(photos, after).map((item) => item.nativeId),
    photos.slice(0, 4).map((item) => item.nativeId),
  );
});

test("presence is per trip: a photo stored in another trip does not hide it here", () => {
  const trip = parisTrip();
  const [first] = trip.assets;
  assert.ok(first);
  const otherTrip: KnownAsset[] = [{ assetId: assetSourceId(first), experienceId: "exp-2", albumId: "x" }];
  const presence = buildPresenceIndex({ knownAssets: otherTrip, experienceId: "exp-1" });
  assert.equal(isAlreadyInTrip(first, presence), false);
});

test("android and ios ids never collide", () => {
  const ios = asset("2026-06-10", 10, PARIS, { nativeId: "42", platform: "ios" });
  const android = asset("2026-06-10", 10, PARIS, { nativeId: "42", platform: "android" });
  const presence = buildPresenceIndex({ knownAssets: known([ios]), experienceId: "exp-1" });
  assert.equal(isAlreadyInTrip(android, presence), false);
});

test("photos stored before source_asset_id are matched by place + time (even across a timezone shift)", () => {
  const photo = asset("2026-06-10", 14, PARIS, { takenAt: "2026-06-10T14:30:05.000Z" });
  const stored = (capturedAt: string, extra: Partial<LegacyPhoto> = {}): LegacyPhoto => ({
    capturedAt,
    latitude: photo.latitude,
    longitude: photo.longitude,
    width: 1600,
    height: 1200,
    ...extra,
  });
  assert.equal(matchesLegacyPhoto(photo, stored("2026-06-10T14:30:06.000Z")), true);
  // Imported while the phone was 3h behind: EXIF wall-clock read in another timezone.
  assert.equal(matchesLegacyPhoto(photo, stored("2026-06-10T17:30:05.000Z")), true);
  assert.equal(matchesLegacyPhoto(photo, stored("2026-06-10T14:33:00.000Z")), false);
  assert.equal(matchesLegacyPhoto(photo, stored("2026-06-10T14:30:05.000Z", { latitude: 41.9, longitude: 12.5 })), false);
  assert.equal(matchesLegacyPhoto(photo, stored("2026-06-10T14:30:05.000Z", { width: 900, height: 1600 })), false);
});

test("legacy photos without GPS are never declared present", () => {
  const photo = asset("2026-06-10", 14, null);
  assert.equal(
    matchesLegacyPhoto(photo, { capturedAt: photo.takenAt, latitude: null, longitude: null, width: 1600, height: 1200 }),
    false,
  );
});

test("inside a trip: finds photos of its dates and place that are not in it yet", () => {
  const trip = existingTrip();
  const inLibrary = [
    ...photosBetween("2026-06-10", "2026-06-15", PARIS, 3), // 18 photos of the trip
    ...photosBetween("2026-06-11", "2026-06-11", CANCUN, 2), // same day, other place: not related
    ...photosBetween("2026-09-01", "2026-09-03", PARIS, 3), // same place, other dates: not related
    asset("2026-06-12", 22, null), // no GPS but on the trip's days: related
  ];
  const stored = inLibrary.slice(0, 5);
  const presence = buildPresenceIndex({ knownAssets: known(stored), experienceId: "exp-1" });
  const related = findRelatedAssets({ assets: inLibrary, trips: [trip], presence });
  assert.equal(related.unavailable, null);
  assert.equal(related.assets.length, 18 - 5 + 1);
  assert.ok(related.assets.every((item) => !stored.includes(item)));
});

test("inside a trip without dates there is nothing to search", () => {
  const related = findRelatedAssets({
    assets: photosBetween("2026-06-10", "2026-06-12", PARIS),
    trips: [existingTrip({ startsAt: null, endsAt: null })],
    presence: buildPresenceIndex({ knownAssets: [] }),
  });
  assert.equal(related.unavailable, "no-dates");
  assert.equal(related.assets.length, 0);
});

test("with everything already in the trip nothing is offered", () => {
  const inLibrary = photosBetween("2026-06-10", "2026-06-12", PARIS, 2);
  const related = findRelatedAssets({
    assets: inLibrary,
    trips: [existingTrip()],
    presence: buildPresenceIndex({ knownAssets: known(inLibrary), experienceId: "exp-1" }),
  });
  assert.equal(related.assets.length, 0);
});
