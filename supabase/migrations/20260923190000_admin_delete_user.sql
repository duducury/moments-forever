-- ---------------------------------------------------------------------------
-- Lets an admin permanently delete a user account (and everything it owns)
-- from the admin panel. Irreversible — the frontend requires typed
-- confirmation before calling this.
--
-- Fix in passing: deleting an experience that has a linked NFC tag
-- currently fails. ON DELETE SET NULL on nfc_tags.trip_id fires as part of
-- the cascade, but nfc_tags.status stays 'linked' with trip_id now NULL,
-- which immediately violates nfc_tags_linked_consistency. Mirrors the
-- existing cover-photo BEFORE DELETE pattern (already used twice in this
-- schema) to unlink first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unlink_nfc_tag_on_experience_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.nfc_tags
  SET status = 'unlinked', trip_id = NULL
  WHERE trip_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER experiences_unlink_nfc_before_delete
  BEFORE DELETE ON public.experiences
  FOR EACH ROW
  EXECUTE PROCEDURE public.unlink_nfc_tag_on_experience_delete();

-- Deletes everything owned by p_user_id (trips + their places/moments/
-- photos/albums via existing ON DELETE CASCADE, nfc tags, licenses) and
-- finally the auth account itself (cascades to public.users). Never
-- deletes activation_codes this account touched — the code row is a
-- business record worth keeping — but activation_codes_activated_consistency
-- requires user_id/activated_at to be NULL for any non-'activated' status,
-- so an activated code's user_id can't simply be nulled while left
-- 'activated' (and setting it back to 'available' would let the same code
-- be redeemed again by someone else). Marking it 'revoked' instead is the
-- only status that both satisfies the constraint and can never be
-- redeemed again.
-- Returns the R2 storage keys the caller must delete afterward — DB rows
-- are gone by the time this returns, so the API route collects these
-- first and cleans up R2 in a separate step, same pattern already used
-- by DELETE /api/experiences/[id].
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
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

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
