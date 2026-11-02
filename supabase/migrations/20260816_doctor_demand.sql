-- Ärztlicher Soll-Bedarf je Station/Schichtart aus dem Onboarding (nur Kliniken).
-- Gleiche Form wie facility_settings.shift_demand (Migration 20260702), aber getrennt:
-- Pflege-Soll steuert planned_staff der Stations-Schichten, der ärztliche Soll steuert den
-- Bereichs-Dienstplan „Ärztinnen & Ärzte" und die Debug-Befüllung (/debug).
-- Defensiv (IF NOT EXISTS) → bis zur Ausführung fällt das Onboarding still darauf zurück,
-- den Arzt-Bedarf nicht zu speichern.
alter table public.facility_settings
  add column if not exists doctor_demand jsonb;

comment on column public.facility_settings.doctor_demand is
  'Ärztlicher Bedarf je Station/Schichtart: { "<Station>": { "frueh": n, "spaet": n, "nacht": n } }. Quelle: Onboarding-Schritt „Stationen" (nur plan=klinik). 0 = kein ärztlicher Dienst in dieser Schicht.';
