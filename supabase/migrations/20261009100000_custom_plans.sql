-- ---------------------------------------------------------------------------
-- Custom ("Personalizado") plans.
--
-- A custom plan is an ordinary row in `plans` that belongs to exactly one user
-- and is assigned by an admin through a normal license. Because the existing
-- limit triggers (trips, photos per trip, NFC tags) already read their numbers
-- from the user's active license -> plan, they apply to a custom plan with no
-- change of their own. The only new thing is that a custom plan can set trips
-- and NFC tags independently: `max_trips` (NULL = same as max_nfc_tags, which
-- is how Basic / Plus / Premium and LEGACY keep working untouched).
--
-- Custom plans are never public: no price_label (the public pricing query needs
-- one), active = false (never offered through activation codes), and the admin
-- screens that list sellable plans filter `is_custom`.
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans
  ADD COLUMN max_trips integer,
  ADD COLUMN is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN custom_user_id uuid REFERENCES public.users (id) ON DELETE CASCADE;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_max_trips_non_negative CHECK (max_trips IS NULL OR max_trips >= 0),
  ADD CONSTRAINT plans_custom_has_owner CHECK (is_custom = (custom_user_id IS NOT NULL));

CREATE UNIQUE INDEX plans_one_custom_per_user
  ON public.plans (custom_user_id) WHERE is_custom;

-- Trip allowance: max_trips when the plan sets one, otherwise max_nfc_tags (unchanged behaviour).
CREATE OR REPLACE FUNCTION public.enforce_trip_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  PERFORM 1 FROM public.licenses
  WHERE user_id = NEW.owner_id AND status = 'active'
  FOR UPDATE;

  SELECT SUM(COALESCE(p.max_trips, p.max_nfc_tags)) INTO v_max
  FROM public.licenses l
  JOIN public.plans p ON p.id = l.plan_id
  WHERE l.user_id = NEW.owner_id AND l.status = 'active';

  IF v_max IS NULL THEN
    RAISE EXCEPTION 'no_active_license' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_count FROM public.experiences WHERE owner_id = NEW.owner_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'trip_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Admin-only, atomic: create/update the user's custom plan and make it their
-- one active license (replacing whatever they had), or deactivate it.
-- The caller is checked inside the function against public.users.is_admin;
-- nothing the client sends decides who may do this.
CREATE OR REPLACE FUNCTION public.admin_set_custom_plan(
  p_user_id uuid,
  p_max_trips integer,
  p_max_photos_per_trip integer,
  p_max_nfc_tags integer,
  p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_max_trips IS NULL OR p_max_photos_per_trip IS NULL OR p_max_nfc_tags IS NULL
     OR p_max_trips < 0 OR p_max_photos_per_trip < 0 OR p_max_nfc_tags < 0 THEN
    RAISE EXCEPTION 'invalid_limits' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.plans (
    name, max_nfc_tags, max_photos_per_trip, max_trips, active, is_custom, custom_user_id
  )
  VALUES (
    'PERSONALIZADO-' || substr(replace(p_user_id::text, '-', ''), 1, 8),
    p_max_nfc_tags, p_max_photos_per_trip, p_max_trips, false, true, p_user_id
  )
  ON CONFLICT (custom_user_id) WHERE is_custom DO UPDATE
    SET max_nfc_tags = EXCLUDED.max_nfc_tags,
        max_photos_per_trip = EXCLUDED.max_photos_per_trip,
        max_trips = EXCLUDED.max_trips
  RETURNING id INTO v_plan_id;

  UPDATE public.licenses
  SET status = 'revoked'
  WHERE user_id = p_user_id AND status = 'active';

  IF p_active THEN
    INSERT INTO public.licenses (user_id, plan_id, status)
    VALUES (p_user_id, v_plan_id, 'active');
  END IF;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_custom_plan(uuid, integer, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_custom_plan(uuid, integer, integer, integer, boolean) TO authenticated;
