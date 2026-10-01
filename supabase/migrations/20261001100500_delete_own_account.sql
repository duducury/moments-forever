-- ---------------------------------------------------------------------------
-- Self-service account deletion (Apple Guideline 2.1 — apps with UGC must
-- let a user delete their own account, not just an admin). Mirrors
-- admin_delete_user() (20260923190000_admin_delete_user.sql) exactly —
-- same cleanup order, same returned storage keys for the caller to delete
-- from R2 — but scoped to auth.uid() directly, with no admin check and no
-- target-user parameter at all, so it can never touch another account.
-- admin_delete_user() itself is untouched; admins still use it from
-- /admin/users to remove a different user's account.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS TABLE (storage_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE users.id = v_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT ph.storage_key
  FROM public.photos ph
  JOIN public.experiences ex ON ex.id = ph.experience_id
  WHERE ex.owner_id = v_user_id AND ph.storage_key IS NOT NULL
  UNION
  SELECT ph.thumbnail_storage_key
  FROM public.photos ph
  JOIN public.experiences ex ON ex.id = ph.experience_id
  WHERE ex.owner_id = v_user_id AND ph.thumbnail_storage_key IS NOT NULL
  UNION
  SELECT u.avatar_storage_key
  FROM public.users u
  WHERE u.id = v_user_id AND u.avatar_storage_key IS NOT NULL;

  DELETE FROM public.nfc_tags WHERE user_id = v_user_id;

  UPDATE public.activation_codes
  SET status = 'revoked', user_id = NULL, activated_at = NULL
  WHERE user_id = v_user_id;
  UPDATE public.activation_codes SET created_by = NULL WHERE created_by = v_user_id;

  DELETE FROM public.licenses WHERE user_id = v_user_id;

  DELETE FROM public.experiences WHERE owner_id = v_user_id;

  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
