-- ---------------------------------------------------------------------------
-- Zoom of the album cover. The cover editor now lets the owner zoom the photo
-- (1 = the plain "cover" fit, up to 4x) around the focus point that was already
-- stored (focus_x / focus_y). Existing rows keep zoom 1, so every current cover
-- looks exactly as before. The app treats the column as optional: until this is
-- applied, covers keep their position and simply have no zoom.
-- ---------------------------------------------------------------------------

ALTER TABLE public.album_cover_focus
  ADD COLUMN IF NOT EXISTS focus_zoom real NOT NULL DEFAULT 1
  CHECK (focus_zoom >= 1 AND focus_zoom <= 4);

NOTIFY pgrst, 'reload schema';
