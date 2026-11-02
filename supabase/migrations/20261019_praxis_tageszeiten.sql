-- Schichtzeiten je Wochentag (19.10.2026).
--
-- Warum: Eine Schicht hatte bisher an jedem Tag dieselbe Uhrzeit. Eine Praxis arbeitet aber
-- „Montag 7 bis 12, Dienstag 8 bis 13, Donnerstagnachmittag bis 19 Uhr". Das Onboarding liest
-- diese Zeiten jetzt aus einer Beschreibung oder aus dem hochgeladenen bisherigen Dienstplan
-- (PDF oder Foto, im Browser gelesen) und speichert die Abweichungen hier.
--
--   day_shift_times  {"1": {"frueh": {"start": "07:00", "end": "12:00"}},
--                     "4": {"spaet": {"start": "15:00", "end": "19:00"}}}
--                    0 = Sonntag … 6 = Samstag. Nur die Tage, die von der Schichtvorlage
--                    abweichen; an allen anderen gilt shift_templates wie bisher.
--
-- Der Schicht-Generator (app/api/onboarding/generate-shifts) nimmt diese Zeit vor der
-- Station-Abweichung (shift_time_overrides) und vor der Vorlage. Logik:
-- lib/scheduling/praxis-raster.ts (leseTagesZeiten, zeitFuerTag).
--
-- Ohne diese Datei läuft alles wie bisher: Der Code liest die Spalte tolerant, das
-- Onboarding meldet sie als „nicht gespeichert", und jede Schicht hat jeden Tag die Zeit
-- der Vorlage.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.

alter table public.facility_settings
  add column if not exists day_shift_times jsonb;

comment on column public.facility_settings.day_shift_times is
  'Wochentag (0=So..6=Sa) -> Schichtart -> {start,end}; abweichende Zeiten an diesem Tag, sonst gilt die Schichtvorlage. lib/scheduling/praxis-raster.ts';

-- PostgREST kennt neue Spalten erst nach dem Neuladen des Schemas.
notify pgrst, 'reload schema';

-- ── Prüfabfrage: muss eine Zeile zeigen ─────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'facility_settings'
   and column_name = 'day_shift_times';
