-- Schichtzusammenfassung: Soll (geplante Schicht) gegen Ist (Zeiterfassung), je Dienst
-- festgehalten. Bis hierhin wusste die App nur, WANN gestempelt wurde — ob das zum Plan
-- passte, stand nirgends. Gerechnet wird in lib/shift-report.ts, geschrieben nach jedem
-- Ausstempeln und bei jedem Aufruf der Zeiterfassungs-Auswertung.
-- 20260909
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausfuehren.
-- Defensiv (IF NOT EXISTS): bis zur Ausfuehrung degradiert der Code sauber — 42P01 fuehrt
-- dazu, dass NUR nicht gespeichert wird; die Auswertung selbst wird live gerechnet und ist
-- vollstaendig nutzbar, nur eben nicht dauerhaft.
--
-- TOLERANZ: `tolerance_minutes` haelt fest, mit welcher Schwelle `is_late` entstanden ist
-- (aktuell 5 Minuten, Begruendung im Kopf von lib/shift-report.ts). `late_minutes` bleibt
-- der Rohwert — aendert sich die Schwelle spaeter, laesst sich die Historie neu bewerten,
-- ohne sie neu zu rechnen.
--
-- DATENSCHUTZ: bewusst KEINE Klarnamen. Nur staff_id (uuid); der Anzeigename kommt beim
-- Lesen aus user_profiles/facility_staff.
--
-- MITBESTIMMUNG: Eine Verspaetungsauswertung ist eine technische Einrichtung im Sinne des
-- § 87 Abs. 1 Nr. 6 BetrVG. Die betroffene Person sieht ihre eigene Auswertung in der App
-- genauso wie die Leitung — verdeckt waere sie rechtlich angreifbar. Siehe
-- docs/recht/BETRIEBSRAT-INFORMATION.md Abschnitt 4.5.

create table if not exists public.shift_reports (
  id                     uuid primary key default gen_random_uuid(),
  facility_name          text not null,
  staff_id               uuid not null,
  -- Der Ist-Beleg. Eindeutig, damit eine Neuberechnung denselben Dienst aktualisiert
  -- statt ihn zu verdoppeln.
  time_entry_id          uuid not null unique,
  -- Der Soll-Beleg. NULL = ungeplanter Dienst; dann bleibt die Puenktlichkeit unbewertet,
  -- denn ein Dienst ohne Sollzeit kann nicht zu spaet sein.
  shift_id               uuid,
  shift_date             date not null,
  station                text,

  planned_start          timestamptz,
  planned_end            timestamptz,
  actual_start           timestamptz not null,
  actual_end             timestamptz,

  late_minutes           integer,   -- Rohwert: >0 spaeter als geplant, <0 frueher da
  early_leave_minutes    integer,   -- Rohwert: >0 frueher gegangen, <0 laenger geblieben
  is_late                boolean not null default false,  -- late_minutes > tolerance
  left_early             boolean not null default false,
  tolerance_minutes      smallint not null default 5,

  planned_minutes        integer,   -- Soll-Dauer
  actual_minutes         integer,   -- Ist-Dauer netto (ohne Pause)
  pause_minutes          integer not null default 0,
  required_pause_minutes integer not null default 0,      -- § 4 ArbZG
  pause_compliant        boolean,
  rest_hours_before      numeric(6,2),                    -- Ruhezeit zur Vorschicht
  rest_compliant         boolean,                         -- >= 11 h (§ 5 ArbZG)

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists shift_reports_facility_date
  on public.shift_reports (facility_name, shift_date desc);
create index if not exists shift_reports_staff_date
  on public.shift_reports (staff_id, shift_date desc);
-- Traegt die Uebersicht „wer kam wie oft zu spaet"
create index if not exists shift_reports_facility_late
  on public.shift_reports (facility_name, is_late);

-- Nachtrag fuer Instanzen, in denen eine fruehere Fassung der Tabelle liegt.
alter table public.shift_reports add column if not exists left_early boolean not null default false;
alter table public.shift_reports add column if not exists tolerance_minutes smallint not null default 5;
alter table public.shift_reports add column if not exists rest_hours_before numeric(6,2);
alter table public.shift_reports add column if not exists rest_compliant boolean;
alter table public.shift_reports add column if not exists updated_at timestamptz not null default now();

alter table public.shift_reports enable row level security;

comment on table public.shift_reports is
  'Soll/Ist je abgeschlossenem Dienst (lib/shift-report.ts). Kein Klarname, nur staff_id.';
comment on column public.shift_reports.late_minutes is
  'Rohe Abweichung zum geplanten Beginn in Minuten. is_late wendet die Toleranz an.';
comment on column public.shift_reports.tolerance_minutes is
  'Schwelle, mit der is_late berechnet wurde. Unter dieser Grenze misst der Stempel Rauschen, nicht Verhalten.';

notify pgrst, 'reload schema';
