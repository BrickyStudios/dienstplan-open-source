-- ============================================================================
-- PPBV-Einstufung: Stufenverteilung je Station und Tag (Masterplan § 7.5, Weg b)
-- ============================================================================
--
-- WAS HIER LIEGT. Je Station und Tag die ANZAHL der Patientinnen in jeder der 16
-- Gruppen A1/S1 … A4/S4 (§ 9 PPBV), dazu Patientinnen gesamt, Isolierte, Aufnahmen,
-- Neugeborene und die am Tag Entlassenen nach Vortagsgruppe. Daraus rechnet
-- lib/ppbv-soll.ts die Gesamtstundenzahl der Tagschicht nach § 4 Abs. 2 PPBV.
--
-- WAS HIER NICHT LIEGT — und nicht hineingehoert. Keine Fallnummer, kein Name, keine
-- Einstufung einer bestimmten Person. Die Zeile sagt "12 in A2/S1", nie "Frau X ist
-- A2/S1". Das ist dieselbe Sorte Zahl wie die Belegung in anbindung_belegung und
-- beruehrt die Grenze aus docs/FUNKTIONEN.md ("keine Patientendaten") nicht. Wer hier
-- eine Spalte je Patientin anlegt, hat Weg (c) gebaut — und der ist ausgeschlossen
-- (Art. 9 DSGVO).
--
-- ZUGRIFF. Wie jede Tabelle seit 20260925_rls_schreibrechte_entziehen.sql: RLS an,
-- keine Policy, geschrieben und gelesen wird nur mit service_role ueber
-- app/api/leitung/ppbv-einstufung (resolveLeitung, Filter auf facility_name).
--
-- OHNE DIESE DATEI bricht nichts: Der PPBV-Tab zeigt dann an der Stelle des Solls den
-- Hinweis, dass die Migration fehlt, und alles Uebrige wie bisher.
-- ============================================================================

create table if not exists ppbv_einstufung (
  id             uuid primary key default gen_random_uuid(),
  facility_name  text not null,
  station        text not null,
  datum          date not null,

  patienten      integer not null check (patienten >= 0),
  isolation      integer not null default 0 check (isolation >= 0 and isolation <= patienten),
  aufnahmen      integer not null default 0 check (aufnahmen >= 0),
  neugeborene    integer not null default 0 check (neugeborene >= 0),

  -- {"A1/S1": 10, "A2/S1": 8, ...} — nur Anzahlen, Schluessel aus den 16 Gruppen.
  gruppen        jsonb not null default '{}'::jsonb,
  -- Am Tag Entlassene nach ihrer Gruppe vom Vortag (halber Minutenwert, § 12 Abs. 2 S. 3).
  entlassen      jsonb not null default '{}'::jsonb,

  quelle         text not null default 'csv',
  importiert_von uuid,
  importiert_am  timestamptz not null default now(),

  unique (facility_name, station, datum)
);

create index if not exists ppbv_einstufung_monat
  on ppbv_einstufung(facility_name, datum);

alter table ppbv_einstufung enable row level security;
revoke insert, update, delete, truncate on ppbv_einstufung from anon, authenticated;

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: ppbv_einstufung' as befund
where to_regclass('public.ppbv_einstufung') is null
union all
select 'RLS AUS: ppbv_einstufung'
from pg_class
where relname = 'ppbv_einstufung' and not relrowsecurity;
