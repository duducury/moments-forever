-- Album hierarchy local validation (synthetic data only).
-- Requires SET LOCAL ROLE + JWT claims in each DO block.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.album_test_results;
CREATE TABLE public.album_test_results (
  name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION public.album_test_record(
  test_name text,
  ok boolean,
  detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.album_test_results (name, passed, detail)
  VALUES (test_name, COALESCE(ok, false), detail)
  ON CONFLICT (name) DO UPDATE
    SET passed = EXCLUDED.passed,
        detail = EXCLUDED.detail;
END;
$$;

GRANT EXECUTE ON FUNCTION public.album_test_record(text, boolean, text)
  TO authenticated;

DO $$
DECLARE
  u1 uuid := 'a1111111-1111-1111-1111-111111111111';
  u2 uuid := 'a2222222-2222-2222-2222-222222222222';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated',
      'album-owner1@example.test', crypt('password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated',
      'album-owner2@example.test', crypt('password', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

DO $$
DECLARE
  u1 uuid := 'a1111111-1111-1111-1111-111111111111';
  u2 uuid := 'a2222222-2222-2222-2222-222222222222';
  exp1 uuid := 'b1111111-1111-1111-1111-111111111111';
  exp2 uuid := 'b2222222-2222-2222-2222-222222222222';
  moment1 uuid := 'c1111111-1111-1111-1111-111111111111';
  photo1 uuid := 'd1111111-1111-1111-1111-111111111111';
  photo2 uuid := 'd2222222-2222-2222-2222-222222222222';
  photo_other uuid := 'd3333333-3333-3333-3333-333333333333';
  root_album uuid;
  child_album uuid;
  sibling_album uuid;
  other_root uuid;
  raised boolean;
  n int;
  ordered_ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';

  INSERT INTO public.experiences (id, owner_id, slug, title)
  VALUES (exp1, u1, 'bali-albums-test', 'Bali');

  INSERT INTO public.moments (
    id, experience_id, place_id, title, position, confirmed_by_user
  ) VALUES (
    moment1, exp1, NULL, 'Ubud', 1, true
  );

  INSERT INTO public.photos (
    id, experience_id, moment_id, position_in_moment, date_source, width, height
  ) VALUES
    (photo1, exp1, moment1, 1, 'absent', 100, 100),
    (photo2, exp1, moment1, 2, 'absent', 120, 80);

  SELECT a.id INTO root_album
  FROM public.albums a
  WHERE a.source_moment_id = moment1;

  PERFORM public.album_test_record(
    'moment_creates_root_album_and_photo_link',
    root_album IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.photos p
        WHERE p.id = photo1
          AND p.album_id = root_album
          AND p.position_in_album = 1
      ),
    format('root_album=%s', root_album)
  );

  -- Create additional root album
  INSERT INTO public.albums (id, experience_id, parent_album_id, name, position)
  VALUES ('e1111111-1111-1111-1111-111111111111', exp1, NULL, 'Seminyak', 2)
  RETURNING id INTO sibling_album;

  PERFORM public.album_test_record(
    'create_root_album',
    sibling_album IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.albums
        WHERE id = sibling_album AND parent_album_id IS NULL AND name = 'Seminyak'
      )
  );

  -- Create subalbum under Ubud-mapped root
  INSERT INTO public.albums (id, experience_id, parent_album_id, name, position)
  VALUES (
    'e2222222-2222-2222-2222-222222222222',
    exp1,
    root_album,
    'Monkey Forest',
    1
  )
  RETURNING id INTO child_album;

  PERFORM public.album_test_record(
    'create_subalbum',
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE id = child_album
        AND parent_album_id = root_album
        AND name = 'Monkey Forest'
    )
  );

  -- Owner 2 experience + album (for cross-experience parent attempt)
  PERFORM set_config('request.jwt.claim.sub', u2::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.experiences (id, owner_id, slug, title)
  VALUES (exp2, u2, 'other-albums-test', 'Other Trip');

  INSERT INTO public.moments (
    id, experience_id, title, position, confirmed_by_user
  ) VALUES (
    'c2222222-2222-2222-2222-222222222222', exp2, 'X', 1, true
  );

  INSERT INTO public.photos (
    id, experience_id, moment_id, position_in_moment, date_source
  ) VALUES (
    photo_other,
    exp2,
    'c2222222-2222-2222-2222-222222222222',
    1,
    'absent'
  );

  INSERT INTO public.albums (id, experience_id, parent_album_id, name, position)
  VALUES ('e3333333-3333-3333-3333-333333333333', exp2, NULL, 'Foreign Root', 2)
  RETURNING id INTO other_root;

  -- Back to owner 1
  PERFORM set_config('request.jwt.claim.sub', u1::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text,
    true
  );

  raised := false;
  BEGIN
    UPDATE public.albums
    SET parent_album_id = other_root
    WHERE id = child_album;
  EXCEPTION
    WHEN foreign_key_violation THEN
      raised := true;
    WHEN OTHERS THEN
      raised := true;
  END;
  PERFORM public.album_test_record(
    'forbid_parent_from_other_experience',
    raised
      AND EXISTS (
        SELECT 1 FROM public.albums
        WHERE id = child_album AND parent_album_id = root_album
      )
  );

  -- Order albums among siblings (roots)
  UPDATE public.albums SET position = 3 WHERE id = sibling_album;
  INSERT INTO public.albums (experience_id, parent_album_id, name, position)
  VALUES (exp1, NULL, 'Kuta', 2);

  SELECT array_agg(a.id ORDER BY a.position)
    INTO ordered_ids
  FROM public.albums a
  WHERE a.experience_id = exp1
    AND a.parent_album_id IS NULL;

  PERFORM public.album_test_record(
    'order_root_albums_by_position',
    ordered_ids[1] = root_album
      AND (
        SELECT name FROM public.albums
        WHERE experience_id = exp1 AND parent_album_id IS NULL AND position = 2
      ) = 'Kuta'
      AND sibling_album = ordered_ids[array_length(ordered_ids, 1)]
  );

  -- Move child under Seminyak
  UPDATE public.albums
  SET parent_album_id = sibling_album,
      position = 1
  WHERE id = child_album;

  PERFORM public.album_test_record(
    'move_album_between_parents_same_experience',
    EXISTS (
      SELECT 1 FROM public.albums
      WHERE id = child_album AND parent_album_id = sibling_album
    )
  );

  -- Delete album with photos must not cascade-delete photos
  raised := false;
  BEGIN
    DELETE FROM public.albums WHERE id = root_album;
  EXCEPTION
    WHEN foreign_key_violation THEN
      raised := true;
  END;
  PERFORM public.album_test_record(
    'delete_album_with_photos_restricted',
    raised
      AND EXISTS (SELECT 1 FROM public.photos WHERE id = photo1)
      AND EXISTS (SELECT 1 FROM public.albums WHERE id = root_album)
  );

  -- Empty album can be deleted
  DELETE FROM public.albums
  WHERE experience_id = exp1
    AND name = 'Kuta'
    AND parent_album_id IS NULL;

  PERFORM public.album_test_record(
    'delete_empty_album_allowed',
    NOT EXISTS (
      SELECT 1 FROM public.albums
      WHERE experience_id = exp1 AND name = 'Kuta'
    )
  );

  -- Cover must be same experience
  SET CONSTRAINTS albums_cover_photo_same_experience_fkey IMMEDIATE;
  raised := false;
  BEGIN
    UPDATE public.albums
    SET cover_photo_id = photo_other
    WHERE id = sibling_album;
  EXCEPTION
    WHEN foreign_key_violation THEN
      raised := true;
    WHEN OTHERS THEN
      raised := true;
  END;
  UPDATE public.albums SET cover_photo_id = photo1 WHERE id = sibling_album;
  PERFORM public.album_test_record(
    'album_cover_same_experience',
    raised
      AND EXISTS (
        SELECT 1 FROM public.albums
        WHERE id = sibling_album AND cover_photo_id = photo1
      )
  );

  -- RLS: user2 cannot see/update user1 albums
  PERFORM set_config('request.jwt.claim.sub', u2::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', u2::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO n FROM public.albums WHERE experience_id = exp1;
  PERFORM public.album_test_record(
    'rls_other_user_cannot_select_albums',
    n = 0,
    format('visible=%s', n)
  );

  raised := false;
  BEGIN
    UPDATE public.albums SET name = 'Hacked' WHERE id = sibling_album;
    IF FOUND THEN
      raised := false;
    ELSE
      raised := true;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      raised := true;
  END;
  PERFORM public.album_test_record(
    'rls_other_user_cannot_update_albums',
    raised
  );

  raised := false;
  BEGIN
    INSERT INTO public.albums (experience_id, name, position)
    VALUES (exp1, 'Intruder', 99);
  EXCEPTION
    WHEN insufficient_privilege THEN
      raised := true;
    WHEN OTHERS THEN
      raised := true;
  END;
  PERFORM public.album_test_record(
    'rls_other_user_cannot_insert_into_foreign_experience',
    raised
  );
END;
$$;

-- Summary
SELECT name, passed, detail
FROM public.album_test_results
ORDER BY name;

SELECT
  count(*) FILTER (WHERE passed) AS passed_count,
  count(*) FILTER (WHERE NOT passed) AS failed_count,
  count(*) AS total
FROM public.album_test_results;

DO $$
DECLARE
  failed int;
BEGIN
  SELECT count(*) INTO failed FROM public.album_test_results WHERE NOT passed;
  IF failed > 0 THEN
    RAISE EXCEPTION '% album validation test(s) failed', failed;
  END IF;
END;
$$;
