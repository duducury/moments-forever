-- ---------------------------------------------------------------------------
-- Activation codes, plans, licenses and NFC tags.
--
-- A code (bought with a physical NFC pack) grants a license/plan to a user
-- account. The plan caps how many NFC tags they can create and how many
-- photos each trip can hold. NFC tags are lightweight rows (no physical
-- inventory tracking) whose public token resolves to a trip.
--
-- This never touches the existing free sign-up flow at /login: an account
-- with no license simply has no plan-based limits enforced (fail-open), so
-- every account that already exists today — including admin/dev accounts —
-- keeps working unchanged. New code-activated accounts get real limits.
-- ---------------------------------------------------------------------------

-- plans -----------------------------------------------------------------------

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  max_nfc_tags integer NOT NULL,
  max_photos_per_trip integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plans_name_unique UNIQUE (name),
  CONSTRAINT plans_max_nfc_tags_non_negative CHECK (max_nfc_tags >= 0),
  CONSTRAINT plans_max_photos_per_trip_non_negative CHECK (max_photos_per_trip >= 0)
);

CREATE TRIGGER plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

INSERT INTO public.plans (name, max_nfc_tags, max_photos_per_trip, active) VALUES
  ('BASIC', 5, 100, true),
  ('PLUS', 10, 250, false),
  ('PREMIUM', 25, 500, false),
  -- Grandfathers every account that exists before this migration runs.
  -- Never offered through new activation codes (active = false).
  ('LEGACY', 999, 100000, false);

-- activation_codes --------------------------------------------------------------

CREATE TYPE public.activation_code_status AS ENUM (
  'available',
  'activated',
  'revoked'
);

CREATE TABLE public.activation_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.plans (id),
  status public.activation_code_status NOT NULL DEFAULT 'available',
  user_id uuid REFERENCES public.users (id),
  activated_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES public.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT activation_codes_code_unique UNIQUE (code),
  CONSTRAINT activation_codes_activated_consistency
    CHECK (
      (status = 'activated' AND user_id IS NOT NULL AND activated_at IS NOT NULL)
      OR (status <> 'activated' AND user_id IS NULL AND activated_at IS NULL)
    )
);

CREATE INDEX activation_codes_status_idx ON public.activation_codes (status);
CREATE INDEX activation_codes_user_id_idx
  ON public.activation_codes (user_id) WHERE user_id IS NOT NULL;

CREATE TRIGGER activation_codes_set_updated_at
  BEFORE UPDATE ON public.activation_codes
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- licenses ------------------------------------------------------------------------

CREATE TYPE public.license_status AS ENUM (
  'active',
  'revoked'
);

CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id),
  plan_id uuid NOT NULL REFERENCES public.plans (id),
  activation_code_id uuid REFERENCES public.activation_codes (id),
  status public.license_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active license per user at a time.
CREATE UNIQUE INDEX licenses_one_active_per_user
  ON public.licenses (user_id)
  WHERE status = 'active';

CREATE TRIGGER licenses_set_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- nfc_tags ------------------------------------------------------------------------

CREATE TYPE public.nfc_tag_status AS ENUM (
  'unlinked',
  'linked'
);

CREATE TABLE public.nfc_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id),
  token text NOT NULL,
  trip_id uuid REFERENCES public.experiences (id) ON DELETE SET NULL,
  status public.nfc_tag_status NOT NULL DEFAULT 'unlinked',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nfc_tags_token_unique UNIQUE (token),
  CONSTRAINT nfc_tags_linked_consistency
    CHECK (
      (status = 'linked' AND trip_id IS NOT NULL)
      OR (status = 'unlinked' AND trip_id IS NULL)
    )
);

CREATE INDEX nfc_tags_user_id_idx ON public.nfc_tags (user_id);
CREATE UNIQUE INDEX nfc_tags_trip_id_unique
  ON public.nfc_tags (trip_id) WHERE trip_id IS NOT NULL;

CREATE TRIGGER nfc_tags_set_updated_at
  BEFORE UPDATE ON public.nfc_tags
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- users: admin flag ----------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- Backfill: every account that exists before this migration gets a LEGACY
-- license, so nothing about their access changes (including admin/dev
-- accounts). Accounts created after this migration are NOT backfilled here —
-- they go through /ativar like any new code-activated account, or simply
-- have no license (fail-open, same as today) if they use the free sign-up.
-- ---------------------------------------------------------------------------

