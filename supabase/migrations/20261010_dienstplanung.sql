-- Dienstplanung je Person: Schichtdienst, Tagdienst oder Gleitzeit (10.10.2026)
--
-- Bis hierher plante Nurvo jede Person rotierend in Früh, Spät und Nacht, auch am Wochenende.
-- Eine Stationsleitung bekam dieselben Dienste wie ihr Team. Leitungen arbeiten aber meist
-- Montag bis Freitag tagsüber, manche in Gleitzeit.
--
-- Werte (lib/scheduling/dienstplanung.ts):
--   'schicht'   — Schichtdienst wie bisher.
--   'tagdienst' — nur Montag bis Freitag, keine Spät- und keine Nachtschicht.
--   'selbst'    — der Planer setzt die Person nie ein; sie trägt ihre Zeiten selbst ein.
--   NULL        — automatisch: Leitungsberufe (Stationsleitung, PDL, …) Tagdienst, sonst Schicht.
--
-- Ohne diese Datei gilt die Automatik weiter; nur die Auswahl unter Mitarbeiter → Vertrag
-- lässt sich nicht speichern.

alter table public.facility_staff
  add column if not exists dienstplanung text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'facility_staff_dienstplanung_check'
  ) then
    alter table public.facility_staff
      add constraint facility_staff_dienstplanung_check
      check (dienstplanung is null or dienstplanung in ('schicht', 'tagdienst', 'selbst'));
  end if;
end $$;

-- Prüfung: 1 Zeile "dienstplanung" = Spalte da.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'facility_staff' and column_name = 'dienstplanung';
