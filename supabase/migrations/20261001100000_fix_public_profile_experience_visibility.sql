-- ---------------------------------------------------------------------------
-- Fixes a gap found in the Apple Guideline 2.1 audit: the public-profile RLS
-- policies (20260808220000_public_profile_slug.sql) only ever checked
-- `users.profile_slug IS NOT NULL` on the owner — never the per-experience
-- `experiences.visibility`/`experiences.status` columns that already exist
-- in the schema. In practice this meant a public-profile owner's trips were
-- ALL publicly readable regardless of their own visibility/status, and
-- `apps/web/src/lib/experiences/load-owner-place-cards.ts` mirrored that
-- (only ever filtered by `owner_id`).
--
-- Every existing row is currently 'private'/'draft' (the column defaults),
-- because nothing in the app has ever set them to anything else — there is
-- no "publish" UI. Gating public reads on 'public'/'published' as-is would
-- make every currently-public trip disappear, which the audit explicitly
-- called out to avoid ("Preserve o comportamento atual para viagens que já
-- são públicas"). So this migration:
--   1. Backfills every existing experience to 'public'/'published' —
--      materializing exactly what is visible today (gated entirely by the
--      owner's profile_slug) into the per-row columns, changing nothing
--      visible.
--   2. Changes the column defaults and create_experience_from_import()'s
--      fallback values so newly created trips keep behaving exactly like
--      today (immediately visible once the owner has a public profile) —
--      without this, new trips created after this migration would default
--      to 'private'/'draft' and silently stop appearing, a regression this
--      migration must not introduce.
--   3. Tightens the public-profile SELECT policies to also require
--      visibility = 'public' AND status = 'published', so a future
--      "make this trip private" feature (not built here — no UI exists yet)
--      has a real per-trip switch to flip, enforced at the RLS layer.
--
-- Does not touch nfc_tags, resolve_nfc_token(), or anything NFC-specific.
-- /n/[token] and /a/[code] both do a plain `experiences`/`albums` SELECT
-- after their own token/code lookup and rely on these same RLS policies
-- (see their own file comments) — backfilling every existing experience to
-- 'public'/'published' keeps that resolution working exactly as before for
-- every tag/link that currently works, with no change to NFC code or data.
-- ---------------------------------------------------------------------------

UPDATE public.experiences
SET visibility = 'public', status = 'published'
WHERE visibility IS DISTINCT FROM 'public' OR status IS DISTINCT FROM 'published';

ALTER TABLE public.experiences
  ALTER COLUMN status SET DEFAULT 'published',
  ALTER COLUMN visibility SET DEFAULT 'public';

CREATE OR REPLACE FUNCTION public.create_experience_from_import(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  experience_row jsonb := payload -> 'experience';
  experience_id uuid;
  owner_id uuid;
  cover_id uuid;
  slug text;
  place_item jsonb;
  moment_item jsonb;
  photo_item jsonb;
BEGIN
  IF experience_row IS NULL OR jsonb_typeof(experience_row) <> 'object' THEN
    RAISE EXCEPTION 'payload.experience is required';
  END IF;

  experience_id := (experience_row ->> 'id')::uuid;
  owner_id := (experience_row ->> 'owner_id')::uuid;
  slug := experience_row ->> 'slug';

  IF auth.uid() IS NULL OR auth.uid() <> owner_id THEN
    RAISE EXCEPTION 'not authorized to create experience for this owner';
  END IF;

  INSERT INTO public.experiences (
    id,
    owner_id,
    slug,
    title,
    description,
    starts_at,
    ends_at,
    primary_city,
    primary_country,
    cover_photo_id,
    status,
    visibility
  ) VALUES (
    experience_id,
    owner_id,
    slug,
    experience_row ->> 'title',
    NULLIF(experience_row ->> 'description', ''),
    NULLIF(experience_row ->> 'starts_at', '')::timestamptz,
    NULLIF(experience_row ->> 'ends_at', '')::timestamptz,
    NULLIF(experience_row ->> 'primary_city', ''),
    NULLIF(experience_row ->> 'primary_country', ''),
    NULL,
    -- Was COALESCE(..., 'draft')/COALESCE(..., 'private') — see the
    -- migration-level comment above for why this changed.
    COALESCE((experience_row ->> 'status')::public.experience_status, 'published'),
    COALESCE(
      (experience_row ->> 'visibility')::public.experience_visibility,
      'public'
    )
  );

  FOR place_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'places', '[]'::jsonb))
  LOOP
    INSERT INTO public.places (
      id,
      experience_id,
      name,
      exact_latitude,
      exact_longitude,
      location_source,
      confirmed_by_user
    ) VALUES (
      (place_item ->> 'id')::uuid,
      experience_id,
      place_item ->> 'name',
      NULLIF(place_item ->> 'exact_latitude', '')::double precision,
      NULLIF(place_item ->> 'exact_longitude', '')::double precision,
      NULLIF(place_item ->> 'location_source', '')::public.location_source,
      COALESCE((place_item ->> 'confirmed_by_user')::boolean, false)
    );
  END LOOP;

  FOR moment_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'moments', '[]'::jsonb))
  LOOP
    INSERT INTO public.moments (
      id,
      experience_id,
      place_id,
      title,
      position,
      starts_at,
      ends_at,
      confirmed_by_user
    ) VALUES (
      (moment_item ->> 'id')::uuid,
      experience_id,
      NULLIF(moment_item ->> 'place_id', '')::uuid,
      NULLIF(moment_item ->> 'title', ''),
      (moment_item ->> 'position')::integer,
      NULLIF(moment_item ->> 'starts_at', '')::timestamptz,
      NULLIF(moment_item ->> 'ends_at', '')::timestamptz,
      COALESCE((moment_item ->> 'confirmed_by_user')::boolean, false)
    );
  END LOOP;

  FOR photo_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'photos', '[]'::jsonb))
  LOOP
    INSERT INTO public.photos (
      id,
      experience_id,
      moment_id,
      position_in_moment,
      captured_at,
      date_source,
      exact_latitude,
      exact_longitude,
      width,
      height,
      bytes,
      format
    ) VALUES (
      (photo_item ->> 'id')::uuid,
      experience_id,
      (photo_item ->> 'moment_id')::uuid,
      (photo_item ->> 'position_in_moment')::integer,
      NULLIF(photo_item ->> 'captured_at', '')::timestamptz,
      COALESCE((photo_item ->> 'date_source')::public.photo_date_source, 'absent'),
      NULLIF(photo_item ->> 'exact_latitude', '')::double precision,
      NULLIF(photo_item ->> 'exact_longitude', '')::double precision,
      NULLIF(photo_item ->> 'width', '')::integer,
      NULLIF(photo_item ->> 'height', '')::integer,
      NULLIF(photo_item ->> 'bytes', '')::bigint,
      NULLIF(photo_item ->> 'format', '')
    );
  END LOOP;

  cover_id := NULLIF(experience_row ->> 'cover_photo_id', '')::uuid;
  IF cover_id IS NOT NULL THEN
    UPDATE public.experiences AS e
    SET cover_photo_id = cover_id
    WHERE e.id = experience_id;
  END IF;

  RETURN jsonb_build_object(
    'id', experience_id,
    'slug', slug
  );
