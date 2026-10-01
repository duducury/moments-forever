-- ---------------------------------------------------------------------------
-- User-to-user blocking (Apple Guideline 2.1 — apps with UGC must let a
-- user block another user). Moments Forever has no cross-user feed/inbox,
-- so blocking's practical effect today is limited (see the API route and
-- the audit report) — this exists primarily as the required moderation
-- mechanism, scoped so a blocker only ever manages their own rows.
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_id_idx
  ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- A user only ever sees/manages blocks where they are the blocker — nobody
-- can read who else has blocked them, block on someone else's behalf, or
-- remove someone else's block.
CREATE POLICY user_blocks_select_own
  ON public.user_blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

CREATE POLICY user_blocks_insert_own
  ON public.user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()));

CREATE POLICY user_blocks_delete_own
  ON public.user_blocks
  FOR DELETE
  TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;
