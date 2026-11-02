-- ═══════════════════════════════════════════════════════════════════════════════
-- Feature: Tages-Abruf (facility_oncall_days)
-- Leitung schaltet pro Tag EIN ob alle Mitarbeiter auf Abruf sind.
-- Kein pro-Mitarbeiter-Assignment — nur Flag pro Einrichtung+Datum.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists facility_oncall_days (
  facility_name text      not null,
  oncall_date   date      not null,
  enabled_by    uuid      references auth.users(id) on delete set null,
  note          text,
  created_at    timestamptz default now(),
  primary key (facility_name, oncall_date)
);

alter table facility_oncall_days enable row level security;

drop policy if exists "facility_oncall_days_isolation" on facility_oncall_days;
create policy "facility_oncall_days_isolation"
  on facility_oncall_days for all
  using (facility_name = get_my_facility())
  with check (facility_name = get_my_facility());

-- ═══════════════════════════════════════════════════════════════════════════════
-- Feature: Externe Dienste (external_agencies + external_agency_requests)
-- Pflegedienste / Mietdienste die bei Unterbesetzung kontaktiert werden.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists external_agencies (
  id            uuid primary key default gen_random_uuid(),
  facility_name text      not null,
  name          text      not null,
  email         text      not null,
  phone         text,
  notes         text,
  active        boolean   not null default true,
  created_at    timestamptz default now()
);

alter table external_agencies enable row level security;

drop policy if exists "external_agencies_isolation" on external_agencies;
create policy "external_agencies_isolation"
  on external_agencies for all
  using (facility_name = get_my_facility())
  with check (facility_name = get_my_facility());

create table if not exists external_agency_requests (
  id              uuid primary key default gen_random_uuid(),
  sick_report_id  uuid      not null references sick_reports(id) on delete cascade,
  agency_id       uuid      not null references external_agencies(id) on delete cascade,
  agency_name     text      not null,
  agency_email    text      not null,
  facility_name   text      not null,
  response_token  text      not null unique,  -- signed token für Magic-Link
  status          text      not null default 'sent'
                  check (status in ('sent','accepted','declined','expired')),
  responder_name  text,
  responder_phone text,
  responded_at    timestamptz,
  sent_at         timestamptz default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours')
);

alter table external_agency_requests enable row level security;

-- Antworten kommen ohne Auth (Public Magic-Link) — daher public select via token
drop policy if exists "external_agency_requests_leitung" on external_agency_requests;
create policy "external_agency_requests_leitung"
  on external_agency_requests for all
  using (facility_name = get_my_facility())
  with check (facility_name = get_my_facility());

-- HIER STAND EIN SICHERHEITSLOCH, UND ES WIRD NICHT WIEDER ANGELEGT.
--
-- Bis zum 16.09.2026 stand hier:
--
--     create policy "external_agency_requests_public_token"
--       on external_agency_requests for select
--       using (true);
--
-- `using (true)` ohne TO-Klausel gilt für `public`, und das schliesst `anon` ein.
-- Der anon-Schlüssel steht im JavaScript jeder Seite. Damit hing die vollständige
-- Kundenliste offen, dazu Namen und Telefonnummern Dritter und der Magic-Link-Token
-- JEDER offenen Personalanfrage. Wer einen Token liest, kann per
-- POST /api/external/respond eine Krankmeldung als besetzt quittieren: die Leitung
-- sieht eine gedeckte Schicht, und es kommt niemand. Befund 1 der Sicherheitsprüfung
-- vom 14.09.2026; 20260915_external_agency_requests_zumachen.sql macht es zu.
--
-- Die Anwendung braucht die Policy nicht: /api/external/respond liest über
-- lib/admin-client.ts mit dem service_role-Schlüssel und umgeht RLS ohnehin. Der
-- Magic-Link funktioniert unverändert.
--
-- Das `drop` bleibt stehen, damit die Sammeldatei (npm run sql) das Loch auch dann
-- schliesst, wenn sie auf einer Datenbank läuft, auf der die alte Fassung schon lief.
drop policy if exists "external_agency_requests_public_token" on external_agency_requests;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Feature: Product Analytics (analytics_events)
-- Lightweight event-tracking in eigener Supabase-DB (DSGVO-konform, Frankfurt).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists analytics_events (
  id            uuid primary key default gen_random_uuid(),
  facility_name text,
  user_id       uuid references auth.users(id) on delete set null,
  session_id    text,
  event_name    text      not null,
  page          text,
  properties    jsonb     default '{}',
  created_at    timestamptz default now()
);

-- Indices für Admin-Auswertung
create index if not exists analytics_events_created_at_idx on analytics_events(created_at desc);
create index if not exists analytics_events_event_name_idx on analytics_events(event_name);
create index if not exists analytics_events_facility_idx   on analytics_events(facility_name);

alter table analytics_events enable row level security;

-- Jeder eingeloggte User darf seine eigenen Events schreiben
drop policy if exists "analytics_events_insert" on analytics_events;
create policy "analytics_events_insert"
  on analytics_events for insert
  with check (auth.uid() = user_id or user_id is null);

-- Nur Admins dürfen lesen (geprüft in API-Route via service_role)
drop policy if exists "analytics_events_select_own" on analytics_events;
create policy "analytics_events_select_own"
  on analytics_events for select
  using (auth.uid() = user_id);
