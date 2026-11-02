-- Individuelle Schichtzeiten je Station/Bereich (Overrides) + Bereiche wie Stationen planbar.
-- 20260725
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch.
-- Einmalig im Supabase SQL-Editor ausführen. Defensiv (IF NOT EXISTS) → bis zur
-- Ausführung fällt der Code auf die globalen Schichtzeiten zurück (planned_staff der
-- Bereiche bleibt bis dahin ungenutzt), nichts bricht.
--
-- Code-Referenzen:
--   components/OnboardingWizard.tsx (Onboarding-Schritte Stationen/Bereiche)
--   app/api/onboarding/complete/route.ts, app/api/onboarding/generate-shifts/route.ts

-- ── Pro Station/Bereich abweichende Start-/Endzeiten je Schichtart ────────────
-- Struktur: { "<Station|Bereich>": { "frueh": { "start": "06:00", "end": "14:00" }, ... } }
-- Fehlt ein Eintrag → globale Schichtzeit (shift_templates) gilt.
alter table public.facility_settings
  add column if not exists shift_time_overrides jsonb;

comment on column public.facility_settings.shift_time_overrides is
  'Abweichende Schichtzeiten je Station/Bereich: { "<Name>": { "frueh": {"start","end"}, "spaet": {...}, "nacht": {...} } }. Leer = globale shift_templates. Quelle: Onboarding.';

-- Hinweis: facility_settings.shift_demand (Migration 20260702) speichert jetzt auch
-- den Personalbedarf der BEREICHE (gleiche Struktur, Schlüssel = Bereichsname).
-- Kein Schemawechsel nötig.

-- ── Bereiche wie Stationen planen: Soll-Besetzung je Bereichs-Schicht ─────────
alter table public.bereich_shifts
  add column if not exists planned_staff integer not null default 0;

comment on column public.bereich_shifts.planned_staff is
  'Soll-Besetzung dieser Bereichs-Schicht (aus dem Onboarding-Bedarf). Analog shifts.planned_staff.';
