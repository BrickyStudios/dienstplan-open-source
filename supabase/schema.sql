-- Nurvo Supabase Schema
-- Ausführen in: Supabase Dashboard > SQL Editor

-- Träger / Organisationen
create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Einrichtungen / Standorte
create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references carriers(id),
  name text not null,
  city text not null,
  address text,
  beds integer default 0,
  created_at timestamptz default now()
);

-- Stationen innerhalb einer Einrichtung
create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id) on delete cascade,
  name text not null,
  care_type text, -- z.B. Geriatrie, Demenz, Palliativ, Intensiv
  ppbv_min_staff integer default 3,
  created_at timestamptz default now()
);

-- Mitarbeiter
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id),
  station_id uuid references stations(id),
  name text not null,
  role text not null check (role in ('Pflegefachkraft', 'Pflegehilfskraft', 'Stationsleitung', 'Springer', 'Verwaltung')),
  email text unique,
  phone text,
  is_springer boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

-- Schichten
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references stations(id),
  facility_id uuid references facilities(id),
  date date not null,
  shift_type text not null check (shift_type in ('Frühschicht', 'Spätschicht', 'Nachtschicht')),
  start_time time not null,
  end_time time not null,
  required_staff integer not null,
  ppbv_status text default 'ok' check (ppbv_status in ('ok', 'warning', 'violation')),
  created_at timestamptz default now()
);

-- Schichtbesetzung (wer macht welche Schicht)
create table if not exists shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete cascade,
  staff_id uuid references staff(id),
  status text default 'confirmed' check (status in ('planned', 'confirmed', 'cancelled', 'sick')),
  is_springer boolean default false,
  created_at timestamptz default now(),
  unique(shift_id, staff_id)
);

-- Zertifikate & Qualifikationen
create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  cert_type text not null, -- z.B. "Hygienepass", "Wundmanagement", "MDK-Qualifikation"
  issued_at date not null,
  expires_at date not null,
  is_required boolean default true,
  document_url text,
  created_at timestamptz default now()
);

-- Burnout-Risiko-Snapshots (berechnet täglich durch KI)
create table if not exists burnout_snapshots (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete cascade,
  snapshot_date date not null,
  risk_score integer not null check (risk_score between 0 and 100),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  night_shifts_30d integer default 0,
  overtime_hours_30d numeric default 0,
  break_violations_30d integer default 0,
  consecutive_days integer default 0,
  created_at timestamptz default now()
);

-- Springer-Pool-Anfragen (trägerintern)
create table if not exists springer_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_facility_id uuid references facilities(id),
  shift_id uuid references shifts(id),
  required_qualification text,
  status text default 'open' check (status in ('open', 'matched', 'confirmed', 'declined', 'cancelled')),
  matched_staff_id uuid references staff(id),
  offering_facility_id uuid references facilities(id),
  notes text,
  created_at timestamptz default now()
);

-- PPBV-Compliance-Reports
create table if not exists compliance_reports (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references facilities(id),
  period_start date not null,
  period_end date not null,
  total_shifts integer,
  compliant_shifts integer,
  violation_shifts integer,
  compliance_rate numeric,
  generated_at timestamptz default now()
);

-- Row Level Security (RLS) aktivieren
alter table carriers enable row level security;
alter table facilities enable row level security;
alter table stations enable row level security;
alter table staff enable row level security;
alter table shifts enable row level security;
alter table shift_assignments enable row level security;
alter table certificates enable row level security;
alter table burnout_snapshots enable row level security;
alter table springer_requests enable row level security;
alter table compliance_reports enable row level security;

-- Beispiel-Indexe für Performance
create index if not exists idx_shifts_date on shifts(date);
create index if not exists idx_shifts_facility on shifts(facility_id);
create index if not exists idx_burnout_staff on burnout_snapshots(staff_id, snapshot_date desc);
create index if not exists idx_certs_expires on certificates(expires_at);
create index if not exists idx_certs_staff on certificates(staff_id);
create index if not exists idx_assignments_shift on shift_assignments(shift_id);
create index if not exists idx_springer_status on springer_requests(status);

