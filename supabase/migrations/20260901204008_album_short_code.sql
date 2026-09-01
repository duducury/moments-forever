-- Short, NFC-tag-friendly links for albums (e.g. moments-forever-web.vercel.app/a/x7k9m2q
-- instead of the full /perfil/{slug}/album/{uuid} path — small NFC tags like
-- NTAG213 only hold ~137 usable bytes, well under a full album URL).

CREATE OR REPLACE FUNCTION public.generate_short_code(len integer DEFAULT 7)
RETURNS text
LANGUAGE sql
AS $$
  SELECT string_agg(
    substr('abcdefghijklmnopqrstuvwxyz0123456789', (random() * 35)::int + 1, 1),
    ''
  )
  FROM generate_series(1, len);
$$;

ALTER TABLE public.albums
  ADD COLUMN short_code text;

CREATE OR REPLACE FUNCTION public.set_album_short_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts integer := 0;
BEGIN
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    candidate := public.generate_short_code(7);
    attempts := attempts + 1;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.albums WHERE short_code = candidate
    ) OR attempts > 25;
  END LOOP;

  NEW.short_code := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER albums_set_short_code
  BEFORE INSERT ON public.albums
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_album_short_code();

-- Backfill every existing album, retrying per-row on collision.
DO $$
DECLARE
  rec RECORD;
  candidate text;
  attempts integer;
BEGIN
  FOR rec IN SELECT id FROM public.albums WHERE short_code IS NULL LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_short_code(7);
      attempts := attempts + 1;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.albums WHERE short_code = candidate
      ) OR attempts > 25;
    END LOOP;
    UPDATE public.albums SET short_code = candidate WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE public.albums
  ALTER COLUMN short_code SET NOT NULL;

ALTER TABLE public.albums
  ADD CONSTRAINT albums_short_code_format
  CHECK (short_code ~ '^[a-z0-9]{6,8}$');

ALTER TABLE public.albums
  ADD CONSTRAINT albums_short_code_unique UNIQUE (short_code);
