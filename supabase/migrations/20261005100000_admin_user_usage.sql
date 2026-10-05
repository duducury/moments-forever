-- ---------------------------------------------------------------------------
-- Admin → Usuários: real, current trip and photo counts per account.
--
-- The admin page used to read `experiences` and `photos` through the admin's
-- own session. Those tables only have "own rows" and "public profile" SELECT
-- policies (there is no admin policy, on purpose — an admin must not be able
-- to browse everyone's private memories), so for any other account the page
-- only saw the trips that happened to be published + public, and private or
-- draft trips counted as zero ("Viagens: 0" for someone with 3 trips).
--
-- This returns just the two numbers, computed live from the source tables,
-- and nothing else (no titles, no photos). SECURITY DEFINER with an explicit
-- is_admin check, same pattern as admin_list_user_emails(). The trip count is
-- exactly what enforce_trip_limit() counts (every experience the user owns),
-- so "used / limit" on the page matches what the limit actually enforces.
-- No stored counters: nothing to keep in sync.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_user_usage(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, trips_count bigint, photos_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.is_admin
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ids.id,
    (
      SELECT count(*) FROM public.experiences e WHERE e.owner_id = ids.id
    ),
    (
      SELECT count(*)
      FROM public.photos p
      JOIN public.experiences e ON e.id = p.experience_id
      WHERE e.owner_id = ids.id
    )
  FROM unnest(p_user_ids) AS ids(id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_usage(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_usage(uuid[]) TO authenticated;
