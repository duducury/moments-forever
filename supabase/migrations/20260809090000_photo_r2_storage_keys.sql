-- Permanent object keys in Cloudflare R2 (private bucket).
-- Nullable: photos may exist before upload completes; IndexedDB remains a local cache.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_key text;

COMMENT ON COLUMN public.photos.storage_key IS
  'R2 object key for the full displayable image (not a public URL).';
COMMENT ON COLUMN public.photos.thumbnail_storage_key IS
  'R2 object key for the map/grid thumbnail (not a public URL).';
