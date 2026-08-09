-- Public profile identity: /{profile_slug}
-- Having profile_slug set makes the owner's experience graph readable by anon.

ALTER TABLE public.users
  ADD COLUMN profile_slug text,
  ADD COLUMN display_name text;

ALTER TABLE public.users
  ADD CONSTRAINT users_profile_slug_format
  CHECK (
    profile_slug IS NULL
    OR profile_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

ALTER TABLE public.users
  ADD CONSTRAINT users_profile_slug_unique UNIQUE (profile_slug);

CREATE INDEX users_profile_slug_idx
  ON public.users (profile_slug)
  WHERE profile_slug IS NOT NULL;

-- Owner can still read/update own row (existing policies).
-- Anyone can resolve a public profile by slug.
CREATE POLICY users_select_public_profile
  ON public.users
  FOR SELECT
  TO anon, authenticated
  USING (profile_slug IS NOT NULL);

-- Experiences owned by a user with a public profile slug.
CREATE POLICY experiences_select_public_profile
  ON public.experiences
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = experiences.owner_id
        AND u.profile_slug IS NOT NULL
    )
  );

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
        AND u.profile_slug IS NOT NULL
    )
  );

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
        AND u.profile_slug IS NOT NULL
    )
  );

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
        AND u.profile_slug IS NOT NULL
    )
  );

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
        AND u.profile_slug IS NOT NULL
    )
  );

GRANT SELECT ON TABLE public.users TO anon;
GRANT SELECT ON TABLE public.experiences TO anon;
GRANT SELECT ON TABLE public.places TO anon;
GRANT SELECT ON TABLE public.moments TO anon;
GRANT SELECT ON TABLE public.photos TO anon;
GRANT SELECT ON TABLE public.albums TO anon;
