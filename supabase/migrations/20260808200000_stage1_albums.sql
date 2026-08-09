-- Stage 1 evolution: hierarchical Albums (folders) inside Experiences.
-- Compatible with existing Moments/Photos — does not drop or rewrite Moment rows.
-- Local validation only — do not push to remote without explicit approval.

-- ---------------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------------

CREATE TABLE public.albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.experiences (id) ON DELETE CASCADE,
  parent_album_id uuid,
  name text NOT NULL,
  description text,
  cover_photo_id uuid,
  position integer NOT NULL,
  -- Lineage from Stage 1 Moments used as initial root albums (nullable).
  source_moment_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT albums_id_experience_unique UNIQUE (id, experience_id),
  CONSTRAINT albums_name_nonempty CHECK (char_length(trim(name)) > 0),
  CONSTRAINT albums_position_positive CHECK (position >= 1),
  CONSTRAINT albums_parent_not_self
    CHECK (parent_album_id IS NULL OR parent_album_id <> id),
  CONSTRAINT albums_sibling_position_unique
    UNIQUE NULLS NOT DISTINCT (experience_id, parent_album_id, position),
  CONSTRAINT albums_parent_same_experience_fkey
    FOREIGN KEY (parent_album_id, experience_id)
    REFERENCES public.albums (id, experience_id),
  CONSTRAINT albums_source_moment_fkey
    FOREIGN KEY (source_moment_id)
    REFERENCES public.moments (id)
    ON DELETE SET NULL
);

CREATE INDEX albums_experience_parent_idx
  ON public.albums (experience_id, parent_album_id);

CREATE INDEX albums_experience_id_idx
  ON public.albums (experience_id);

