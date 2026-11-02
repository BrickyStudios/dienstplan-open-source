-- Lohn-/Vertragsfelder pro Mitarbeiter.
-- Ohne diese Spalten schlägt PATCH /api/leitung/staff fehl (PGRST204/42703) und der
-- eingestellte Stundenlohn sowie Steuer-/Minijob-Felder werden NICHT gespeichert.
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS hourly_rate numeric;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS minijob_buffer_pct integer NOT NULL DEFAULT 15;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS tax_class integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS church_tax boolean NOT NULL DEFAULT false;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS children_count integer NOT NULL DEFAULT 0;

-- Standard-Stundenlohn der Einrichtung (Basis-Setup aus dem Onboarding) — wird beim
-- Einladen/Anlegen neuer Mitarbeiter als Vorbelegung verwendet.
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_hourly_rate numeric;
