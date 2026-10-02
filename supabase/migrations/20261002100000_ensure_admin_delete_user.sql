-- ---------------------------------------------------------------------------
-- Makes sure public.admin_delete_user(p_user_id uuid) exists in the database
-- the admin panel talks to. The admin "Excluir conta" button was failing with
--   Could not find the function public.admin_delete_user(p_user_id)
--   in the schema cache
-- because 20260923190000_admin_delete_user.sql had not (fully) been applied
-- there. That migration creates a trigger *before* the function, so a failure
-- or a re-run at the trigger step leaves the function missing.
--
-- This migration is idempotent and safe to run whether 20260923190000 was
-- applied, partially applied, or never applied: any existing
-- admin_delete_user(uuid) — whatever its parameter name or return type — is
-- dropped and recreated with the signature the API route calls:
-- rpc("admin_delete_user", { p_user_id }). Nothing depends on it. The body is
-- the same one delete_own_account() uses (see
-- 20261001100500_delete_own_account.sql), plus the admin checks.
--
-- It also fixes clear_moment_place_on_place_delete(), which made any trip
-- deletion fail (details below).
--
-- It deliberately does NOT touch the experiences/albums NFC-unlink triggers
-- or their functions: 20260929234500_nfc_tags_album_scope.sql redefines
-- unlink_nfc_tag_on_experience_delete(), and re-creating the older version
-- here would overwrite it. admin_delete_user() does not rely on them — it
-- deletes the user's nfc_tags before their trips.
--
-- What it deletes for the target user (nothing else, never itself or an admin):
--   trips (experiences) and, via ON DELETE CASCADE, their places, moments,
--   photos (metadata) and albums; NFC tags; licenses; the auth account and,
--   through its cascade, public.users (profile, avatar reference, user_blocks).
--   activation_codes the account used are kept as business records, marked
--   'revoked' (never redeemable again); content_reports it filed are kept
--   (reporter_id becomes NULL, see 20261002090000).
-- It returns the R2 storage keys (photos, thumbnails, avatar) so the API route
-- can delete the objects after the rows are gone. R2 objects themselves are
-- never touched by SQL.
--
-- Deleting the auth user from inside this SECURITY DEFINER function needs no
-- service_role key anywhere near the frontend: the function runs as its owner
-- and is only callable by an authenticated admin (checked below).
-- ---------------------------------------------------------------------------

-- Pre-existing defect that also blocks every account/trip deletion (found
-- while testing admin_delete_user against a scratch database): deleting an
-- experience cascades to its places, and the BEFORE DELETE trigger on places
-- (clear_moment_place_on_place_delete, 20260808180000) then runs
--   UPDATE moments SET place_id = NULL WHERE place_id = OLD.id ...
-- Mid-cascade the parent experience row is already gone, so that UPDATE fails
-- moments_experience_id_fkey ("Key (experience_id)=... is not present in
-- table experiences") for any trip whose moments point at a place. Same cause
-- affects DELETE /api/experiences/[id] and delete_own_account().
-- Fix: only clear the reference while the experience still exists. When the
-- experience itself is being deleted its moments are deleted by the same
-- cascade, so there is nothing to clear. Deleting a single place from a living
-- trip behaves exactly as before.
CREATE OR REPLACE FUNCTION public.clear_moment_place_on_place_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.experiences WHERE id = OLD.experience_id) THEN
    UPDATE public.moments
    SET place_id = NULL
    WHERE place_id = OLD.id
      AND experience_id = OLD.experience_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS TABLE (storage_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE users.id = auth.uid() AND is_admin
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE users.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users WHERE users.id = p_user_id AND is_admin
  ) THEN
    RAISE EXCEPTION 'cannot_delete_admin' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT ph.storage_key
  FROM public.photos ph
  JOIN public.experiences ex ON ex.id = ph.experience_id
  WHERE ex.owner_id = p_user_id AND ph.storage_key IS NOT NULL
  UNION
  SELECT ph.thumbnail_storage_key
  FROM public.photos ph
  JOIN public.experiences ex ON ex.id = ph.experience_id
  WHERE ex.owner_id = p_user_id AND ph.thumbnail_storage_key IS NOT NULL
  UNION
  SELECT u.avatar_storage_key
  FROM public.users u
  WHERE u.id = p_user_id AND u.avatar_storage_key IS NOT NULL;

  DELETE FROM public.nfc_tags WHERE user_id = p_user_id;

  UPDATE public.activation_codes
  SET status = 'revoked', user_id = NULL, activated_at = NULL
  WHERE user_id = p_user_id;
  UPDATE public.activation_codes SET created_by = NULL WHERE created_by = p_user_id;

  DELETE FROM public.licenses WHERE user_id = p_user_id;

  DELETE FROM public.experiences WHERE owner_id = p_user_id;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- PostgREST caches the schema; without this the new function can keep
-- answering "not found in the schema cache" until the next reload.
NOTIFY pgrst, 'reload schema';
