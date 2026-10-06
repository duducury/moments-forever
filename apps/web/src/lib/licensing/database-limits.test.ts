import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Runs the REAL migrations against a scratch Postgres and checks, in the
 * database itself, the two rules this app depends on:
 *
 *  - Admin → Usuários counts (admin_user_usage): live trip/photo totals for any
 *    account, even though the admin's own session cannot read other people's
 *    private trips through RLS.
 *  - The trip limit of the activation keys (enforce_trip_limit trigger): BASIC
 *    = 5 trips, the 6th is refused by the database no matter which client or
 *    API asks, keys stack, and simultaneous creations can't pass the limit.
 *
 * Needs a Postgres superuser connection, e.g.
 *   MF_TEST_PG="host=/var/run/postgresql user=postgres" npm test
 * Skipped (not failed) when MF_TEST_PG is not set.
 */
const BASE = process.env.MF_TEST_PG;
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const MIGRATIONS = path.join(REPO_ROOT, "supabase/migrations");
const SHIM = path.join(REPO_ROOT, "supabase/tests/supabase-shim.sql");

const PSQL_ARGS = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];

interface SqlResult {
  readonly ok: boolean;
  readonly out: string;
  readonly err: string;
}

function psqlSync(conninfo: string, sql: string): SqlResult {
  const result = spawnSync("psql", [...PSQL_ARGS, conninfo], {
    input: sql,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim(),
  };
}

function psqlAsync(conninfo: string, sql: string): Promise<SqlResult> {
  return new Promise((resolve) => {
    const child = spawn("psql", [...PSQL_ARGS, conninfo]);
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (code) =>
      resolve({ ok: code === 0, out: out.trim(), err: err.trim() }),
    );
    child.stdin.end(sql);
  });
}

const dbName = `mf_test_${randomBytes(4).toString("hex")}`;
const adminConn = `${BASE ?? ""} dbname=postgres`;
const conn = `${BASE ?? ""} dbname=${dbName}`;

function runAs(userId: string, sql: string): SqlResult {
  return psqlSync(
    conn,
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${userId}';\n${sql}`,
  );
}

function must(result: SqlResult): string {
  assert.ok(result.ok, result.err);
  return result.out;
}

let counter = 0;
function newUser(options: { admin?: boolean } = {}): string {
  const id = must(
    psqlSync(
      conn,
      `INSERT INTO auth.users (email) VALUES ('u${(counter += 1)}@test.dev') RETURNING id;`,
    ),
  ).split("\n")[0]!;
  if (options.admin) {
    must(psqlSync(conn, `UPDATE public.users SET is_admin = true WHERE id = '${id}';`));
  }
  return id;
}

function grantPlan(userId: string, planName: string): void {
  must(
    psqlSync(
      conn,
      `INSERT INTO public.licenses (user_id, plan_id, status)
       SELECT '${userId}', id, 'active' FROM public.plans WHERE name = '${planName}';`,
    ),
  );
}

function tripSql(ownerId: string): string {
  const slug = `t-${randomBytes(6).toString("hex")}`;
  return `INSERT INTO public.experiences (owner_id, slug, title) VALUES ('${ownerId}', '${slug}', 'Trip') RETURNING id;`;
}

function createTrip(ownerId: string): SqlResult {
  return psqlSync(conn, tripSql(ownerId));
}

function createTrips(ownerId: string, count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) ids.push(must(createTrip(ownerId)).split("\n")[0]!);
  return ids;
}

function addPhotos(experienceId: string, count: number): void {
  // Two statements: the moment's album is created by an AFTER trigger, which
  // only fires once the moment insert statement has finished.
  const next = Number(
    must(
      psqlSync(
        conn,
        `SELECT coalesce(max(position), 0) + 1 FROM public.moments WHERE experience_id = '${experienceId}';`,
      ),
    ),
  );
  const momentId = must(
    psqlSync(
      conn,
      `INSERT INTO public.moments (experience_id, position) VALUES ('${experienceId}', ${next}) RETURNING id;`,
    ),
  ).split("\n")[0]!;
  must(
    psqlSync(
      conn,
      `INSERT INTO public.photos (experience_id, moment_id, position_in_moment)
       SELECT '${experienceId}', '${momentId}', g FROM generate_series(1, ${count}) g;`,
    ),
  );
}

