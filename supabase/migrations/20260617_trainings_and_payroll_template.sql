-- Schulungen (bezahlte/unbezahlte Trainings) + Teilnehmer, Lohn-Trainingsstunden
-- und Custom-Formatierung der Lohnabrechnung je Einrichtung.
-- Bis diese Migration läuft, sind beide Features inert:
--   * /schulungen + /api/leitung/trainings melden "tableMissing" (kein Crash)
--   * die Lohnabrechnung ignoriert Trainings-Stunden (Payroll bleibt unverändert)

-- ── Schulungen ───────────────────────────────────────────────────────────────
create table if not exists public.trainings (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  title text not null,
  date date not null,
  start_time text,            -- "HH:MM" (für bezahlte Trainings maßgeblich)
  end_time text,              -- "HH:MM"
  station text,               -- optionales Label aus der Stations-Schnellauswahl (NICHT maßgeblich)
  paid boolean not null default true,
  notes text,
  created_by text,
  created_at timestamptz default now()
);
alter table public.trainings enable row level security;
drop policy if exists "tenant_isolation" on public.trainings;
create policy "tenant_isolation" on public.trainings
  using (facility_name = public.get_my_facility());
create index if not exists idx_trainings_facility_date on public.trainings(facility_name, date);

-- Teilnehmer = maßgebliche Quelle dafür, wer bezahlt wird (Station ist nur Schnellauswahl).
create table if not exists public.training_attendees (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,   -- Payroll verknüpft über den Namen
  created_at timestamptz default now()
);
alter table public.training_attendees enable row level security;
drop policy if exists "tenant_isolation" on public.training_attendees;
create policy "tenant_isolation" on public.training_attendees
  using (facility_name = public.get_my_facility());
create index if not exists idx_training_attendees_training on public.training_attendees(training_id);

-- ── Lohn: Trainings-Stundenanteil je Posten sichtbar machen (defensiv eingelesen) ──
alter table public.payroll_entries add column if not exists training_hours numeric not null default 0;

-- ── Custom-Formatierung der Lohnabrechnung je Einrichtung ─────────────────────
-- JSON-Form: { companyName, address, footer, accent, columns: { sk, vertragsart, sv, steuer } }
alter table public.facility_settings add column if not exists payroll_template jsonb;