CREATE TRIGGER albums_set_updated_at
  BEFORE UPDATE ON public.albums
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Naming helper for Moment → Album backfill / sync
-- Does not invent place names; avoids a literal "Desconhecido" folder.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.album_name_from_moment(
  moment_title text,
  moment_position integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text := nullif(btrim(COALESCE(moment_title, '')), '');
BEGIN
  IF cleaned IS NULL THEN
    RETURN 'Álbum ' || moment_position::text;
  END IF;
  IF lower(cleaned) IN ('desconhecido', 'unknown') THEN
    RETURN 'Álbum ' || moment_position::text;
  END IF;
  RETURN cleaned;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cycle prevention for album hierarchy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.albums_prevent_parent_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cursor_id uuid;
BEGIN
  IF NEW.parent_album_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_album_id = NEW.id THEN
    RAISE EXCEPTION 'album cannot be its own parent';
  END IF;

  cursor_id := NEW.parent_album_id;
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'album parent cycle detected';
    END IF;
    SELECT a.parent_album_id
      INTO cursor_id
    FROM public.albums AS a
    WHERE a.id = cursor_id
      AND a.experience_id = NEW.experience_id;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER albums_prevent_parent_cycle
  BEFORE INSERT OR UPDATE OF parent_album_id, experience_id
  ON public.albums
  FOR EACH ROW
  EXECUTE PROCEDURE public.albums_prevent_parent_cycle();

-- ---------------------------------------------------------------------------
-- photos: optional album membership (filled for existing rows below)
-- moment_id remains the Stage 1 organization key.
-- ---------------------------------------------------------------------------

ALTER TABLE public.photos
  ADD COLUMN album_id uuid,
  ADD COLUMN position_in_album integer;

ALTER TABLE public.photos
  ADD CONSTRAINT photos_album_position_consistent
    CHECK (
      (album_id IS NULL AND position_in_album IS NULL)
      OR
      (album_id IS NOT NULL AND position_in_album IS NOT NULL AND position_in_album >= 1)
    );

-- ---------------------------------------------------------------------------
-- Backfill: one root Album per existing Moment; attach Photos.
-- ---------------------------------------------------------------------------

INSERT INTO public.albums (
  experience_id,
  parent_album_id,
  name,
  description,
  cover_photo_id,
  position,
  source_moment_id
)
SELECT
  m.experience_id,
  NULL,
  public.album_name_from_moment(m.title, m.position),
  NULL,
  NULL,
  m.position,
  m.id
FROM public.moments AS m
ORDER BY m.experience_id, m.position;

UPDATE public.photos AS p
SET
  album_id = a.id,
  position_in_album = p.position_in_moment
FROM public.albums AS a
WHERE a.source_moment_id = p.moment_id
  AND p.album_id IS NULL;

-- ---------------------------------------------------------------------------
-- FKs that depend on backfill / photos existing
-- ---------------------------------------------------------------------------

ALTER TABLE public.photos
  ADD CONSTRAINT photos_album_same_experience_fkey
  FOREIGN KEY (album_id, experience_id)
  REFERENCES public.albums (id, experience_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX photos_album_position_unique
  ON public.photos (album_id, position_in_album)
  WHERE album_id IS NOT NULL;

CREATE INDEX photos_album_id_idx
  ON public.photos (album_id)
  WHERE album_id IS NOT NULL;

ALTER TABLE public.albums
  ADD CONSTRAINT albums_cover_photo_same_experience_fkey
  FOREIGN KEY (cover_photo_id, experience_id)
  REFERENCES public.photos (id, experience_id)
  DEFERRABLE INITIALLY DEFERRED;

-- Clear album covers when a photo is deleted (experiences cover already handled).
CREATE OR REPLACE FUNCTION public.clear_cover_on_photo_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.experiences
  SET cover_photo_id = NULL
  WHERE cover_photo_id = OLD.id
    AND id = OLD.experience_id;

  UPDATE public.albums
  SET cover_photo_id = NULL
  WHERE cover_photo_id = OLD.id
    AND experience_id = OLD.experience_id;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- Keep new Moments/Photos in sync with Albums (import RPC unchanged).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.albums_create_from_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  album_position integer := NEW.position;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.albums AS a
    WHERE a.experience_id = NEW.experience_id
      AND a.parent_album_id IS NULL
      AND a.position = album_position
  ) THEN
    SELECT COALESCE(MAX(a.position), 0) + 1
      INTO album_position
    FROM public.albums AS a
    WHERE a.experience_id = NEW.experience_id
      AND a.parent_album_id IS NULL;
  END IF;

  INSERT INTO public.albums (
    experience_id,
    parent_album_id,
    name,
    position,
    source_moment_id
  ) VALUES (
    NEW.experience_id,
    NULL,
    public.album_name_from_moment(NEW.title, NEW.position),
    album_position,
    NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER moments_create_root_album
  AFTER INSERT ON public.moments
  FOR EACH ROW
  EXECUTE PROCEDURE public.albums_create_from_moment();

CREATE OR REPLACE FUNCTION public.photos_default_album_from_moment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  mapped_album_id uuid;
BEGIN
  IF NEW.album_id IS NOT NULL THEN
    IF NEW.position_in_album IS NULL THEN
      NEW.position_in_album := NEW.position_in_moment;
    END IF;
    RETURN NEW;
  END IF;

  SELECT a.id
    INTO mapped_album_id
  FROM public.albums AS a
  WHERE a.source_moment_id = NEW.moment_id
    AND a.experience_id = NEW.experience_id;

  IF mapped_album_id IS NULL THEN
    RAISE EXCEPTION
      'no album mapped for moment % in experience %',
      NEW.moment_id,
      NEW.experience_id;
  END IF;

  NEW.album_id := mapped_album_id;
  NEW.position_in_album := COALESCE(NEW.position_in_album, NEW.position_in_moment);
  RETURN NEW;
END;
$$;

CREATE TRIGGER photos_default_album_from_moment
  BEFORE INSERT ON public.photos
  FOR EACH ROW
  EXECUTE PROCEDURE public.photos_default_album_from_moment();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY albums_select_own
  ON public.albums
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = albums.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

-- Parent-same-experience is enforced by the composite FK; policies must not
-- SELECT albums (that recurses under RLS).
CREATE POLICY albums_insert_own
  ON public.albums
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = albums.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY albums_update_own
  ON public.albums
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = albums.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = albums.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY albums_delete_own
  ON public.albums
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.experiences e
      WHERE e.id = albums.experience_id
        AND e.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.albums FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.albums TO authenticated;