function usageOf(adminId: string, userIds: string[]): Map<string, { trips: number; photos: number }> {
  const list = userIds.map((id) => `'${id}'`).join(",");
  const out = must(
    runAs(
      adminId,
      `SELECT user_id, trips_count, photos_count FROM public.admin_user_usage(ARRAY[${list}]::uuid[]);`,
    ),
  );
  const map = new Map<string, { trips: number; photos: number }>();
  for (const line of out.split("\n").filter((l) => l.includes("|"))) {
    const [id, trips, photos] = line.split("|");
    map.set(id!, { trips: Number(trips), photos: Number(photos) });
  }
  return map;
}

function redeem(userId: string, code: string): SqlResult {
  return runAs(userId, `SELECT plan_name, error_code FROM public.redeem_activation_code('${code}');`);
}

function addCode(code: string, planName: string): void {
  must(
    psqlSync(
      conn,
      `INSERT INTO public.activation_codes (code, plan_id)
       SELECT '${code}', id FROM public.plans WHERE name = '${planName}';`,
    ),
  );
}

const suite = { skip: BASE ? false : "set MF_TEST_PG to a Postgres superuser connection to run" };

test.before(() => {
  if (!BASE) return;
  must(psqlSync(adminConn, `CREATE DATABASE ${dbName};`));
  must(psqlSync(conn, readFileSync(SHIM, "utf8")));
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const result = psqlSync(conn, readFileSync(path.join(MIGRATIONS, file), "utf8"));
    assert.ok(result.ok, `${file}: ${result.err}`);
  }
});