END;
$$;

-- experiences --------------------------------------------------------------

DROP POLICY IF EXISTS experiences_select_public_profile ON public.experiences;
CREATE POLICY experiences_select_public_profile
  ON public.experiences
  FOR SELECT
  TO anon, authenticated
  USING (
    visibility = 'public'
    AND status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = experiences.owner_id
        AND u.profile_slug IS NOT NULL
    )
  );

-- places ---------------------------------------------------------------------

DROP POLICY IF EXISTS places_select_public_profile ON public.places;
CREATE POLICY places_select_public_profile
  ON public.places
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      JOIN public.users u ON u.id = e.owner_id
      WHERE e.id = places.experience_id
        AND e.visibility = 'public'
        AND e.status = 'published'
        AND u.profile_slug IS NOT NULL
    )
  );

-- moments ----------------------------------------------------------------

DROP POLICY IF EXISTS moments_select_public_profile ON public.moments;
CREATE POLICY moments_select_public_profile
  ON public.moments
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      JOIN public.users u ON u.id = e.owner_id
      WHERE e.id = moments.experience_id
        AND e.visibility = 'public'
        AND e.status = 'published'
        AND u.profile_slug IS NOT NULL
    )
  );

-- photos -------------------------------------------------------------------

DROP POLICY IF EXISTS photos_select_public_profile ON public.photos;
CREATE POLICY photos_select_public_profile
  ON public.photos
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      JOIN public.users u ON u.id = e.owner_id
      WHERE e.id = photos.experience_id
        AND e.visibility = 'public'
        AND e.status = 'published'
        AND u.profile_slug IS NOT NULL
    )
  );

-- albums ---------------------------------------------------------------------

DROP POLICY IF EXISTS albums_select_public_profile ON public.albums;
CREATE POLICY albums_select_public_profile
  ON public.albums
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      JOIN public.users u ON u.id = e.owner_id
      WHERE e.id = albums.experience_id
        AND e.visibility = 'public'
        AND e.status = 'published'
        AND u.profile_slug IS NOT NULL
    )
  );
