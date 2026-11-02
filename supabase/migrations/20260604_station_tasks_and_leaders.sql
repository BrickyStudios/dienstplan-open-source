-- Aufgaben & Leiter je Station — strukturgleich zum Bereichs-System (20260602/20260603),
-- nur an Stationen (Zuordnung läuft über user_profiles.station / station_secondary).
-- 20260604
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Ohne diese Tabellen ist das Stations-Aufgaben-Feature inert; Routen degradieren bei
-- 42P01 sauber zu leeren Listen.

-- ── Stations-Leiter (Leitung ernennt zugewiesene Mitarbeiter, mehrere möglich) ──
create table if not exists station_leaders (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  station_name text not null,
  user_id uuid not null,
  staff_name text not null,
  created_at timestamptz default now(),
  unique(station_name, user_id, facility_name)
);
create index if not exists station_leaders_facility on station_leaders(facility_name);
create index if not exists station_leaders_user on station_leaders(user_id);

-- ── Aufgaben je Station ─────────────────────────────────────────────────────────
create table if not exists station_tasks (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  station_name text not null,
  title text not null,
  room text,
  building text,
  bed text,
  action text not null default 'reinigen',   -- reinigen | austauschen | desinfizieren | reparieren | sonstiges
  priority text not null default 'normal'
    check (priority in ('normal', 'hoch')),
  status text not null default 'open'
    check (status in ('open', 'done')),
  created_by_name text,
  done_by_name text,
  created_at timestamptz default now(),
  done_at timestamptz
);
create index if not exists station_tasks_station_status on station_tasks(facility_name, station_name, status);

alter table station_leaders enable row level security;
alter table station_tasks enable row level security;
