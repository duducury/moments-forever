/**
 * One-off maintenance script: recompress legacy photos uploaded before the
 * app's client-side resize/compress step existed, so they match what a
 * fresh upload produces today (<=1600px "full", <=640px thumbnail, WebP —
 * see src/lib/photo-import/browser-metadata.ts for the reference pipeline).
 *
 * Run this LOCALLY only. It needs a Supabase service-role key (bypasses
 * RLS) and your R2 credentials — never commit them, never add them to
 * Vercel, never paste them anywhere but your local .env.local.
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local --import tsx scripts/reprocess-legacy-photos.ts
 *   node --env-file=.env.local --import tsx scripts/reprocess-legacy-photos.ts --apply
 *
 * Flags:
 *   --apply          actually overwrite R2 objects + update the photos rows
 *                     (default: dry run — logs what would change, writes nothing)
 *   --limit=N        stop after N candidates (default: no limit)
 *   --min-bytes=N    candidate threshold in bytes (default: 500000)
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { getR2ObjectBytes, putR2Object } from "../src/lib/storage/r2";

const FULL_EDGE = 1600;
const FULL_QUALITY = 82;
const THUMBNAIL_EDGE = 640;
const THUMBNAIL_QUALITY = 88;
/** Only overwrite when the recompressed file is at least 10% smaller. */
const MAX_KEPT_RATIO = 0.9;

interface PhotoRow {
  readonly id: string;
  readonly storage_key: string | null;
  readonly thumbnail_storage_key: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number | null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const minBytesArg = args.find((a) => a.startsWith("--min-bytes="));
  return {
    apply: args.includes("--apply"),
    limit: limitArg ? Number(limitArg.slice("--limit=".length)) : null,
    minBytes: minBytesArg
      ? Number(minBytesArg.slice("--min-bytes=".length))
      : 500_000,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function resizeToWebp(
  bytes: Uint8Array,
  edge: number,
  quality: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const buffer = await sharp(bytes)
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? edge, height: meta.height ?? edge };
}

async function main() {
  const { apply, limit, minBytes } = parseArgs();

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  console.log(
    `${apply ? "APPLY" : "DRY RUN"} — candidates: bytes > ${minBytes} OR width/height > ${FULL_EDGE}`,
  );

  const { data, error } = await supabase
    .from("photos")
    .select("id, storage_key, thumbnail_storage_key, width, height, bytes")
    .not("storage_key", "is", null)
    .or(`bytes.gt.${minBytes},width.gt.${FULL_EDGE},height.gt.${FULL_EDGE}`)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Supabase query failed: ${error.message}`);

  const candidates = (data ?? []) as PhotoRow[];
  const batch = limit ? candidates.slice(0, limit) : candidates;
  console.log(`Found ${candidates.length} candidate(s), processing ${batch.length}.`);

  let bytesBefore = 0;
  let bytesAfter = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const photo of batch) {
    const storageKey = photo.storage_key;
    if (!storageKey) continue;
    try {
      const original = await getR2ObjectBytes({ key: storageKey });
      if (!original) {
        console.warn(`[skip] ${photo.id}: object missing at ${storageKey}`);
        skipped++;
        continue;
      }
      const originalBytes = original.body.byteLength;

      const full = await resizeToWebp(original.body, FULL_EDGE, FULL_QUALITY);
      if (full.buffer.byteLength >= originalBytes * MAX_KEPT_RATIO) {
        console.log(
          `[skip] ${photo.id}: recompression not worth it (${originalBytes} -> ${full.buffer.byteLength})`,
        );
        skipped++;
        continue;
      }

      let thumbnailBuffer: Buffer | null = null;
      if (photo.thumbnail_storage_key) {
        thumbnailBuffer = (
          await resizeToWebp(original.body, THUMBNAIL_EDGE, THUMBNAIL_QUALITY)
        ).buffer;
      }

      bytesBefore += originalBytes;
      bytesAfter += full.buffer.byteLength;
      console.log(
        `[${apply ? "apply" : "dry-run"}] ${photo.id}: ${originalBytes} -> ${full.buffer.byteLength} bytes ` +
          `(${photo.width ?? "?"}x${photo.height ?? "?"} -> ${full.width}x${full.height})`,
      );

      if (apply) {
        await putR2Object({
          key: storageKey,
          body: full.buffer,
          contentType: "image/webp",
        });
        if (photo.thumbnail_storage_key && thumbnailBuffer) {
          await putR2Object({
            key: photo.thumbnail_storage_key,
            body: thumbnailBuffer,
            contentType: "image/webp",
          });
        }
        const { error: updateError } = await supabase
          .from("photos")
          .update({
            width: full.width,
            height: full.height,
            bytes: full.buffer.byteLength,
            format: "webp",
          })
          .eq("id", photo.id);
        if (updateError) throw new Error(`DB update failed: ${updateError.message}`);
      }
      updated++;
    } catch (err) {
      failed++;
      console.error(`[error] ${photo.id}:`, err);
    }
  }

  const savedPct =
    bytesBefore > 0 ? Math.round((1 - bytesAfter / bytesBefore) * 100) : 0;
  console.log("\n--- Summary ---");
  console.log(`Processed: ${updated}, skipped: ${skipped}, failed: ${failed}`);
  console.log(
    `Bytes: ${bytesBefore} -> ${bytesAfter} (${savedPct}% smaller)` +
      (apply ? "" : " [dry run — nothing written]"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
