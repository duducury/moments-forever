-- ---------------------------------------------------------------------------
-- Hardening found while investigating a report that didn't show up for
-- review: content_reports.reporter_id was ON DELETE CASCADE, so a report
-- disappears entirely the moment the reporting account is deleted (self
-- deletion via delete_own_account(), or an admin removing that account via
-- admin_delete_user()). That's a real durability gap for a moderation
-- record: a report must survive whatever later happens to the reporter's
-- own account, exactly like it already survives the reported content being
-- deleted (target_id intentionally has no FK at all, for the same reason).
--
-- Switches reporter_id to ON DELETE SET NULL instead, so the row — and the
-- admin's ability to review it via content_reports_select_admin — stays
-- intact even after the reporter's account is gone. content_reports_select_own
-- simply stops matching that row for a reporter who no longer exists, which
-- is correct (there is no one left to view it as "their own report").
-- ---------------------------------------------------------------------------

ALTER TABLE public.content_reports
  ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reporter_id_fkey;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.users (id) ON DELETE SET NULL;
