-- ---------------------------------------------------------------------------
-- Trips created after 20261001100000 were stored as 'draft'/'private', so they
-- never showed on their owner's public profile (only the owner could see them;
-- an admin visiting the profile saw "0 viagens" for an account with trips).
--
-- Cause: the app sent status 'draft' / visibility 'private' explicitly in the
-- create_experience_from_import() payload, which overrides that function's own
-- 'published'/'public' fallback (the fallback only applies when the keys are
-- absent). The app now sends 'published'/'public' (packages/shared
-- buildCreateExperiencePayload).
--
-- This repeats the backfill of 20261001100000 for the trips created in
-- between: there is still no publish step or privacy switch anywhere in the
-- app, so every trip is meant to be shown on its owner's profile, which is
-- exactly what that migration materialised. Idempotent; touches nothing else
-- (no photos, albums, NFC tags or licences).
-- ---------------------------------------------------------------------------

UPDATE public.experiences
SET visibility = 'public', status = 'published'
WHERE visibility IS DISTINCT FROM 'public' OR status IS DISTINCT FROM 'published';
