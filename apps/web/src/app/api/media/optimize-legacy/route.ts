import { NextResponse } from "next/server";
import sharp from "sharp";

import { getR2ObjectBytes, putR2Object } from "@/lib/storage/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Recompresses one small batch of the caller's own oversized legacy photos
 * per call (RLS scopes everything to `auth.uid()` — no service-role key
 * needed) and reports whether more candidates remain, so the client can
 * drive this in a loop from a button click. See
 * apps/web/scripts/reprocess-legacy-photos.ts for the equivalent local/
 * bulk tool this mirrors.
 */
export const maxDuration = 60;

const BATCH_SIZE = 3;
const FULL_EDGE = 1600;
const FULL_QUALITY = 82;
const THUMBNAIL_EDGE = 640;
const THUMBNAIL_QUALITY = 88;
const MIN_BYTES = 500_000;
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

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase local não configurado." },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("photos")
    .select("id, storage_key, thumbnail_storage_key, width, height, bytes")
    .not("storage_key", "is", null)
    .or(`bytes.gt.${MIN_BYTES},width.gt.${FULL_EDGE},height.gt.${FULL_EDGE}`)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as PhotoRow[];
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  const errors: string[] = [];

  for (const photo of candidates) {
    const storageKey = photo.storage_key;
    if (!storageKey) continue;
    try {
      const original = await getR2ObjectBytes({ key: storageKey });
      if (!original) {
        skipped++;
        continue;
      }
      const originalBytes = original.body.byteLength;
      const originalMeta = await sharp(original.body).metadata();
      const full = await resizeToWebp(original.body, FULL_EDGE, FULL_QUALITY);

      if (full.buffer.byteLength >= originalBytes * MAX_KEPT_RATIO) {
        // Not worth rewriting — but still correct the row to the photo's
        // actual current size so it stops being picked as a candidate
        // (avoids re-selecting the same unfixable row every batch).
        await supabase
          .from("photos")
          .update({
            width: originalMeta.width ?? photo.width,
            height: originalMeta.height ?? photo.height,
            bytes: originalBytes,
          })
          .eq("id", photo.id);
        skipped++;
        continue;
      }

      let thumbnailBuffer: Buffer | null = null;
      if (photo.thumbnail_storage_key) {
        thumbnailBuffer = (
          await resizeToWebp(original.body, THUMBNAIL_EDGE, THUMBNAIL_QUALITY)
        ).buffer;
      }

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
      if (updateError) throw new Error(updateError.message);

      bytesBefore += originalBytes;
      bytesAfter += full.buffer.byteLength;
      processed++;
    } catch (err) {
      failed++;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return NextResponse.json({
    processed,
    skipped,
    failed,
    bytesBefore,
    bytesAfter,
    remaining: candidates.length === BATCH_SIZE,
    errors,
  });
}
