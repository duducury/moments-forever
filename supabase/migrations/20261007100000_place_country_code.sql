-- ---------------------------------------------------------------------------
-- places.country_code: the country a place is in, as ISO 3166-1 alpha-2.
--
-- The profile flags and the passport stamps used to be derived only from the
-- place *name* ("Tanzânia, Zanzibar"). A name that omits the country, or spells
-- it in a way nobody anticipated, produced no flag and no stamp even though the
-- photo showed on the map. The geocoder already returns the country code for
-- the photo's coordinates, so it is stored here and the name is only a fallback.
--
-- NULL = not resolved yet (the app fills it in lazily for existing rows).
-- No backfill is possible in SQL: it needs the geocoder / the place name rules.
-- ---------------------------------------------------------------------------

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS country_code text;

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_country_code_format;

ALTER TABLE public.places
  ADD CONSTRAINT places_country_code_format
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
