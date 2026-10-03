-- ---------------------------------------------------------------------------
-- Where the album cover is "centered". The owner can drag the cover photo in
-- "Editar" so the subject isn't cropped out; the card/hero then use this
-- point as CSS object-position (0..100 % from the left / top, 50/50 = centre).
--
-- Kept in its own table instead of columns on albums on purpose: the app reads
-- it as an optional extra, so everything keeps working (covers just stay
-- centred) until this migration is applied, and no existing query changes.
-- ON DELETE CASCADE removes it with the album (and so with the trip/account).
-- ---------------------------------------------------------------------------

CREATE TABLE public.album_cover_focus (
  album_id uuid PRIMARY KEY REFERENCES public.albums (id) ON DELETE CASCADE,
  focus_x real NOT NULL DEFAULT 50 CHECK (focus_x >= 0 AND focus_x <= 100),
  focus_y real NOT NULL DEFAULT 50 CHECK (focus_y >= 0 AND focus_y <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.album_cover_focus ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the album can see its cover focus (the subquery runs under
-- the albums table's own RLS, so private trips stay private).
CREATE POLICY album_cover_focus_select
  ON public.album_cover_focus
  FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.albums a WHERE a.id = album_id));

-- Only the trip's owner can set / change / clear it.
CREATE POLICY album_cover_focus_insert_owner
  ON public.album_cover_focus
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.albums a
      JOIN public.experiences e ON e.id = a.experience_id
      WHERE a.id = album_id AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY album_cover_focus_update_owner
  ON public.album_cover_focus
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.albums a
      JOIN public.experiences e ON e.id = a.experience_id
      WHERE a.id = album_id AND e.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.albums a
      JOIN public.experiences e ON e.id = a.experience_id
      WHERE a.id = album_id AND e.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY album_cover_focus_delete_owner
  ON public.album_cover_focus
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.albums a
      JOIN public.experiences e ON e.id = a.experience_id
      WHERE a.id = album_id AND e.owner_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.album_cover_focus FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.album_cover_focus TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.album_cover_focus TO authenticated;

NOTIFY pgrst, 'reload schema';