-- ============================================
-- Auth: User-Profile-Tabelle (Auth-System)
-- ============================================
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('leitung', 'mitarbeiter')),
  facility text,
  station_id uuid references stations(id),
  staff_id uuid references staff(id),
  avatar_url text,
  created_at timestamptz default now()
);

alter table user_profiles enable row level security;

-- Jeder sieht nur sein eigenes Profil
create policy "Eigenes Profil lesen" on user_profiles
  for select using (auth.uid() = id);

create policy "Eigenes Profil bearbeiten" on user_profiles
  for update using (auth.uid() = id);

create policy "Profil erstellen" on user_profiles
  for insert with check (auth.uid() = id);

-- Urlaubsanträge
create table if not exists vacation_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references user_profiles(id) on delete cascade,
  facility_id uuid references facilities(id),
  from_date date not null,
  to_date date not null,
  days integer not null,
  reason text,
  note text,
  status text default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references user_profiles(id),
  review_note text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table vacation_requests enable row level security;

create policy "Mitarbeiter sehen eigene Anträge" on vacation_requests
  for select using (auth.uid() = staff_id);

create policy "Mitarbeiter stellen Anträge" on vacation_requests
  for insert with check (auth.uid() = staff_id);

create index if not exists idx_vacation_status on vacation_requests(status);
create index if not exists idx_vacation_staff on vacation_requests(staff_id);

-- ============================================
-- Invite Codes (für kontrollierten Zugang)
-- ============================================
create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  role text not null check (role in ('leitung', 'mitarbeiter', 'admin', 'demo')),
  facility_id uuid references facilities(id) on delete cascade,
  facility_name text not null,
  created_by text not null,       -- Dev-Admin Name
  used boolean default false,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

alter table invite_codes enable row level security;

-- Codes werden AUSSCHLIESSLICH serverseitig gelesen/eingelöst (service_role umgeht RLS):
-- app/api/invite/validate + app/api/invite/redeem. KEINE public-select-Policy — sonst wäre
-- die Tabelle über den Anon-Key world-readable (Code-Enumeration + Preset-PII-Leak).
-- Siehe Migration 20260722_invite_codes_drop_public_select.sql.

-- Index für schnelles Code-Lookup
create index if not exists idx_invite_code on invite_codes(code);
create index if not exists idx_invite_facility on invite_codes(facility_id);

-- Spalten die nachträglich per Migration hinzugefügt wurden (20260520):
-- alter table invite_codes add column if not exists preset_name text;
-- alter table invite_codes add column if not exists preset_station text;
-- alter table invite_codes add column if not exists preset_station_secondary text;
-- alter table invite_codes add column if not exists preset_job_type text;
-- alter table invite_codes add column if not exists preset_max_hours integer;
-- alter table invite_codes add column if not exists preset_hourly_rate numeric;
-- alter table invite_codes add column if not exists preset_minijob_buffer integer default 15;
-- alter table invite_codes add column if not exists invited_email text;

-- ============================================
-- Dev-Admin Tabelle
-- ============================================
create table if not exists nurvo_admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  added_by text,
  created_at timestamptz default now()
);

-- Kein RLS nötig — wird nur via service_role gelesen
-- Ersten Admin manuell einfügen (einmalig in SQL Editor):
-- INSERT INTO nurvo_admins (name, email, added_by)
-- VALUES ('Vorname Nachname', 'admin@deine-praxis.de', 'system');

-- ============================================
-- Check-in Tokens (Tamper-Proof Offline)
-- ============================================
-- Server stellt Token vor Offline-Schicht aus.
-- token.issued_at ist der frühestmögliche check_in-Zeitpunkt.
-- Einmal verwendet → used_at gesetzt, Token ungültig.
create table if not exists checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  facility text not null,
  token text not null unique default gen_random_uuid()::text,
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '28 hours'),
  created_at timestamptz default now()
);

alter table checkin_tokens enable row level security;
create index if not exists idx_checkin_tokens_user on checkin_tokens(user_id, expires_at desc);
create index if not exists idx_checkin_tokens_token on checkin_tokens(token);

