-- ---------------------------------------------------------------------------
-- Trip creation now requires an active license. Until now, creating a new
-- experience (trip) was completely unrestricted — a brand-new account with
-- zero redeemed activation codes could create unlimited trips, defeating the
-- whole point of the activation code system.
--
-- Unlike enforce_nfc_tag_limit()/enforce_photo_limit() (which fail OPEN when
-- a user has no active license, to grandfather pre-existing accounts via
-- their backfilled LEGACY license), this trigger fails CLOSED: no active
-- license means no new trip, full stop. Existing accounts are unaffected
-- because the LEGACY backfill already gave them an active license with a
-- generous allowance.
--
-- Reuses plans.max_nfc_tags as the trip allowance (not a separate column):
-- in this product, each redeemed code is meant to cover one trip's physical
-- NFC tag, so "5 NFC" and "5 trips" are the same number by design — a basic
-- code grants 5 trips, redeeming a second one stacks to 10, same as it
-- already stacks for physical NFC tag registration.
-- ---------------------------------------------------------------------------

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

  SELECT SUM(p.max_nfc_tags) INTO v_max
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

CREATE TRIGGER experiences_enforce_trip_limit
  BEFORE INSERT ON public.experiences
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_trip_limit();
