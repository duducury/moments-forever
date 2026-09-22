-- ---------------------------------------------------------------------------
-- Activation codes now stack instead of being capped at one per account.
--
-- Buying a second 5-NFC pack and activating its code should grant 5 MORE
-- tags on top of the first pack, not replace it or get rejected. A user can
-- now hold several active licenses at once (one per redeemed code); their
-- effective NFC allowance is the SUM of every active license's plan, and
-- their photo-per-trip ceiling is the BEST (MAX) of those plans, since that
-- limit describes a single trip rather than a consumable pool.
-- ---------------------------------------------------------------------------

-- One row per user was enforced at the database level — remove it so a
-- second (third, fourth, ...) redemption can add its own license row.
DROP INDEX IF EXISTS public.licenses_one_active_per_user;

-- redeem_activation_code(): drop the "already_licensed" block entirely.
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

  UPDATE public.activation_codes
  SET status = 'activated', user_id = v_user_id, activated_at = now()
  WHERE code = p_code
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING activation_codes.id, activation_codes.plan_id
  INTO v_code_id, v_plan_id;

  IF v_code_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.activation_codes WHERE code = p_code) THEN
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

-- enforce_nfc_tag_limit(): SUM across every active license instead of
-- reading a single row. FOR UPDATE can't sit in the same query as an
-- aggregate, so lock the candidate rows first, then aggregate separately.
CREATE OR REPLACE FUNCTION public.enforce_nfc_tag_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max integer;
  v_count integer;
BEGIN
  PERFORM 1 FROM public.licenses
  WHERE user_id = NEW.user_id AND status = 'active'
  FOR UPDATE;

  SELECT SUM(p.max_nfc_tags) INTO v_max
  FROM public.licenses l
  JOIN public.plans p ON p.id = l.plan_id
  WHERE l.user_id = NEW.user_id AND l.status = 'active';

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

-- enforce_photo_limit(): MAX across active licenses (best tier the owner
-- has), not a sum — this caps one trip, it isn't a pool that grows with
-- more codes the way the NFC allowance does.
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

  SELECT MAX(p.max_photos_per_trip) INTO v_max
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
