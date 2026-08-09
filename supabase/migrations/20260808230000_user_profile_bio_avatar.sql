-- Profile header: bio text + avatar photo (from owner's photo library).

ALTER TABLE public.users
  ADD COLUMN bio text,
  ADD COLUMN avatar_photo_id uuid;

ALTER TABLE public.users
  ADD CONSTRAINT users_bio_length
  CHECK (bio IS NULL OR char_length(bio) <= 280);

ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_photo_id_fkey
  FOREIGN KEY (avatar_photo_id)
  REFERENCES public.photos (id)
  ON DELETE SET NULL;

CREATE INDEX users_avatar_photo_id_idx
  ON public.users (avatar_photo_id)
  WHERE avatar_photo_id IS NOT NULL;
