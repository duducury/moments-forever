-- ---------------------------------------------------------------------------
-- Real, database-persisted lockout after too many wrong activation code
-- attempts. The previous in-memory rate limiter in the API route was
-- best-effort only (lost on redeploy/restart, unreliable across serverless
-- instances) — this replaces the actual protection with a counter on the
-- account itself, since redeeming a code already requires being
-- authenticated. Never leaks *why* a code failed: wrong/used/revoked/expired
-- all count the same way.
--
-- redeem_activation_code() is rewritten to report failures as a normal
-- returned row (an error_code column) instead of RAISE EXCEPTION. A
-- PL/pgSQL exception unwinds the ENTIRE current transaction, which would
-- also roll back the attempt-counter UPDATE it's supposed to be recording —
-- the previous version of this function had exactly that bug (verified:
-- the counter never moved past 0 no matter how many wrong codes were sent).
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN failed_activation_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN activation_locked_until timestamptz;

-- Return shape is changing (adding error_code) — CREATE OR REPLACE can't
-- alter the OUT-parameter row type of an existing function.
DROP FUNCTION IF EXISTS public.redeem_activation_code(text);

CREATE FUNCTION public.redeem_activation_code(p_code text)
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  max_nfc_tags integer,
  max_photos_per_trip integer,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_locked_until timestamptz;
  v_attempts integer;
  v_code_id uuid;
  v_plan_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    -- Genuine programming/auth error, not a normal business outcome — the
    -- caller already checks getUser() before invoking this, so this
    -- shouldn't happen in practice, and there's no user row to count against.
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT activation_locked_until, failed_activation_attempts
  INTO v_locked_until, v_attempts
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN QUERY
    SELECT NULL::uuid, NULL::text, NULL::integer, NULL::integer,
      'too_many_attempts'::text;
    RETURN;
  END IF;

  UPDATE public.activation_codes
  SET status = 'activated', user_id = v_user_id, activated_at = now()
  WHERE code = p_code
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING activation_codes.id, activation_codes.plan_id
  INTO v_code_id, v_plan_id;

  IF v_code_id IS NULL THEN
    UPDATE public.users
    SET failed_activation_attempts = failed_activation_attempts + 1,
        activation_locked_until = CASE
          WHEN failed_activation_attempts + 1 >= 5 THEN now() + interval '30 minutes'
          ELSE activation_locked_until
        END
    WHERE id = v_user_id;

    IF EXISTS (SELECT 1 FROM public.activation_codes WHERE code = p_code) THEN
      RETURN QUERY
      SELECT NULL::uuid, NULL::text, NULL::integer, NULL::integer,
        'code_unavailable'::text;
    ELSE
      RETURN QUERY
      SELECT NULL::uuid, NULL::text, NULL::integer, NULL::integer,
        'code_not_found'::text;
    END IF;
    RETURN;
  END IF;

  -- A working code clears the slate.
  UPDATE public.users
  SET failed_activation_attempts = 0, activation_locked_until = NULL
  WHERE id = v_user_id;

  INSERT INTO public.licenses (user_id, plan_id, activation_code_id, status)
  VALUES (v_user_id, v_plan_id, v_code_id, 'active');

  RETURN QUERY
  SELECT p.id, p.name, p.max_nfc_tags, p.max_photos_per_trip, NULL::text
  FROM public.plans p
  WHERE p.id = v_plan_id;
END;
$$;

-- DROP FUNCTION above also dropped its grants — reapply them.
REVOKE ALL ON FUNCTION public.redeem_activation_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(text) TO authenticated;
