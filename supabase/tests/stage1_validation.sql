-- Stage 1 local validation (synthetic data only; no real users/media).
-- Requires a single transaction per DO block so local JWT GUCs persist.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.stage1_test_results;
CREATE TABLE public.stage1_test_results (
  name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION public.stage1_record(test_name text, ok boolean, detail text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stage1_test_results (name, passed, detail)
  VALUES (test_name, COALESCE(ok, false), detail)
  ON CONFLICT (name) DO UPDATE
    SET passed = EXCLUDED.passed,
        detail = EXCLUDED.detail;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stage1_record(text, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated',
      'owner1@example.test', crypt('password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated',
      'owner2@example.test', crypt('password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
END;
$$;

SELECT public.stage1_record(
  'auth_user_creates_public_users',
  EXISTS (SELECT 1 FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'),
  'public.users rows created by trigger'
);

-- ---------------------------------------------------------------------------
-- Happy path as user1 (SET LOCAL ROLE authenticated + JWT claims)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  place_lisboa uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  moment_with_place uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  moment_unknown uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  photo_cover uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  photo_nodata uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  photo_nogps uuid := '99999999-9999-9999-9999-999999999999';
  n int;
  err text;
  uid_check uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  uid_check := auth.uid();
  IF uid_check IS DISTINCT FROM u1 THEN
    PERFORM public.stage1_record('owner_can_create_experience_graph', false, format('auth.uid=%s', uid_check));
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.experiences (id, owner_id, slug, title)
    VALUES (exp_id, u1, 'portugal-test', 'Portugal em familia');

    INSERT INTO public.places (id, experience_id, name, exact_latitude, exact_longitude, location_source, confirmed_by_user)
    VALUES (place_lisboa, exp_id, 'Lisboa', 38.72, -9.14, 'gps', true);

    INSERT INTO public.moments (id, experience_id, place_id, title, position, starts_at, ends_at, confirmed_by_user)
    VALUES
      (moment_with_place, exp_id, place_lisboa, 'Chegada', 1, '2026-06-12T09:00:00Z', '2026-06-14T20:00:00Z', true),
      (moment_unknown, exp_id, NULL, 'Desconhecido', 2, NULL, NULL, true);

    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment,
      captured_at, date_source, exact_latitude, exact_longitude, width, height, bytes, format
    ) VALUES
      (photo_cover, exp_id, moment_with_place, 1, '2026-06-12T10:00:00Z', 'exif_original', 38.72, -9.14, 100, 100, 1234, 'image/jpeg'),
      (photo_nodata, exp_id, moment_unknown, 1, NULL, 'absent', NULL, NULL, NULL, NULL, NULL, NULL),
      (photo_nogps, exp_id, moment_with_place, 2, '2026-06-13T11:00:00Z', 'exif_created', NULL, NULL, 200, 200, 2000, 'image/jpeg');

    UPDATE public.experiences e
    SET cover_photo_id = photo_cover
    WHERE e.id = exp_id;

    SELECT count(*) INTO n
    FROM public.experiences e
    WHERE e.id = exp_id AND e.cover_photo_id = photo_cover;
    PERFORM public.stage1_record('owner_can_create_experience_graph', n = 1, 'experience+place+moments+photos+cover');

    SELECT count(*) INTO n
    FROM public.moments m
    WHERE m.id = moment_unknown AND m.place_id IS NULL;
    PERFORM public.stage1_record('moment_without_place_allowed', n = 1);

    SELECT count(*) INTO n
    FROM public.photos p
    WHERE p.id = photo_nodata AND p.captured_at IS NULL AND p.date_source = 'absent';
    PERFORM public.stage1_record('photo_without_date_allowed', n = 1);

    SELECT count(*) INTO n
    FROM public.photos p
    WHERE p.id = photo_nogps
      AND p.exact_latitude IS NULL
      AND p.exact_longitude IS NULL
      AND p.captured_at IS NOT NULL;
    PERFORM public.stage1_record('photo_without_gps_allowed', n = 1);
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    PERFORM public.stage1_record('owner_can_create_experience_graph', false, err);
    PERFORM public.stage1_record('moment_without_place_allowed', false, err);
    PERFORM public.stage1_record('photo_without_date_allowed', false, err);
    PERFORM public.stage1_record('photo_without_gps_allowed', false, err);
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: user2 cannot access/modify user1 data
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  moment_with_place uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  n int;
  raised boolean;
  err text := NULL;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u2::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n FROM public.experiences WHERE id = exp_id;
  PERFORM public.stage1_record('rls_blocks_select_other_experience', n = 0, format('visible_rows=%s', n));

  raised := false;
  BEGIN
    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment, date_source
    ) VALUES (
      '12345678-1234-1234-1234-1234567890ab', exp_id, moment_with_place, 99, 'absent'
    );
  EXCEPTION WHEN others THEN
    raised := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM public.stage1_record('rls_blocks_insert_photo_other_experience', raised, err);

  raised := false;
  err := NULL;
  BEGIN
    UPDATE public.photos
    SET format = 'hacked'
    WHERE experience_id = exp_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    raised := (n = 0);
    err := format('row_count=%s', n);
  EXCEPTION WHEN others THEN
    raised := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;
  PERFORM public.stage1_record('rls_blocks_update_photo_other_experience', raised, err);
END;
$$;

-- ---------------------------------------------------------------------------
-- owner_id change attempt (as owner)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  raised boolean := false;
  owner uuid;
  err text := NULL;
  n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.experiences SET owner_id = u2 WHERE id = exp_id;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN others THEN
    raised := true;
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
  END;

  SELECT owner_id INTO owner FROM public.experiences WHERE id = exp_id;
  PERFORM public.stage1_record(
    'rls_blocks_owner_id_transfer',
    raised AND COALESCE(owner, u1) = u1,
    format('raised=%s owner=%s row_count=%s err=%s', raised, owner, n, err)
  );
END;
$$;

DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  owner uuid;
BEGIN
  SELECT owner_id INTO owner FROM public.experiences WHERE id = exp_id;
  PERFORM public.stage1_record('owner_id_unchanged_after_transfer_attempt', owner = u1, format('owner=%s', owner));
END;
$$;

-- ---------------------------------------------------------------------------
-- Constraint / FK tests (as postgres)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  exp2 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
  place2 uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbc';
  moment2 uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccd';
  moment_u1 uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  raised boolean;
BEGIN
  INSERT INTO public.experiences (id, owner_id, slug, title)
  VALUES (exp2, u1, 'other-exp', 'Other');

  INSERT INTO public.places (id, experience_id, name)
  VALUES (place2, exp2, 'Porto');

  INSERT INTO public.moments (id, experience_id, place_id, position, confirmed_by_user)
  VALUES (moment2, exp2, place2, 1, true);

  raised := false;
  BEGIN
    INSERT INTO public.photos (id, experience_id, moment_id, position_in_moment, date_source)
    VALUES ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', exp_id, moment2, 50, 'absent');
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('fk_photo_moment_same_experience', raised);

  -- Deferred cover FK only fails at commit unless made IMMEDIATE.
  SET CONSTRAINTS experiences_cover_photo_same_experience_fkey IMMEDIATE;
  raised := false;
  BEGIN
    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment, date_source
    ) VALUES (
      'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff', exp2, moment2, 2, 'absent'
    );
    UPDATE public.experiences
    SET cover_photo_id = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
    WHERE id = exp_id;
  EXCEPTION WHEN foreign_key_violation THEN
    raised := true;
  END;
  UPDATE public.experiences
  SET cover_photo_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  WHERE id = exp_id
    AND cover_photo_id IS DISTINCT FROM 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  PERFORM public.stage1_record('fk_cover_same_experience', raised);
  SET CONSTRAINTS experiences_cover_photo_same_experience_fkey DEFERRED;

  raised := false;
  BEGIN
    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment, date_source, exact_latitude, exact_longitude
    ) VALUES (
      'aaaaaaaa-bbbb-cccc-dddd-111111111111', exp_id, moment_u1, 80, 'absent', 10.0, NULL
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('constraint_gps_pair_required', raised);

  raised := false;
  BEGIN
    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment,
      captured_at, date_source, exact_latitude, exact_longitude
    ) VALUES (
      'aaaaaaaa-bbbb-cccc-dddd-222222222222', exp_id, moment_u1, 81,
      now(), 'exif_original', 100.0, 10.0
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('constraint_gps_latitude_range', raised);

  raised := false;
  BEGIN
    UPDATE public.experiences
    SET starts_at = '2026-06-20T00:00:00Z', ends_at = '2026-06-10T00:00:00Z'
    WHERE id = exp_id;
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('constraint_experience_period', raised);

  raised := false;
  BEGIN
    UPDATE public.moments
    SET starts_at = '2026-06-20T00:00:00Z', ends_at = '2026-06-10T00:00:00Z'
    WHERE id = moment_u1;
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('constraint_moment_period', raised);

  raised := false;
  BEGIN
    INSERT INTO public.photos (
      id, experience_id, moment_id, position_in_moment, captured_at, date_source
    ) VALUES (
      'aaaaaaaa-bbbb-cccc-dddd-333333333333', exp_id, moment_u1, 82, now(), 'absent'
    );
  EXCEPTION WHEN check_violation THEN
    raised := true;
  END;
  PERFORM public.stage1_record('constraint_date_source_absent_null_captured', raised);

  raised := false;
  BEGIN
    UPDATE public.experiences SET slug = 'changed-slug' WHERE id = exp_id;
  EXCEPTION WHEN others THEN
    raised := true;
  END;
  PERFORM public.stage1_record(
    'slug_immutable_trigger',
    raised AND EXISTS (
      SELECT 1 FROM public.experiences WHERE id = exp_id AND slug = 'portugal-test'
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- SET NULL trigger behaviors
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  exp_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  target_place uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  moment_with_place uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  photo_cover uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  place_after uuid;
  cover_after uuid;
  exp_still uuid;
BEGIN
  DELETE FROM public.places WHERE id = target_place;
  SELECT m.place_id, m.experience_id INTO place_after, exp_still
  FROM public.moments m WHERE m.id = moment_with_place;
  PERFORM public.stage1_record(
    'trigger_place_delete_nulls_place_id_only',
    place_after IS NULL AND exp_still = exp_id,
    format('place_id=%s experience_id=%s', place_after, exp_still)
  );

  DELETE FROM public.photos WHERE id = photo_cover;
  SELECT e.cover_photo_id INTO cover_after FROM public.experiences e WHERE e.id = exp_id;
  PERFORM public.stage1_record(
    'trigger_photo_delete_nulls_cover_only',
    cover_after IS NULL AND EXISTS (SELECT 1 FROM public.experiences WHERE id = exp_id),
    format('cover_photo_id=%s', cover_after)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Report (before cleanup)
-- ---------------------------------------------------------------------------

SELECT name, passed, coalesce(detail, '') AS detail
FROM public.stage1_test_results
ORDER BY passed ASC, name;

SELECT
  count(*) FILTER (WHERE passed) AS passed_count,
  count(*) FILTER (WHERE NOT passed) AS failed_count,
  count(*) AS total
FROM public.stage1_test_results;

DROP FUNCTION IF EXISTS public.stage1_record(text, boolean, text);
DROP TABLE IF EXISTS public.stage1_test_results;
