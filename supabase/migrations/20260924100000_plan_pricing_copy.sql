-- ---------------------------------------------------------------------------
-- Marketing copy for the public pricing table shown on the logged-out home
-- page. Lives on `plans` so the admin can edit it from /admin/planos (same
-- place the trip/photo/NFC limits already live) instead of it being
-- hardcoded in the frontend.
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans
  ADD COLUMN price_label text,
  ADD COLUMN price_note text NOT NULL DEFAULT 'pagamento único',
  ADD COLUMN highlight boolean NOT NULL DEFAULT false;

UPDATE public.plans SET price_label = 'US$ 8' WHERE name = 'BASIC';
UPDATE public.plans SET price_label = 'US$ 15', highlight = true WHERE name = 'PLUS';
UPDATE public.plans SET price_label = 'US$ 30' WHERE name = 'PREMIUM';
