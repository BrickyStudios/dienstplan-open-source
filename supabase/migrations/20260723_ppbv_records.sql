-- PPBV-Nachweise: eingefrorene Monats-Snapshots je Station als revisionssicherer Beleg der
-- Pflegepersonaluntergrenzen-Erfüllung. Die Live-Ansicht rechnet immer frisch aus `shifts`;
-- diese Tabelle "führt die Nachweise mit" = archiviert den Stand eines abgeschlossenen Monats,
-- damit ein späteres Ändern/Löschen von Schichten den Beleg nicht rückwirkend verfälscht.
-- 20260723
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Defensiv (IF NOT EXISTS): bis zur Ausführung degradiert die Route sauber (42P01 →
-- Live-Berechnung ohne Archiv, Tab bleibt voll nutzbar, nur ohne persistente Snapshots).

create table if not exists public.ppbv_records (
  id                 uuid primary key default gen_random_uuid(),
  facility_name      text not null,
  station            text not null,
  year               smallint not null,
  month              smallint not null check (month between 1 and 12),
  shifts_count       integer not null default 0,   -- gewertete Schichten (planned_staff > 0)
  planned_sum        integer not null default 0,   -- Summe Soll-Personal
  actual_sum         integer not null default 0,   -- Summe Ist-Personal
  understaffed_count integer not null default 0,   -- Schichten mit Ist < Soll (Unterschreitungen)
  fulfilled_shifts   integer not null default 0,   -- Schichten mit Ist >= Soll
  compliance_pct     integer not null default 0,   -- round(actual/planned*100)
  shift_quote_pct    integer not null default 0,   -- round(fulfilled/shifts*100) = PPBV-Schichtquote
  by_type            jsonb,                         -- Aufschlüsselung je Schichtart (frueh/spaet/nacht)
  generated_at       timestamptz not null default now(),
  generated_by       text,
  unique (facility_name, station, year, month)
);

create index if not exists ppbv_records_facility_period
  on public.ppbv_records (facility_name, year, month);

alter table public.ppbv_records enable row level security;

notify pgrst, 'reload schema';
