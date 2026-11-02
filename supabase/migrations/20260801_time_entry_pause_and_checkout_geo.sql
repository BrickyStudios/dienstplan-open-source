-- Nachtrag: Spalten, die die Zeiterfassung seit dem Pause-Feature (Mai 2026) erwartet, die aber
-- nie als Migrationsdatei existierten — sie standen nur als Kommentar in app/api/zeiterfassung/route.ts.
-- Fehlen sie in der Datenbank, schlägt bereits das Laden des Eintrags beim Ausstempeln fehl
-- (PostgREST 42703) und der Abmelden-Button bricht ohne sichtbare Rückmeldung ab.
--
-- Alle Spalten sind nullable/defaulted → bestehende Einträge bleiben unverändert gültig.

-- Pause (ArbZG-Erfassung): paused_at = laufende Pause, total_pause_minutes = Summe abgezogener Pausen
alter table time_entries add column if not exists paused_at timestamptz;
alter table time_entries add column if not exists total_pause_minutes integer default 0;

-- Standortnachweis beim Abmelden (Gegenstück zu latitude/longitude/location_verified beim Anmelden)
alter table time_entries add column if not exists checkout_location_verified boolean default false;
alter table time_entries add column if not exists checkout_latitude double precision;
alter table time_entries add column if not exists checkout_longitude double precision;

comment on column time_entries.paused_at is
  'Beginn der aktuell laufenden Pause; NULL = keine Pause aktiv.';
comment on column time_entries.total_pause_minutes is
  'Summe aller Pausenminuten der Schicht — wird von duration_minutes abgezogen.';
