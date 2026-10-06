import assert from "node:assert/strict";
import test from "node:test";

import type {
  MomentsPhotoLibraryPlugin,
  PhotoAssetMetadata,
  PhotoPermissionStatus,
  ScanOptions,
} from "@moments-forever/capacitor-photo-library";

import { createLibraryClient, LibraryCancelledError } from "./library-client";

function item(id: string, extra: Partial<PhotoAssetMetadata> = {}): PhotoAssetMetadata {
  return {
    localIdentifier: id,
    creationDate: "2026-06-10T12:00:00.000Z",
    latitude: 48.85,
    longitude: 2.35,
    width: 4000,
    height: 3000,
    mediaType: "image",
    sourceType: "userLibrary",
    ...extra,
  };
}

function fakePlugin(options: {
  status?: PhotoPermissionStatus;
  requestResult?: PhotoPermissionStatus;
  library?: PhotoAssetMetadata[];
  exportFails?: Set<string>;
  calls?: string[];
}): MomentsPhotoLibraryPlugin {
  const calls = options.calls ?? [];
  const library = options.library ?? [];
  let status = options.status ?? "granted";
  return {
    async checkPermission() {
      calls.push("check");
      return { status };
    },
    async requestPermission() {
      calls.push("request");
      status = options.requestResult ?? "granted";
      return { status };
    },
    async presentLimitedLibraryPicker() {
      calls.push("limitedPicker");
      return { presented: true };
    },
    async getPhotoLibrarySummary() {
      throw new Error("unused");
    },
    async scanPhotoMetadata(scan?: ScanOptions) {
      const offset = scan?.offset ?? 0;
      const limit = scan?.limit ?? 100;
      const assets = library.slice(offset, offset + limit);
      return {
        assets,
        diagnostics: {
          permissionStatus: status,
          platform: "ios" as const,
          totalAssets: library.length,
          scannedAssets: library.length,
          returnedAssets: assets.length,
          scanDurationMs: 7,
          locationCheckedAssets: library.length,
          assetsWithLocation: 0,
          assetsWithoutLocation: 0,
          assetsWithDate: 0,
          assetsWithoutDate: 0,
        },
      };
    },
    async getThumbnails({ localIdentifiers }) {
      return {
        thumbnails: localIdentifiers.map((id) => ({
          localIdentifier: id,
          data: id === "broken" ? null : "AAAA",
        })),
      };
    },
    async exportPhoto({ localIdentifier }) {
      if (options.exportFails?.has(localIdentifier)) throw new Error("iCloud offline");
      return {
        localIdentifier,
        data: "/9j/4AAQ",
        mimeType: "image/jpeg" as const,
        width: 1600,
        height: 1200,
        bytes: 6,
      };
    },
    async openSettings() {
      calls.push("settings");
    },
  };
}

const client = (plugin: MomentsPhotoLibraryPlugin) =>
  createLibraryClient({ plugin, platform: "ios" });

test("full access: reads without prompting again", async () => {
  const calls: string[] = [];
  const access = await client(fakePlugin({ status: "granted", calls })).ensureAccess();
  assert.equal(access.canRead, true);
  assert.deepEqual(calls, ["check"]);
});

test("not asked yet: the system prompt is shown once, and a yes lets the library be read", async () => {
  const calls: string[] = [];
  const access = await client(
    fakePlugin({ status: "notDetermined", requestResult: "granted", calls }),
  ).ensureAccess();
  assert.equal(access.canRead, true);
  assert.deepEqual(calls, ["check", "request"]);
});

test("limited access can read, and says it is limited", async () => {
  const access = await client(fakePlugin({ status: "limited" })).ensureAccess();
  assert.deepEqual([access.canRead, access.limited, access.blocked], [true, true, false]);
});

test("denied access never re-prompts and is reported as blocked (Settings is the way out)", async () => {
  for (const status of ["denied", "restricted"] as const) {
    const calls: string[] = [];
    const access = await client(fakePlugin({ status, calls })).ensureAccess();
    assert.deepEqual([access.canRead, access.blocked], [false, true], status);
    assert.deepEqual(calls, ["check"]);
  }
});

test("saying no to the first prompt ends in a blocked state", async () => {
  const access = await client(
    fakePlugin({ status: "notDetermined", requestResult: "denied" }),
  ).ensureAccess();
  assert.equal(access.canRead, false);
  assert.equal(access.blocked, true);
});

test("an empty library scans to nothing", async () => {
  const result = await client(fakePlugin({ library: [] })).scan();
  assert.deepEqual([result.assets.length, result.totalAssets], [0, 0]);
});

test("scanning pages through the whole library and drops screenshots, videos and shared albums", async () => {
  const library: PhotoAssetMetadata[] = [];
  for (let index = 0; index < 4500; index += 1) library.push(item(`p${index}`));
  library.push(item("shot", { isScreenshot: true }));
  library.push(item("movie", { mediaType: "video" }));
  library.push(item("shared", { sourceType: "cloudShared" }));
  const progress: number[] = [];
  const result = await client(fakePlugin({ library })).scan({ onProgress: (n) => progress.push(n) });
  assert.equal(result.assets.length, 4500);
  assert.equal(result.totalAssets, 4503);
  assert.equal(result.nativeMs, 14); // two pages × 7 ms
  assert.deepEqual(progress, [4000, 4503]);
});

test("photos without GPS or date are kept as-is (the discovery decides what to do with them)", async () => {
  const result = await client(
    fakePlugin({ library: [item("a", { latitude: null, longitude: null, creationDate: null })] }),
  ).scan();
  assert.equal(result.assets[0]?.latitude, null);
  assert.equal(result.assets[0]?.takenAt, null);
});

test("cancelling stops the scan", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client(fakePlugin({ library: [item("a")] })).scan({ signal: controller.signal }),
    LibraryCancelledError,
  );
});

test("exporting turns each chosen photo into a File with its origin; failures are reported, not thrown", async () => {
  const library = [item("ok1"), item("bad"), item("ok2")];
  const lib = client(fakePlugin({ library, exportFails: new Set(["bad"]) }));
  const scanned = (await lib.scan()).assets;
  const result = await lib.exportAssets(scanned);
  assert.equal(result.files.length, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.nativeId, "bad");
  const origin = result.origins.get(result.files[0] as File);
  assert.equal(origin?.sourceAssetId, "ios:ok1");
  assert.equal(origin?.takenAt, "2026-06-10T12:00:00.000Z");
  assert.equal(result.files[0]?.type, "image/jpeg");
});

test("cancelling during the export stops before the next photo", async () => {
  const controller = new AbortController();
  const lib = client(fakePlugin({ library: [item("a"), item("b"), item("c")] }));
  const assets = (await lib.scan()).assets;
  await assert.rejects(
    lib.exportAssets(assets, {
      signal: controller.signal,
      onProgress: (done) => {
        if (done === 1) controller.abort();
      },
    }),
    LibraryCancelledError,
  );
});

test("thumbnails come back as data URLs; unreadable ones are simply missing", async () => {
  const map = await client(fakePlugin({})).thumbnails(["a", "broken"]);
  assert.equal(map.get("a"), "data:image/jpeg;base64,AAAA");
  assert.equal(map.has("broken"), false);
});
