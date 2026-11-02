-- Rechte je Mitarbeiter und abschaltbare Selbstbedienung (22.10.2026).
--
-- 1. mitarbeiter_rechte: Die Praxisleitung gibt einzelnen Mitarbeitenden Teile ihrer eigenen
--    Rechte (Dienstplan, Urlaub & Ausfall, Praxisteam, Arbeitszeiten, Lohn, Aufgaben,
--    Einstellungen, Rechte vergeben) — lib/rechte.ts. Und sie schaltet für einzelne Personen
--    ab, was sie selbst in der App tun dürfen (z. B. Krankmeldung: dann ruft die Person an).
-- 2. facility_settings.selbstbedienung: dieselben Schalter für die ganze Praxis als Vorgabe.
--
-- Nur der Server liest und schreibt (Service-Role); RLS ist an, ohne Policy, damit kein
-- Browser-Client die Rechte direkt lesen oder ändern kann.
-- Idempotent — mehrfaches Ausführen schadet nicht.

create table if not exists public.mitarbeiter_rechte (
  facility_name   text        not null,
  user_id         uuid        not null,
  rechte          text[]      not null default '{}',
  -- Nur Abweichungen von der Praxis-Vorgabe, z. B. {"krank": false}
  selbstbedienung jsonb       not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      text,
  primary key (facility_name, user_id)
);

alter table public.mitarbeiter_rechte enable row level security;

alter table public.facility_settings
  add column if not exists selbstbedienung jsonb;

comment on table public.mitarbeiter_rechte is
  'Rechte, die die Leitung einzelnen Mitarbeitenden gibt (lib/rechte.ts), und Abweichungen bei der Selbstbedienung.';
comment on column public.facility_settings.selbstbedienung is
  'Was Mitarbeitende selbst in der App dürfen: {"urlaub": bool, "wuensche": bool, "tausch": bool, "abgabe": bool}. Krankmeldung weiter über employee_sick_reporting_enabled. Fehlt ein Schlüssel: erlaubt.';

-- Prüfung: zwei Zeilen erwartet (Tabelle mitarbeiter_rechte, Spalte selbstbedienung).
select 'mitarbeiter_rechte' as objekt, count(*) as vorhanden from information_schema.tables
  where table_schema = 'public' and table_name = 'mitarbeiter_rechte'
union all
select 'facility_settings.selbstbedienung', count(*) from information_schema.columns
  where table_schema = 'public' and table_name = 'facility_settings' and column_name = 'selbstbedienung';
