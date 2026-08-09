-- Stage 1: atomic create of experience graph from an import draft payload.
-- Called only via RPC; runs in a single PostgreSQL transaction.
-- Local validation only — do not push to remote without explicit approval.

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
    COALESCE((experience_row ->> 'status')::public.experience_status, 'draft'),
    COALESCE(
      (experience_row ->> 'visibility')::public.experience_visibility,
      'private'
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
      COALESCE(
        (photo_item ->> 'date_source')::public.photo_date_source,
        'absent'
      ),
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

REVOKE ALL ON FUNCTION public.create_experience_from_import(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_experience_from_import(jsonb) TO authenticated;
