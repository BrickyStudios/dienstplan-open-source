-- Digitale Signatur + Signatur-Pflicht für Aufgaben (Stationen + Bereiche).
-- Slice "Aufgaben" / Teil B1. Der bearbeitende Mitarbeiter bestätigt beim Erledigen einer
-- als signaturpflichtig markierten Aufgabe ("Hiermit bestätige ich, dass ich … ordnungsgemäß
-- erledigt habe."). Die Bestätigung wird mit Name + Zeitstempel + Bestätigungstext gespeichert,
-- damit die Leitung nicht nur sieht WER, sondern auch die unterschriebene Bestätigung hat.
-- 20260611
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch. Einmal im Supabase
-- SQL-Editor ausführen. Ohne diese Spalten bleibt das Signatur-Feature inert: die Routen
-- schreiben/lesen defensiv (42703 → Feld wird ignoriert), Aufgaben funktionieren unverändert.
--
-- Code-Referenzen: app/api/leitung/station-tasks, app/api/bereiche/tasks,
--   app/api/mein-station, app/api/mein-bereich, app/api/leitung/aufgaben-export,
--   components/StationTaskManager, components/BereicheManager, app/(app)/bereiche.

alter table station_tasks add column if not exists requires_signature boolean not null default false;
alter table station_tasks add column if not exists signed_at timestamptz;
alter table station_tasks add column if not exists signed_by_name text;
alter table station_tasks add column if not exists signature_text text;

alter table bereich_tasks add column if not exists requires_signature boolean not null default false;
alter table bereich_tasks add column if not exists signed_at timestamptz;
alter table bereich_tasks add column if not exists signed_by_name text;
alter table bereich_tasks add column if not exists signature_text text;

notify pgrst, 'reload schema';
