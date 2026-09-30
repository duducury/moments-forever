-- ---------------------------------------------------------------------------
-- NFC tags must resolve to the exact root album (destination card) the owner
-- picked — not just "the experience" it belongs to.
--
-- Bug this fixes: an Experience can have multiple root Albums (one import
-- trip with several destinations — e.g. "Dubai" and "Bali" as two separate
-- cards). Until now nfc_tags only recorded trip_id (the experience), and
-- /n/[token] guessed which album to open by picking whichever root album had
-- the lowest `position` in that experience. That guess can silently disagree
-- with whichever album's card the owner actually tapped "Gravar" on in the
-- UI — so a tag created from the "Dubai" card could open "Bali" if Bali
-- happened to have a lower position within the same experience.
--
-- This adds album_id, backfills every existing linked tag with the exact
-- album /n/[token] already resolves to today (so no physical tag already
-- printed/deployed changes behavior), and moves the one-tag-per-X uniqueness
-- from the experience to the album, so each root album can hold its own
-- independent tag going forward.
--
-- Idempotent throughout: every step guards for "already applied" so this
-- file can be re-run safely (e.g. some steps were applied manually in the
-- Supabase SQL Editor before the rest landed here) without erroring or
-- re-running the backfill.
-- ---------------------------------------------------------------------------

ALTER TABLE public.nfc_tags
  ADD COLUMN IF NOT EXISTS album_id uuid REFERENCES public.albums (id) ON DELETE SET NULL;

-- Backfill: the exact "first root album by position" rule /n/[token] used to
-- apply, computed once per experience and joined in — preserves current
-- behavior for every tag already linked before this migration. Only ever
-- touches rows still missing album_id, so re-running this is a no-op once
-- every linked row has one.
UPDATE public.nfc_tags AS t
SET album_id = fa.id
FROM (
  SELECT DISTINCT ON (a.experience_id) a.experience_id, a.id
  FROM public.albums AS a
  WHERE a.parent_album_id IS NULL
  ORDER BY a.experience_id, a.position ASC
) AS fa
WHERE t.trip_id = fa.experience_id
  AND t.status = 'linked'
  AND t.album_id IS NULL;

-- Guard: a linked tag whose experience has no root album at all can't be
-- backfilled (shouldn't happen — every experience gets a root album
-- automatically — but never leave a row that would violate the tightened
-- consistency check below). Also a no-op once applied.
UPDATE public.nfc_tags
SET status = 'unlinked', trip_id = NULL, album_id = NULL
WHERE status = 'linked' AND album_id IS NULL;

-- Defense in depth: album_id must belong to trip_id's own experience — can
-- never point at another experience's (let alone another owner's) album.
-- Mirrors the existing albums_parent_same_experience_fkey /
-- photos_album_same_experience_fkey pattern, leveraning the composite
-- albums_id_experience_unique key. A NULL in either column (an unlinked tag)
-- skips this check, same as any composite foreign key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nfc_tags_album_same_experience_fkey'
  ) THEN
    ALTER TABLE public.nfc_tags
      ADD CONSTRAINT nfc_tags_album_same_experience_fkey
      FOREIGN KEY (album_id, trip_id)
      REFERENCES public.albums (id, experience_id);
  END IF;
END $$;

-- A linked tag now always names both its experience and its specific album.
ALTER TABLE public.nfc_tags
  DROP CONSTRAINT IF EXISTS nfc_tags_linked_consistency;
ALTER TABLE public.nfc_tags
  ADD CONSTRAINT nfc_tags_linked_consistency
  CHECK (
    (status = 'linked' AND trip_id IS NOT NULL AND album_id IS NOT NULL)
    OR (status = 'unlinked' AND trip_id IS NULL AND album_id IS NULL)
  );

-- One tag per experience → one tag per album. This is what actually lets
-- "Dubai" and "Bali" each hold their own independent physical tag.
DROP INDEX IF EXISTS public.nfc_tags_trip_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS nfc_tags_album_id_unique
  ON public.nfc_tags (album_id) WHERE album_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- resolve_nfc_token now returns the specific album alongside the experience,
-- so /n/[token] can redirect straight there — no more "first root album by
-- position" re-derivation, which is exactly what could disagree with what
-- was actually linked.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.resolve_nfc_token(text);

CREATE FUNCTION public.resolve_nfc_token(p_token text)
RETURNS TABLE (trip_id uuid, album_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT trip_id, album_id FROM public.nfc_tags
  WHERE token = p_token AND status = 'linked';
$$;

REVOKE ALL ON FUNCTION public.resolve_nfc_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nfc_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep the "unlink before cascade" pattern (already used for experience
-- delete) consistent with the tightened consistency check, and add the same
-- guard for deleting a single album directly (a real, reachable path via
-- DELETE /api/albums/[id]) — album_id's own ON DELETE SET NULL would
-- otherwise leave status='linked' with album_id now NULL, violating the
-- check above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unlink_nfc_tag_on_experience_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.nfc_tags
  SET status = 'unlinked', trip_id = NULL, album_id = NULL
  WHERE trip_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_nfc_tag_on_album_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.nfc_tags
  SET status = 'unlinked', trip_id = NULL, album_id = NULL
  WHERE album_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS albums_unlink_nfc_before_delete ON public.albums;
CREATE TRIGGER albums_unlink_nfc_before_delete
  BEFORE DELETE ON public.albums
  FOR EACH ROW
  EXECUTE PROCEDURE public.unlink_nfc_tag_on_album_delete();
