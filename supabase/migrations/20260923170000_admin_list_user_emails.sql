-- ---------------------------------------------------------------------------
-- Lets the admin panel show each account's email address without exposing
-- it through RLS. public.users is readable by anon/authenticated for any
-- row with a profile_slug (the app's public-profile design) — adding an
-- `email` column directly to that table would leak every user's email to
-- the public internet the moment any query selects it. Instead, read
-- straight from auth.users (never exposed via RLS to begin with) through a
-- SECURITY DEFINER function that checks is_admin itself before returning
-- anything, same pattern as redeem_activation_code()/resolve_nfc_token().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_user_emails(p_user_ids uuid[])
RETURNS TABLE (id uuid, email text)
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

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE u.id = ANY(p_user_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_emails(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_emails(uuid[]) TO authenticated;
