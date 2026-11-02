-- Personalbedarf je Station/Schichtart aus dem Onboarding. JSON auf facility_settings,
-- damit generate-shifts daraus planned_staff je erzeugter Schicht setzt (statt hart 0).
-- Defensiv (IF NOT EXISTS) → bis zur Ausführung fällt generate-shifts auf den Default zurück.
alter table public.facility_settings
  add column if not exists shift_demand jsonb;

comment on column public.facility_settings.shift_demand is
  'Personalbedarf je Station/Schichtart: { "<Station>": { "frueh": n, "spaet": n, "nacht": n } }. Quelle: Onboarding-Bedarf-Schritt.';