INSERT INTO public.licenses (user_id, plan_id, status)
SELECT u.id, (SELECT id FROM public.plans WHERE name = 'LEGACY'), 'active'
FROM public.users u
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Atomic code redemption. Runs as the function owner (bypasses RLS
-- internally) so the activation_codes table itself can stay locked down to
-- admins only, while any authenticated user can still safely redeem a code
-- they were given. auth.uid() is read inside the function, never trusted
-- from a client-supplied parameter.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_activation_code(p_code text)
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  max_nfc_tags integer,
  max_photos_per_trip integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code_id uuid;
  v_plan_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.licenses WHERE user_id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_licensed' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.activation_codes
  SET status = 'activated', user_id = v_user_id, activated_at = now()
  WHERE code = p_code
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING activation_codes.id, activation_codes.plan_id
  INTO v_code_id, v_plan_id;

  IF v_code_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.activation_codes WHERE code = p_code) THEN
      -- Exists but not available (used/revoked/expired) — distinct error code,
      -- same generic client-facing message either way (see redeem route).
      RAISE EXCEPTION 'code_unavailable' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'code_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.licenses (user_id, plan_id, activation_code_id, status)
  VALUES (v_user_id, v_plan_id, v_code_id, 'active');

  RETURN QUERY
  SELECT p.id, p.name, p.max_nfc_tags, p.max_photos_per_trip
  FROM public.plans p
  WHERE p.id = v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_activation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public NFC token resolution. Returns only the trip id (or null) — never
-- the tag row itself — so anon callers can never enumerate nfc_tags.
-- Whether that trip is actually visible to the caller is still decided by
-- the normal experiences RLS policies afterward, not by this function.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_nfc_token(p_token text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT trip_id FROM public.nfc_tags
  WHERE token = p_token AND status = 'linked';
$$;

REVOKE ALL ON FUNCTION public.resolve_nfc_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nfc_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Race-safe limit enforcement (DB-level, so it can't be bypassed by any
-- current or future code path). Fails OPEN when the owner has no active
-- license, so accounts without one (free sign-ups, pre-migration accounts
-- before the backfill above) are never newly blocked by this feature.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_nfc_tag_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  SELECT p.max_nfc_tags INTO v_max
  FROM public.licenses l
  JOIN public.plans p ON p.id = l.plan_id
  WHERE l.user_id = NEW.user_id AND l.status = 'active'
  FOR UPDATE OF l;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.nfc_tags WHERE user_id = NEW.user_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'nfc_tag_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER nfc_tags_enforce_limit
  BEFORE INSERT ON public.nfc_tags
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_nfc_tag_limit();

CREATE OR REPLACE FUNCTION public.enforce_photo_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id uuid;
  v_max integer;
  v_count integer;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.experiences
  WHERE id = NEW.experience_id
  FOR UPDATE;

  SELECT p.max_photos_per_trip INTO v_max
  FROM public.licenses l
  JOIN public.plans p ON p.id = l.plan_id
  WHERE l.user_id = v_owner_id AND l.status = 'active';

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.photos WHERE experience_id = NEW.experience_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'photo_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER photos_enforce_limit
  BEFORE INSERT ON public.photos
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_photo_limit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;

-- plans: no sensitive data, readable by anyone; only admins edit.
CREATE POLICY plans_select_all
  ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY plans_admin_write
  ON public.plans
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

-- activation_codes: never directly readable/writable by non-admins. Redemption
-- goes through redeem_activation_code(), which bypasses RLS deliberately.
CREATE POLICY activation_codes_admin_select
  ON public.activation_codes
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

CREATE POLICY activation_codes_admin_insert
  ON public.activation_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

CREATE POLICY activation_codes_admin_update
  ON public.activation_codes
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

-- licenses: owners can read their own; admins can read/update all. Inserts
-- only ever happen through redeem_activation_code() or the backfill above.
CREATE POLICY licenses_select_own
  ON public.licenses
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY licenses_admin_select
  ON public.licenses
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

CREATE POLICY licenses_admin_update
  ON public.licenses
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

-- nfc_tags: owners manage their own tags. No anon/authenticated policy at
-- all for reading by token — that goes through resolve_nfc_token() instead.
CREATE POLICY nfc_tags_select_own
  ON public.nfc_tags
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY nfc_tags_admin_select
  ON public.nfc_tags
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.is_admin));

CREATE POLICY nfc_tags_insert_own
  ON public.nfc_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      trip_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.experiences e
        WHERE e.id = trip_id AND e.owner_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY nfc_tags_update_own
  ON public.nfc_tags
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      trip_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.experiences e
        WHERE e.id = trip_id AND e.owner_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY nfc_tags_delete_own
  ON public.nfc_tags
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants: authenticated can use these tables (RLS above narrows it further).
-- anon gets nothing on the new tables except plans (no sensitive data).
-- service_role bypasses RLS (server only, unused by this app today).
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.plans FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.activation_codes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.licenses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.nfc_tags FROM PUBLIC, anon;

GRANT USAGE ON TYPE public.activation_code_status TO authenticated;
GRANT USAGE ON TYPE public.license_status TO authenticated;
GRANT USAGE ON TYPE public.nfc_tag_status TO authenticated;

GRANT SELECT ON TABLE public.plans TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.activation_codes TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.licenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nfc_tags TO authenticated;
