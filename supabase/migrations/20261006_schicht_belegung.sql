-- ============================================================================
-- Patientenbelegung je Schicht + PpUG-Untergrenzen je Station
-- ============================================================================
--
-- WAS HIER LIEGT. Je Station, Tag und PpUG-Schicht (tag 06-22, nacht 22-06) die
-- ANZAHL der Patientinnen, gezaehlt von der Station selbst: "+1" bei Aufnahme,
-- "-1" bei Entlassung, oder am Schichtende die Zahl eingetragen. Dazu der
-- Hoechststand der Schicht — gegen ihn wird die Untergrenze geprueft
-- (lib/schicht-belegung.ts).
--
-- WAS HIER NICHT LIEGT. Keine Fallnummer, kein Name. Eine Zeile sagt "24 auf
-- Station 3 in der Nacht", nie wer. Dieselbe Sorte Zahl wie ppbv_einstufung.
--
-- STATIONEN bekommen vier Stammdaten, die der PpUG-Nachweis braucht: Betten,
-- Standort und die Untergrenze als "hoechstens N Patienten je Pflegekraft" fuer
-- Tag und Nacht. Die Grenzwerte traegt die Leitung ein — Nurvo gibt keine vor,
-- weil sie je pflegesensitivem Bereich und Jahr neu vereinbart werden.
--
-- ZUGRIFF. RLS an, keine Policy, nur service_role ueber
-- app/api/mein-station/belegung und app/api/leitung/belegung.
--
-- OHNE DIESE DATEI bricht nichts: Der Zaehler auf "Mein Dashboard" zeigt den
-- Hinweis, dass die Migration fehlt, die Meldefristen-Seite zeigt Termine ohne
-- Belegung, die PpUG-Zulieferung bleibt wie bisher.
-- ============================================================================

create table if not exists schicht_belegung (
  id             uuid primary key default gen_random_uuid(),
  facility_name  text not null,
  station        text not null,
  datum          date not null,
  schicht        text not null check (schicht in ('tag', 'nacht')),

  patienten      integer not null check (patienten >= 0 and patienten <= 500),
  hoechststand   integer not null check (hoechststand >= 0 and hoechststand <= 500),
  zugaenge       integer not null default 0 check (zugaenge >= 0),
  abgaenge       integer not null default 0 check (abgaenge >= 0),

  quelle         text not null default 'station' check (quelle in ('station', 'leitung')),
  geaendert_von  uuid,
  geaendert_von_name text,
  geaendert_am   timestamptz not null default now(),
  aenderungen    integer not null default 1,

  unique (facility_name, station, datum, schicht)
);

create index if not exists schicht_belegung_monat
  on schicht_belegung(facility_name, datum);

alter table schicht_belegung enable row level security;
revoke insert, update, delete, truncate on schicht_belegung from anon, authenticated;

alter table stations add column if not exists betten integer check (betten is null or betten >= 0);
alter table stations add column if not exists standort text;
alter table stations add column if not exists ppug_grenze_tag numeric(5,2) check (ppug_grenze_tag is null or ppug_grenze_tag > 0);
alter table stations add column if not exists ppug_grenze_nacht numeric(5,2) check (ppug_grenze_nacht is null or ppug_grenze_nacht > 0);

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: schicht_belegung' as befund
where to_regclass('public.schicht_belegung') is null
union all
select 'RLS AUS: schicht_belegung'
from pg_class
where relname = 'schicht_belegung' and not relrowsecurity
union all
select 'SPALTE FEHLT: stations.' || s
from (values ('betten'), ('standort'), ('ppug_grenze_tag'), ('ppug_grenze_nacht')) as t(s)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'stations' and column_name = t.s
);