-- ============================================
-- Schicht-Schwierigkeitsbewertungen
-- ============================================
-- Mitarbeiter bewerten nach der Schicht (1–5).
-- Algorithmus lernt welche Tage/Stationen systematisch schwerer sind.
create table if not exists shift_difficulty_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  facility text not null,
  station text,
  shift_date date not null,
  shift_type text,
  rating integer not null check (rating between 1 and 5),
  note text,
  time_entry_id uuid,
  rated_at timestamptz not null default now()
);

alter table shift_difficulty_ratings enable row level security;
create index if not exists idx_difficulty_facility_date on shift_difficulty_ratings(facility, shift_date desc);
create index if not exists idx_difficulty_user on shift_difficulty_ratings(user_id, rated_at desc);

-- ============================================
-- time_entries RLS
-- ============================================
-- Sicherheitsmodell: API nutzt service_role (umgeht RLS).
-- RLS ist zweite Sicherheitslinie falls anon key direkt genutzt wird.
-- Mitarbeiter: nur INSERT, kein SELECT/UPDATE/DELETE nach Submit.
-- Leitung: Vollzugriff auf eigene Facility.
-- (Policies müssen facility-Matching über user_profiles lösen — via API enforced)
alter table time_entries enable row level security;

-- ============================================
-- Springer-System
-- ============================================

-- Krankmeldungen (von Mitarbeiter oder Leitung eingetragen)
create table if not exists sick_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null,
  sick_user_id uuid not null,
  sick_staff_name text not null,
  facility_name text not null,
  station text,
  sick_date date not null,
  shift_type text,
  note text,
  status text default 'open' check (status in ('open', 'covered', 'uncovered', 'cancelled')),
  reported_by_leitung boolean default false,
  created_at timestamptz default now()
);
alter table sick_reports enable row level security;
create index if not exists idx_sick_reports_facility on sick_reports(facility_name, sick_date desc);
create index if not exists idx_sick_reports_status on sick_reports(status);

-- Verfügbarkeiten (Mitarbeiter markieren sich als verfügbar für Zusatzschichten)
create table if not exists availability_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  staff_name text not null,
  facility_name text not null,
  available_date date not null,
  shift_type text,
  note text,
  created_at timestamptz default now(),
  unique(user_id, available_date, coalesce(shift_type, ''))
);
alter table availability_entries enable row level security;
create index if not exists idx_availability_facility on availability_entries(facility_name, available_date);

-- Bereitschaftsdienst (Leitung plant On-Call-Dienste)
create table if not exists on_call_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  staff_name text not null,
  facility_name text not null,
  on_call_date date not null,
  shift_type text,
  created_at timestamptz default now()
);
alter table on_call_entries enable row level security;
create index if not exists idx_on_call_facility on on_call_entries(facility_name, on_call_date);

-- Springer-Kontaktprotokoll (wer wurde kontaktiert, mit welchem Ergebnis)
create table if not exists springer_contacts (
  id uuid primary key default gen_random_uuid(),
  sick_report_id uuid references sick_reports(id) on delete cascade,
  contacted_staff_name text not null,
  contacted_user_id uuid,
  contact_reason text not null check (contact_reason in ('on_call', 'available', 'contactable')),
  contact_order integer not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined', 'no_response')),
  contacted_at timestamptz default now(),
  responded_at timestamptz,
  response_note text
);
alter table springer_contacts enable row level security;
create index if not exists idx_springer_contacts_report on springer_contacts(sick_report_id);

-- ============================================
-- Rollen-Erweiterung (Migrations für bestehende Tabellen)
-- ============================================
-- Einmalig im SQL-Editor ausführen:
-- alter table facility_settings add column if not exists employee_sick_reporting_enabled boolean default true;
-- alter table user_profiles add column if not exists department text;
-- alter table user_profiles add column if not exists work_type text default 'shift';
-- alter table facility_staff add column if not exists department text;
-- alter table facility_staff add column if not exists work_type text default 'shift';
-- alter table facility_staff add column if not exists phone text;
-- alter table facility_staff add column if not exists user_id uuid;
