-- Stage 1: Experience persistence
-- Follows docs/database.md exactly.
-- Out of scope: upload, R2, media refs, map/PostGIS public, NFC, AI, video,
-- collections detail, upload_sessions, access_grants.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.experience_status AS ENUM (
  'draft',
  'processing',
  'published',
  'archived'
);

CREATE TYPE public.experience_visibility AS ENUM (
  'private',
  'public'
);

CREATE TYPE public.location_source AS ENUM (
  'gps',
  'manual'
);

CREATE TYPE public.photo_date_source AS ENUM (
  'exif_original',
  'exif_created',
  'absent'
);

-- ---------------------------------------------------------------------------
-- Helpers: updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- users (profile; identity from auth.users)
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- Keep public.users in sync with auth signups (required for owner_id FK).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- experiences
-- cover_photo_id FK added after photos exists (circular dependency).
-- ---------------------------------------------------------------------------

CREATE TABLE public.experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users (id),
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  primary_city text,
  primary_country text,
  cover_photo_id uuid,
  status public.experience_status NOT NULL DEFAULT 'draft',
  visibility public.experience_visibility NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT experiences_title_not_blank
    CHECK (char_length(trim(title)) > 0),
  CONSTRAINT experiences_period_valid
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT experiences_slug_format
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT experiences_slug_unique UNIQUE (slug)
);

CREATE INDEX experiences_owner_status_created_idx
  ON public.experiences (owner_id, status, created_at DESC);

CREATE TRIGGER experiences_set_updated_at
  BEFORE UPDATE ON public.experiences
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- Slug immutable after insert.
CREATE OR REPLACE FUNCTION public.prevent_slug_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'experiences.slug is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER experiences_prevent_slug_change
  BEFORE UPDATE ON public.experiences
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_slug_change();

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  name text NOT NULL,
  exact_latitude double precision,
  exact_longitude double precision,
  location_source public.location_source,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT places_id_experience_unique UNIQUE (id, experience_id),
  CONSTRAINT places_name_not_blank
    CHECK (char_length(trim(name)) > 0),
  CONSTRAINT places_location_pair_valid
    CHECK (
      (exact_latitude IS NULL AND exact_longitude IS NULL AND location_source IS NULL)
      OR
      (exact_latitude IS NOT NULL AND exact_longitude IS NOT NULL AND location_source IS NOT NULL)
    ),
  CONSTRAINT places_latitude_range
    CHECK (exact_latitude IS NULL OR exact_latitude BETWEEN -90 AND 90),
  CONSTRAINT places_longitude_range
    CHECK (exact_longitude IS NULL OR exact_longitude BETWEEN -180 AND 180)
);

CREATE INDEX places_experience_id_idx
  ON public.places (experience_id);

CREATE TRIGGER places_set_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- moments
-- place_id NULL = momento sem localização ("Desconhecido").
-- Composite FK to places; MATCH SIMPLE allows place_id NULL.
-- ON DELETE SET NULL cannot be used on this composite FK (would null experience_id).
-- A BEFORE DELETE trigger on places clears place_id only.
-- ---------------------------------------------------------------------------

CREATE TABLE public.moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  place_id uuid,
  title text,
  position integer NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT moments_id_experience_unique UNIQUE (id, experience_id),
  CONSTRAINT moments_experience_position_unique UNIQUE (experience_id, position),
  CONSTRAINT moments_position_positive CHECK (position >= 1),
  CONSTRAINT moments_period_valid
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT moments_place_same_experience_fkey
    FOREIGN KEY (place_id, experience_id)
    REFERENCES public.places (id, experience_id)
);

CREATE INDEX moments_experience_place_idx
  ON public.moments (experience_id, place_id);

CREATE TRIGGER moments_set_updated_at
  BEFORE UPDATE ON public.moments
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.clear_moment_place_on_place_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.moments
  SET place_id = NULL
  WHERE place_id = OLD.id
    AND experience_id = OLD.experience_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER places_clear_moment_place_before_delete
  BEFORE DELETE ON public.places
  FOR EACH ROW
  EXECUTE PROCEDURE public.clear_moment_place_on_place_delete();

-- ---------------------------------------------------------------------------
-- photos
-- Missing GPS/date remain valid (nullable coords; date_source = absent).
-- ---------------------------------------------------------------------------

CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  moment_id uuid NOT NULL,
  position_in_moment integer NOT NULL,
  captured_at timestamptz,
  date_source public.photo_date_source NOT NULL DEFAULT 'absent',
  exact_latitude double precision,
  exact_longitude double precision,
  width integer,
  height integer,
  bytes bigint,
  format text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT photos_id_experience_unique UNIQUE (id, experience_id),
  CONSTRAINT photos_moment_position_unique UNIQUE (moment_id, position_in_moment),
  CONSTRAINT photos_position_positive CHECK (position_in_moment >= 1),
  CONSTRAINT photos_gps_pair_valid
    CHECK (
      (exact_latitude IS NULL AND exact_longitude IS NULL)
      OR
      (exact_latitude IS NOT NULL AND exact_longitude IS NOT NULL)
    ),
  CONSTRAINT photos_latitude_range
    CHECK (exact_latitude IS NULL OR exact_latitude BETWEEN -90 AND 90),
  CONSTRAINT photos_longitude_range
    CHECK (exact_longitude IS NULL OR exact_longitude BETWEEN -180 AND 180),
  CONSTRAINT photos_date_source_consistent
    CHECK (
      (date_source = 'absent' AND captured_at IS NULL)
      OR
      (date_source IN ('exif_original', 'exif_created') AND captured_at IS NOT NULL)
    ),
  CONSTRAINT photos_width_positive CHECK (width IS NULL OR width > 0),
  CONSTRAINT photos_height_positive CHECK (height IS NULL OR height > 0),
  CONSTRAINT photos_bytes_non_negative CHECK (bytes IS NULL OR bytes >= 0),
  -- Critical: photo moment must belong to the same experience.
  CONSTRAINT photos_moment_same_experience_fkey
    FOREIGN KEY (moment_id, experience_id)
    REFERENCES public.moments (id, experience_id)
    ON DELETE CASCADE
);

CREATE INDEX photos_experience_id_idx
  ON public.photos (experience_id);

CREATE INDEX photos_experience_captured_at_idx
  ON public.photos (experience_id, captured_at);

CREATE TRIGGER photos_set_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cover photo: composite FK, DEFERRABLE INITIALLY DEFERRED.
-- ON DELETE SET NULL cannot apply to composite (would null experiences.id).
-- BEFORE DELETE on photos clears cover_photo_id only.
-- ---------------------------------------------------------------------------

ALTER TABLE public.experiences
  ADD CONSTRAINT experiences_cover_photo_same_experience_fkey
  FOREIGN KEY (cover_photo_id, id)
  REFERENCES public.photos (id, experience_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.clear_cover_on_photo_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.experiences
  SET cover_photo_id = NULL
  WHERE cover_photo_id = OLD.id
    AND id = OLD.experience_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER photos_clear_cover_before_delete
  BEFORE DELETE ON public.photos
  FOR EACH ROW
  EXECUTE PROCEDURE public.clear_cover_on_photo_delete();

-- ---------------------------------------------------------------------------
-- RLS: owner-only access for Stage 1 (no public reads yet).
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

-- Deny by default; no policies for anon public reads in this stage.

-- users ------------------------------------------------------------------

CREATE POLICY users_select_own
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY users_update_own
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Inserts come from SECURITY DEFINER trigger on auth.users; no client INSERT.

-- experiences ------------------------------------------------------------

CREATE POLICY experiences_select_own
  ON public.experiences
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

CREATE POLICY experiences_insert_own
  ON public.experiences
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY experiences_update_own
  ON public.experiences
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY experiences_delete_own
  ON public.experiences
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Child tables: access only via owned experience ------------------------------

CREATE POLICY places_select_own
  ON public.places
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = places.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY places_insert_own
  ON public.places
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = places.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY places_update_own
  ON public.places
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = places.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = places.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY places_delete_own
  ON public.places
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = places.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY moments_select_own
  ON public.moments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = moments.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY moments_insert_own
  ON public.moments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = moments.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY moments_update_own
  ON public.moments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = moments.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = moments.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY moments_delete_own
  ON public.moments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = moments.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photos_select_own
  ON public.photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = photos.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photos_insert_own
  ON public.photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = photos.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photos_update_own
  ON public.photos
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = photos.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = photos.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY photos_delete_own
  ON public.photos
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = photos.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants: authenticated can use tables; anon has no table privileges.
-- service_role bypasses RLS (server only).
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.users FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.experiences FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.places FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.moments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.photos FROM PUBLIC, anon;

GRANT USAGE ON TYPE public.experience_status TO authenticated;
GRANT USAGE ON TYPE public.experience_visibility TO authenticated;
GRANT USAGE ON TYPE public.location_source TO authenticated;
GRANT USAGE ON TYPE public.photo_date_source TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.moments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.photos TO authenticated;
