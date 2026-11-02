-- „Ich komme zu spät" und „Ich könnte kommen" (10.10.2026)
--
-- 1) Verspätung melden: Mitarbeitende tippen im Dashboard „Ich komme zu spät", die Meldung
--    geht an Leitung und Stationsleitung. Die Leitung kann das abschalten (Springer-Pool →
--    Meldungen aus der App); dann steht dort, dass man anrufen muss.
-- 2) Rückmeldung auf Notfall-Vorlagen: Eine Vorlage kann Freien und Bereitschaft den Knopf
--    „Ich könnte kommen" anbieten. Wer tippt, ist für den Tag als freiwillig verfügbar
--    eingetragen (availability_entries) und steht damit der Ausfall-Kaskade als Springer zur
--    Verfügung; die Leitung sieht die Rückmeldungen im Protokoll.
--
-- OHNE DIESE DATEI: Der Knopf „Ich komme zu spät" meldet „Migration fehlt", der Schalter
-- dafür lässt sich nicht speichern, und Notfall-Vorlagen lassen sich nicht mit Rückmeldung
-- anlegen. Alles andere läuft weiter.

alter table public.facility_settings
  add column if not exists employee_late_reporting_enabled boolean not null default true;

create table if not exists public.verspaetungen (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_name text not null,
  datum date not null,
  schicht text,                       -- z. B. „Frühdienst ab 06:00, Innere 1"
  minuten integer check (minuten is null or minuten between 1 and 600),
  notiz text,
  created_at timestamptz not null default now()
);
create index if not exists verspaetungen_facility on public.verspaetungen(facility_name, datum desc);
alter table public.verspaetungen enable row level security;

alter table public.notfall_vorlagen
  add column if not exists rueckmeldung boolean not null default false;

create table if not exists public.notfall_rueckmeldungen (
  id uuid primary key default gen_random_uuid(),
  ausloesung_id uuid not null references public.notfall_ausloesungen(id) on delete cascade,
  facility_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_name text not null,
  created_at timestamptz not null default now(),
  unique (ausloesung_id, user_id)
);
create index if not exists notfall_rueckmeldungen_ausloesung on public.notfall_rueckmeldungen(ausloesung_id);
alter table public.notfall_rueckmeldungen enable row level security;

notify pgrst, 'reload schema';

-- Prüfung: 4 Zeilen = alles da.
select 'facility_settings.employee_late_reporting_enabled' as was from information_schema.columns
  where table_schema = 'public' and table_name = 'facility_settings' and column_name = 'employee_late_reporting_enabled'
union all
select 'verspaetungen' from information_schema.tables where table_schema = 'public' and table_name = 'verspaetungen'
union all
select 'notfall_vorlagen.rueckmeldung' from information_schema.columns
  where table_schema = 'public' and table_name = 'notfall_vorlagen' and column_name = 'rueckmeldung'
union all
select 'notfall_rueckmeldungen' from information_schema.tables where table_schema = 'public' and table_name = 'notfall_rueckmeldungen';
