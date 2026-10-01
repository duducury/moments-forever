-- ---------------------------------------------------------------------------
-- Content/user reporting (Apple Guideline 2.1 — apps with UGC must let users
-- report objectionable content). Any authenticated user can file a report
-- against a user/experience/album/photo; only an admin can read or update
-- reports. No FK to the reported content's own table (target_type decides
-- which table target_id refers to) — deliberately, so a report survives the
-- reported content being deleted later (e.g. after moderation).
-- ---------------------------------------------------------------------------

CREATE TYPE public.content_report_target AS ENUM (
  'user',
  'experience',
  'album',
  'photo'
);

CREATE TYPE public.content_report_status AS ENUM (
  'open',
  'reviewing',
  'resolved',
  'dismissed'
);

CREATE TABLE public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_type public.content_report_target NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  details text,
  status public.content_report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT content_reports_reason_not_blank
    CHECK (char_length(trim(reason)) > 0)
);

CREATE INDEX content_reports_status_created_idx
  ON public.content_reports (status, created_at DESC);

CREATE INDEX content_reports_target_idx
  ON public.content_reports (target_type, target_id);

CREATE TRIGGER content_reports_set_updated_at
  BEFORE UPDATE ON public.content_reports
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can create reports (as themselves) and see their own reports'
-- existence (not required by the brief, but harmless and lets a future
-- "my reports" view exist without a new policy). No UPDATE/DELETE for
-- non-admins — a filed report cannot be edited or withdrawn from the client.
CREATE POLICY content_reports_insert_own
  ON public.content_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()));

CREATE POLICY content_reports_select_own
  ON public.content_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

-- Admin: full read/update access via the same is_admin pattern used
-- elsewhere (admin_delete_user, admin_list_user_emails).
CREATE POLICY content_reports_select_admin
  ON public.content_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND is_admin
    )
  );

CREATE POLICY content_reports_update_admin
  ON public.content_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND is_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users WHERE users.id = (SELECT auth.uid()) AND is_admin
    )
  );

REVOKE ALL ON TABLE public.content_reports FROM PUBLIC, anon;
GRANT USAGE ON TYPE public.content_report_target TO authenticated;
GRANT USAGE ON TYPE public.content_report_status TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.content_reports TO authenticated;
