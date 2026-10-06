-- ---------------------------------------------------------------------------
-- photos.source_asset_id: which photo of the user's phone library a Moments
-- Forever photo came from ("Encontrar viagem / Encontrar fotos").
--
-- Format: '<platform>:<native id>', e.g. 'ios:ABC-123/L0/001' (PHAsset
-- localIdentifier) or 'android:4812' (MediaStore _ID). The native id is only
-- meaningful on the device it came from; the prefix keeps the two platforms
-- from ever colliding.
--
-- It lives ON the photo row on purpose: deleting a photo deletes its
-- source_asset_id, so a photo that was imported and later removed is offered
-- again by "Encontrar fotos". There is no separate "already imported" list.
--
-- NULL for every photo imported before this column existed, and for photos
-- added by the normal pickers. The app tolerates the column not existing yet.
-- ---------------------------------------------------------------------------

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS source_asset_id text;

ALTER TABLE public.photos
  DROP CONSTRAINT IF EXISTS photos_source_asset_id_format;

ALTER TABLE public.photos
  ADD CONSTRAINT photos_source_asset_id_format
  CHECK (
    source_asset_id IS NULL
    OR (
      char_length(source_asset_id) BETWEEN 5 AND 200
      AND source_asset_id ~ '^(ios|android):.+'
    )
  );

CREATE INDEX IF NOT EXISTS photos_source_asset_id_idx
  ON public.photos (experience_id, source_asset_id)
  WHERE source_asset_id IS NOT NULL;
