import assert from "node:assert/strict";
import test from "node:test";

import { parseUserUsageRows } from "./user-usage";

test("maps admin_user_usage rows by user id", () => {
  const usage = parseUserUsageRows([
    { user_id: "a", trips_count: 0, photos_count: 0 },
    { user_id: "b", trips_count: 1, photos_count: 12 },
    { user_id: "c", trips_count: 3, photos_count: 47 },
    { user_id: "d", trips_count: 5, photos_count: 500 },
  ]);
  assert.deepEqual(usage.get("a"), { trips: 0, photos: 0 });
  assert.deepEqual(usage.get("b"), { trips: 1, photos: 12 });
  assert.deepEqual(usage.get("c"), { trips: 3, photos: 47 });
  assert.deepEqual(usage.get("d"), { trips: 5, photos: 500 });
});

test("accepts bigint counts that arrive as strings", () => {
  const usage = parseUserUsageRows([
    { user_id: "a", trips_count: "3", photos_count: "47" },
  ]);
  assert.deepEqual(usage.get("a"), { trips: 3, photos: 47 });
});

test("an account missing from the result has no entry (unknown, not zero)", () => {
  const usage = parseUserUsageRows([{ user_id: "a", trips_count: 2, photos_count: 9 }]);
  assert.equal(usage.get("missing"), undefined);
});

test("ignores malformed payloads instead of throwing", () => {
  assert.equal(parseUserUsageRows(null).size, 0);
  assert.equal(parseUserUsageRows({ nope: 1 }).size, 0);
  assert.equal(parseUserUsageRows([null, 7, { trips_count: 1 }]).size, 0);
  assert.deepEqual(
    parseUserUsageRows([{ user_id: "a", trips_count: -4, photos_count: "x" }]).get("a"),
    { trips: 0, photos: 0 },
  );
});
