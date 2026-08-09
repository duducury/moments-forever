-- Permanent profile avatar object in private R2 (for share previews / OG).
-- Local IndexedDB remains a device cache for the owner's UI.

ALTER TABLE public.users
  ADD COLUMN avatar_storage_key text;

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_storage_key_format
  CHECK (
    avatar_storage_key IS NULL
    OR avatar_storage_key ~ '^avatars/[0-9a-fA-F-]{36}/avatar\.(jpe?g|png|webp)$'
  );