test.after(() => {
  if (!BASE) return;
  psqlSync(adminConn, `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
});

test("admin sees the real trip and photo totals of any account", suite, () => {
  const admin = newUser({ admin: true });
  const none = newUser();
  const one = newUser();
  const three = newUser();
  const five = newUser();
  for (const id of [none, one, three, five]) grantPlan(id, "BASIC");

  addPhotos(createTrips(one, 1)[0]!, 4);
  const threeTrips = createTrips(three, 3);
  addPhotos(threeTrips[0]!, 20);
  addPhotos(threeTrips[1]!, 15);
  addPhotos(threeTrips[2]!, 12);
  const fiveTrips = createTrips(five, 5);
  addPhotos(fiveTrips[4]!, 7);

  const usage = usageOf(admin, [none, one, three, five]);
  assert.deepEqual(usage.get(none), { trips: 0, photos: 0 });
  assert.deepEqual(usage.get(one), { trips: 1, photos: 4 });
  assert.deepEqual(usage.get(three), { trips: 3, photos: 47 });
  assert.deepEqual(usage.get(five), { trips: 5, photos: 7 });
});

test("the old way (the admin's own session reading the tables) really did show 0", suite, () => {
  const admin = newUser({ admin: true });
  const owner = newUser();
  grantPlan(owner, "BASIC");
  addPhotos(createTrips(owner, 3)[0]!, 5);

  const asAdmin = must(
    runAs(admin, `SELECT count(*) FROM public.experiences WHERE owner_id = '${owner}';`),
  );
  assert.equal(asAdmin, "0", "RLS hides a private trip from another account, admin included");
  assert.deepEqual(usageOf(admin, [owner]).get(owner), { trips: 3, photos: 5 });
});

test("counts follow the current state: adding and removing trips and photos", suite, () => {
  const admin = newUser({ admin: true });
  const owner = newUser();
  grantPlan(owner, "BASIC");

  const trips = createTrips(owner, 3);
  addPhotos(trips[0]!, 10);
  assert.deepEqual(usageOf(admin, [owner]).get(owner), { trips: 3, photos: 10 });

  const fourth = createTrips(owner, 1)[0]!;
  addPhotos(fourth, 6);
  assert.deepEqual(usageOf(admin, [owner]).get(owner), { trips: 4, photos: 16 });

  must(psqlSync(conn, `DELETE FROM public.photos WHERE experience_id = '${fourth}' AND position_in_moment <= 2;`));
  assert.deepEqual(usageOf(admin, [owner]).get(owner), { trips: 4, photos: 14 });

  must(psqlSync(conn, `DELETE FROM public.experiences WHERE id = '${trips[0]}';`));
  assert.deepEqual(usageOf(admin, [owner]).get(owner), { trips: 3, photos: 4 });
});

test("admin_user_usage is refused for non-admins", suite, () => {
  const regular = newUser();
  const other = newUser();
  const result = runAs(regular, `SELECT * FROM public.admin_user_usage(ARRAY['${other}']::uuid[]);`);
  assert.equal(result.ok, false);
  assert.match(result.err, /not_authorized/);
});

test("without a key no trip can be created", suite, () => {
  const owner = newUser();
  const result = createTrip(owner);
  assert.equal(result.ok, false);
  assert.match(result.err, /no_active_license/);
});

test("BASIC allows exactly 5 trips and refuses the 6th", suite, () => {
  const owner = newUser();
  addCode("MF-TEST-0001-AA", "BASIC");
  const redeemed = redeem(owner, "MF-TEST-0001-AA");
  assert.match(must(redeemed), /^BASIC\|/);

  for (let n = 1; n <= 5; n += 1) {
    assert.ok(createTrip(owner).ok, `trip ${n} must be allowed`);
  }
  const sixth = createTrip(owner);
  assert.equal(sixth.ok, false);
  assert.match(sixth.err, /trip_limit_reached/);

  // Still 5, nothing slipped through.
  assert.equal(must(psqlSync(conn, `SELECT count(*) FROM public.experiences WHERE owner_id = '${owner}';`)), "5");
});

test("a new key stacks on the old one and the app continues", suite, () => {
  const owner = newUser();
  addCode("MF-TEST-0002-AA", "BASIC");
  addCode("MF-TEST-0002-BB", "BASIC");
  must(redeem(owner, "MF-TEST-0002-AA"));
  createTrips(owner, 5);
  assert.equal(createTrip(owner).ok, false, "limit reached with one BASIC key");

  must(redeem(owner, "MF-TEST-0002-BB"));
  for (let n = 6; n <= 10; n += 1) {
    assert.ok(createTrip(owner).ok, `trip ${n} must be allowed with two BASIC keys`);
  }
  const eleventh = createTrip(owner);
  assert.equal(eleventh.ok, false);
  assert.match(eleventh.err, /trip_limit_reached/);
});

test("other plans follow their own allowance", suite, () => {
  const allowance = Number(
    must(psqlSync(conn, `SELECT max_nfc_tags FROM public.plans WHERE name = 'PLUS';`)),
  );
  assert.ok(allowance > 5, "PLUS is bigger than BASIC");
  const owner = newUser();
  grantPlan(owner, "PLUS");
  createTrips(owner, allowance);
  const over = createTrip(owner);
  assert.equal(over.ok, false);
  assert.match(over.err, /trip_limit_reached/);
});

test("a code can't be used twice or by someone else", suite, () => {
  const first = newUser();
  const second = newUser();
  addCode("MF-TEST-0003-AA", "BASIC");
  must(redeem(first, "MF-TEST-0003-AA"));
  const again = must(redeem(second, "MF-TEST-0003-AA"));
  assert.match(again, /code_unavailable/);
  assert.equal(createTrip(second).ok, false);
});

test("simultaneous creations on the last free slot never pass the limit", suite, async () => {
  const owner = newUser();
  grantPlan(owner, "BASIC");
  createTrips(owner, 4);

  // Both transactions try to take the 5th (last) slot and overlap in time: the
  // first holds its transaction open while the others start.
  const attempt = (delay: string) =>
    psqlAsync(
      conn,
      `BEGIN;\nSELECT pg_sleep(${delay});\n${tripSql(owner)}\nSELECT pg_sleep(0.6);\nCOMMIT;`,
    );
  const results = await Promise.all([attempt("0"), attempt("0.2"), attempt("0.3"), attempt("0.4")]);

  assert.equal(results.filter((r) => r.ok).length, 1, "exactly one creation wins the last slot");
  for (const failed of results.filter((r) => !r.ok)) {
    assert.match(failed.err, /trip_limit_reached/);
  }
  assert.equal(
    must(psqlSync(conn, `SELECT count(*) FROM public.experiences WHERE owner_id = '${owner}';`)),
    "5",
  );
});

test("a burst with 2 free slots lets exactly 2 through", suite, async () => {
  const owner = newUser();
  grantPlan(owner, "BASIC");
  createTrips(owner, 3);

  const attempt = (n: number) =>
    psqlAsync(conn, `BEGIN;\nSELECT pg_sleep(${n * 0.05});\n${tripSql(owner)}\nSELECT pg_sleep(0.4);\nCOMMIT;`);
  const results = await Promise.all([0, 1, 2, 3, 4, 5].map(attempt));

  assert.equal(results.filter((r) => r.ok).length, 2);
  assert.equal(
    must(psqlSync(conn, `SELECT count(*) FROM public.experiences WHERE owner_id = '${owner}';`)),
    "5",
  );
});

test("trips created as draft/private are published by the backfill, and then show on the public profile", suite, () => {
  const owner = newUser();
  grantPlan(owner, "BASIC");
  must(psqlSync(conn, `UPDATE public.users SET profile_slug = 'perfil-${randomBytes(3).toString("hex")}' WHERE id = '${owner}';`));
  const [first, second] = createTrips(owner, 2);
  // What the app used to store for a new trip.
  must(psqlSync(conn, `UPDATE public.experiences SET status = 'draft', visibility = 'private' WHERE id IN ('${first}', '${second}');`));

  const asVisitor = () =>
    must(
      psqlSync(
        conn,
        `SET ROLE anon;\nSELECT count(*) FROM public.experiences WHERE owner_id = '${owner}';`,
      ),
    );
  assert.equal(asVisitor(), "0", "private trips are invisible to visitors");

  const backfill = readFileSync(
    path.join(MIGRATIONS, "20261006100000_publish_trips_created_as_private.sql"),
    "utf8",
  );
  must(psqlSync(conn, backfill));
  assert.equal(asVisitor(), "2", "both trips show on the profile");
  // Idempotent.
  must(psqlSync(conn, backfill));
  assert.equal(asVisitor(), "2");
});

test("places.country_code accepts ISO codes, refuses anything else, and the migration is repeatable", suite, () => {
  const owner = newUser();
  grantPlan(owner, "BASIC");
  const [trip] = createTrips(owner, 1);
  const insert = (code: string) =>
    psqlSync(
      conn,
      `INSERT INTO public.places (experience_id, name, country_code) VALUES ('${trip}', 'Zanzibar', ${code});`,
    );

  assert.ok(insert("'TZ'").ok, "valid code");
  assert.ok(insert("NULL").ok, "not resolved yet");
  assert.ok(!insert("'tz'").ok, "lowercase refused");
  assert.ok(!insert("'TZA'").ok, "alpha-3 refused");

  const migration = readFileSync(
    path.join(MIGRATIONS, "20261007100000_place_country_code.sql"),
    "utf8",
  );
  must(psqlSync(conn, migration));
  assert.equal(
    must(psqlSync(conn, `SELECT count(*) FROM public.places WHERE country_code = 'TZ';`)),
    "1",
  );
});
