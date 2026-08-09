import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { ExperienceImportDraft } from "@moments-forever/types";
import { createClient } from "@supabase/supabase-js";

import {
  buildCreateExperiencePayload,
  createExperienceFromImport,
  isUuid,
} from "./create-experience-from-import.ts";
import {
  assertLocalSupabaseUrl,
  createLocalSupabaseClient,
  readLocalSupabaseConfig,
} from "../supabase/local-client.ts";

/** Well-known local Supabase demo keys (never use against remote). */
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function localEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL?.trim() || LOCAL_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY?.trim() || LOCAL_ANON_KEY,
  };
}

function syntheticDraft(ownerId: string, slug: string): ExperienceImportDraft {
  return {
    experience: {
      id: "experience:provisional",
      ownerId,
      slug,
      title: "Viagem sintetica",
      description: null,
      startsAt: "2024-06-12T09:00:00.000Z",
      endsAt: "2024-06-12T11:00:00.000Z",
      primaryCity: null,
      primaryCountry: null,
      coverPhotoId: "photo-a",
      status: "draft",
      visibility: "private",
    },
    places: [
      {
        id: "place-lisboa",
        experienceId: "experience:provisional",
        name: "Lisboa",
        exactLatitude: 38.72,
        exactLongitude: -9.14,
        locationSource: "gps",
        confirmedByUser: true,
      },
    ],
    moments: [
      {
        id: "moment-lisboa",
        experienceId: "experience:provisional",
        placeId: "place-lisboa",
        title: "Lisboa",
        position: 1,
        startsAt: "2024-06-12T09:00:00.000Z",
        endsAt: "2024-06-12T10:00:00.000Z",
        confirmedByUser: true,
      },
      {
        id: "moment-unknown",
        experienceId: "experience:provisional",
        placeId: null,
        title: "Desconhecido",
        position: 2,
        startsAt: null,
        endsAt: null,
        confirmedByUser: true,
      },
    ],
    photos: [
      {
        id: "photo-a",
        experienceId: "experience:provisional",
        momentId: "moment-lisboa",
        positionInMoment: 1,
        capturedAt: "2024-06-12T09:00:00.000Z",
        dateSource: "exif_original",
        exactLatitude: 38.72,
        exactLongitude: -9.14,
        width: 100,
        height: 80,
        bytes: 1234,
        format: "image/jpeg",
      },
      {
        id: "photo-b",
        experienceId: "experience:provisional",
        momentId: "moment-unknown",
        positionInMoment: 1,
        capturedAt: null,
        dateSource: "absent",
        exactLatitude: null,
        exactLongitude: null,
        width: null,
        height: null,
        bytes: 10,
        format: "image/jpeg",
      },
    ],
  };
}

async function createSyntheticUser(): Promise<{
  readonly userId: string;
  readonly accessToken: string;
}> {
  const config = readLocalSupabaseConfig(localEnv());
  assertLocalSupabaseUrl(config.url);

  const admin = createClient(config.url, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `stage1-${randomUUID()}@example.test`;
  const password = `Pass-${randomUUID()}aA1`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(
      `Failed to create synthetic auth user: ${created.error?.message}`,
    );
  }

  const userClient = createLocalSupabaseClient(config);
  const signedIn = await userClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(
      `Failed to sign in synthetic user: ${signedIn.error?.message}`,
    );
  }

  return {
    userId: created.data.user.id,
    accessToken: signedIn.data.session.access_token,
  };
}

test("buildCreateExperiencePayload remaps provisional ids to UUIDs", () => {
  const ownerId = randomUUID();
  const draft = syntheticDraft(ownerId, "remap-test");
  let n = 0;
  const payload = buildCreateExperiencePayload(draft, () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  });

  assert.equal(isUuid(payload.experience.id), true);
  assert.equal(payload.experience.owner_id, ownerId);
  assert.equal(payload.places.length, 1);
  assert.equal(isUuid(payload.places[0]!.id), true);
  assert.equal(payload.moments[1]!.place_id, null);
  assert.equal(payload.experience.cover_photo_id, payload.photos[0]!.id);
  assert.equal(payload.photos[0]!.moment_id, payload.moments[0]!.id);
  assert.equal(payload.photos[1]!.date_source, "absent");
  assert.equal(payload.photos[1]!.captured_at, null);
});

test("createExperienceFromImport persists graph atomically on local Supabase", async () => {
  const { userId, accessToken } = await createSyntheticUser();
  const config = readLocalSupabaseConfig(localEnv());
  const supabase = createLocalSupabaseClient(config, accessToken);
  const slug = `trip-${randomUUID().slice(0, 8)}`;
  const draft = syntheticDraft(userId, slug);

  const result = await createExperienceFromImport(draft, supabase);
  assert.equal(result.slug, slug);
  assert.equal(isUuid(result.id), true);

  const experience = await supabase
    .from("experiences")
    .select("id, slug, cover_photo_id, status, visibility, primary_city")
    .eq("id", result.id)
    .single();
  assert.equal(experience.error, null);
  assert.equal(experience.data?.slug, slug);
  assert.equal(experience.data?.status, "draft");
  assert.equal(experience.data?.visibility, "private");
  assert.equal(experience.data?.primary_city, null);
  assert.equal(typeof experience.data?.cover_photo_id, "string");

  const places = await supabase
    .from("places")
    .select("id, name, location_source")
    .eq("experience_id", result.id);
  assert.equal(places.error, null);
  assert.equal(places.data?.length, 1);
  assert.equal(places.data?.[0]?.name, "Lisboa");
  assert.equal(places.data?.[0]?.location_source, "gps");

  const moments = await supabase
    .from("moments")
    .select("id, position, place_id, title")
    .eq("experience_id", result.id)
    .order("position");
  assert.equal(moments.error, null);
  assert.equal(moments.data?.length, 2);
  assert.equal(moments.data?.[0]?.position, 1);
  assert.notEqual(moments.data?.[0]?.place_id, null);
  assert.equal(moments.data?.[1]?.place_id, null);

  const photos = await supabase
    .from("photos")
    .select("id, moment_id, date_source, captured_at, exact_latitude")
    .eq("experience_id", result.id);
  assert.equal(photos.error, null);
  assert.equal(photos.data?.length, 2);
  const absent = photos.data?.find((row) => row.date_source === "absent");
  assert.equal(absent?.captured_at, null);
  assert.equal(absent?.exact_latitude, null);
});

test("createExperienceFromImport rolls back when a later step fails", async () => {
  const { userId, accessToken } = await createSyntheticUser();
  const config = readLocalSupabaseConfig(localEnv());
  const supabase = createLocalSupabaseClient(config, accessToken);
  const slug = `fail-${randomUUID().slice(0, 8)}`;
  const draft = syntheticDraft(userId, slug);

  // Invalid GPS pair on the second photo forces a check violation after inserts began.
  const broken: ExperienceImportDraft = {
    ...draft,
    photos: [
      draft.photos[0]!,
      {
        ...draft.photos[1]!,
        exactLatitude: 10,
        exactLongitude: null,
      },
    ],
  };

  await assert.rejects(
    () => createExperienceFromImport(broken, supabase),
    /createExperienceFromImport failed/,
  );

  const leftover = await supabase
    .from("experiences")
    .select("id")
    .eq("slug", slug);
  assert.equal(leftover.error, null);
  assert.equal(leftover.data?.length, 0);
});

test("local client rejects non-local Supabase URLs", () => {
  assert.throws(
    () => assertLocalSupabaseUrl("https://abcdefgh.supabase.co"),
    /only a local Supabase URL/,
  );
});
