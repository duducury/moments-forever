-- ---------------------------------------------------------------------------
-- Lets an admin grant/change a user's license directly from /admin/users,
-- without an activation code. Previously licenses could only be created by
-- redeem_activation_code() (SECURITY DEFINER) or the backfill migration;
-- this adds the missing RLS policy for a plain admin-authenticated INSERT.
-- Updating an existing license's plan already works via licenses_admin_update.
-- ---------------------------------------------------------------------------

CREATE POLICY licenses_admin_insert
  ON public.licenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = (SELECT auth.uid()) AND u.is_admin
    )
  );

-- The first migration only granted SELECT/UPDATE on licenses (creation was
-- meant to happen only through redeem_activation_code(), which runs with
-- elevated privileges and isn't subject to table grants). A direct INSERT
-- from an admin-authenticated request needs the table grant too — RLS alone
-- doesn't bypass a missing GRANT.
GRANT INSERT ON TABLE public.licenses TO authenticated;
