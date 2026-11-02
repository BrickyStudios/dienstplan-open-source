-- Dienstpläne je Bereich (Ärztinnen/Ärzte, Leitung, sonstige Funktionsbereiche).
--
-- Bewusst GETRENNT von der "shifts"-Tabelle (Stations-Schichtplan), damit der
-- bestehende Stations-Scheduler unberührt bleibt — kein category-Filter in jeder
-- Stations-Query, null Regressionsrisiko. Mitarbeiter-Zuordnung läuft hier über
-- den freien Namen (bereich_shift_assignments.staff_name), damit auch Ärzte und
-- Leitungskräfte (nicht nur role=mitarbeiter) eingeplant werden können.
--
-- Zugriff erfolgt — wie bei den übrigen bereich_*-Tabellen — über service_role;
-- RLS ist aktiv (Default-Deny für anon).

-- ── Schichten je Bereich ──────────────────────────────────────────────────────
create table if not exists bereich_shifts (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  date date not null,
  start_time text,
  end_time text,
  label text,                                   -- freie Bezeichnung, z.B. "Visite", "Bereitschaft"
  notes text,
  created_at timestamptz default now()
);
create index if not exists bereich_shifts_facility_date on bereich_shifts(facility_name, date);
create index if not exists bereich_shifts_bereich_date on bereich_shifts(bereich_id, date);

-- ── Mitarbeiter-Zuordnung je Bereichs-Schicht ─────────────────────────────────
create table if not exists bereich_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  shift_id uuid not null references bereich_shifts(id) on delete cascade,
  user_id uuid,                                 -- optional; Zuordnung primär per Name
  staff_name text not null,
  created_at timestamptz default now(),
  unique(shift_id, staff_name)
);
create index if not exists bereich_shift_assignments_shift on bereich_shift_assignments(shift_id);
create index if not exists bereich_shift_assignments_facility on bereich_shift_assignments(facility_name);

-- RLS aktivieren (Zugriff läuft wie bei den übrigen Tabellen über service_role)
alter table bereich_shifts enable row level security;
alter table bereich_shift_assignments enable row level security;
