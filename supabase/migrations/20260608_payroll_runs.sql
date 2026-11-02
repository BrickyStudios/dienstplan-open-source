-- Lohnabrechnungs-Läufe + Posten. Bisher lagen die CREATE-Statements nur als Kommentar in
-- app/api/leitung/lohnabrechnung/route.ts — ohne diese Tabellen schlägt das Generieren mit
-- "Tabellen fehlen" fehl und Mitarbeiter sehen keine Abrechnung.
-- 20260608
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Routen degradieren bis dahin sauber (42P01 → leere Liste / Hinweis).

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  month smallint not null check (month between 1 and 12),
  year smallint not null,
  status text not null default 'draft',
  generated_by text,
  created_at timestamptz default now(),
  unique(facility_name, month, year)
);

create table if not exists payroll_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references payroll_runs(id) on delete cascade,
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,
  job_type text,
  tax_class smallint default 1,
  hours_worked numeric not null default 0,
  hourly_rate numeric,
  gross_pay numeric not null default 0,
  kv_employee numeric not null default 0,
  pv_employee numeric not null default 0,
  rv_employee numeric not null default 0,
  av_employee numeric not null default 0,
  lohnsteuer numeric not null default 0,
  kirchensteuer numeric not null default 0,
  soli numeric not null default 0,
  net_pay numeric not null default 0,
  notes text,
  created_at timestamptz default now()
);

create index if not exists payroll_entries_run on payroll_entries(run_id);
create index if not exists payroll_entries_staff on payroll_entries(facility_name, staff_name);

alter table payroll_runs enable row level security;
alter table payroll_entries enable row level security;

notify pgrst, 'reload schema';
