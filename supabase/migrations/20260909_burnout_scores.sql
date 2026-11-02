-- Burnout-Verlauf: der Belastungswert je Person wird nicht mehr nur angezeigt, sondern
-- fortgeschrieben. Ohne Historie gibt es keine Entwicklung, und ohne Entwicklung ist
-- Praevention nicht moeglich — man sieht sonst nie, ob eine Entlastungsmassnahme gewirkt
-- hat. Gerechnet wird in lib/burnout.ts (gleitendes 28-Tage-Fenster, 0-100 normalisiert),
-- geschrieben nach jedem Ausstempeln und bei jedem Aufruf der Burnout-Seite.
-- 20260909
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausfuehren.
-- Defensiv (IF NOT EXISTS): bis zur Ausfuehrung degradiert der Code sauber — 42P01 fuehrt
-- dazu, dass NUR nicht gespeichert wird; die Live-Berechnung und die Burnout-Seite
-- funktionieren unveraendert, nur ohne Verlauf.
--
-- DATENSCHUTZ: bewusst KEINE Klarnamen. Nur staff_id (uuid). Der Anzeigename wird beim
-- Lesen aus user_profiles/facility_staff dazugeholt, damit auf dem Server perspektivisch
-- nur Pseudonyme liegen.
--
-- MITBESTIMMUNG: die Tabelle traegt personenbezogene Belastungswerte und ist damit nach
-- § 87 Abs. 1 Nr. 6 BetrVG mitbestimmungsrelevant. Siehe
-- docs/recht/BETRIEBSRAT-INFORMATION.md Abschnitt 4.2.

create table if not exists public.burnout_scores (
  id                   uuid primary key default gen_random_uuid(),
  facility_name        text not null,
  staff_id             uuid not null,
  -- Ein Datensatz je Person und Tag. Sonst waechst die Tabelle bei jedem Ausstempeln um
  -- eine Zeile, ohne dass der Verlauf dadurch aussagekraeftiger wuerde.
  score_date           date not null default current_date,
  computed_at          timestamptz not null default now(),
  window_days          smallint not null default 28,

  score                smallint not null default 0 check (score between 0 and 100),
  band                 text not null default 'stabil',   -- stabil | erhoeht | kritisch

  -- Einzelmesswerte, damit ein Score erklaerbar bleibt und nicht neu gerechnet werden muss
  total_shifts         smallint not null default 0,
  night_shifts         smallint not null default 0,
  weekend_shifts       smallint not null default 0,
  holiday_shifts       smallint not null default 0,
  max_consecutive_days smallint not null default 0,   -- laengste Serie ohne freien Tag
  short_rest_count     smallint not null default 0,   -- Ruhezeiten unter 11 h (§ 5 ArbZG)
  overtime_pct         smallint not null default 0,   -- Prozent ueber der Vertragszeit
  rotation_changes     smallint not null default 0,   -- Rueckwaertsrotation zaehlt doppelt
  short_break_shifts   smallint not null default 0,   -- Pflichtpause nicht genommen (§ 4)
  short_notice_shifts  smallint not null default 0,   -- < 48 h vorher zugeteilt

  factors              jsonb,   -- {faktor: punkte} — die Punkteverteilung des Scores
  trigger_source       text,    -- 'checkout' | 'ansicht'

  unique (facility_name, staff_id, score_date)
);

create index if not exists burnout_scores_staff
  on public.burnout_scores (staff_id, score_date desc);
create index if not exists burnout_scores_facility
  on public.burnout_scores (facility_name, score_date desc);

-- Nachtrag fuer Instanzen, in denen eine fruehere Fassung der Tabelle liegt.
alter table public.burnout_scores add column if not exists factors jsonb;
alter table public.burnout_scores add column if not exists trigger_source text;
alter table public.burnout_scores add column if not exists window_days smallint not null default 28;

alter table public.burnout_scores enable row level security;

comment on table public.burnout_scores is
  'Fortgeschriebener Belastungswert je Person und Tag (lib/burnout.ts). Kein Klarname, nur staff_id.';
comment on column public.burnout_scores.score is
  'Belastung 0-100 im gleitenden 28-Tage-Fenster. Keine Diagnose, keine Leistungsbewertung.';
comment on column public.burnout_scores.factors is
  'Punktebeitrag je Faktor (nacht, serientage, ruhezeit, ueberstunden, wochenende, rotation, pausen, einspringen).';

notify pgrst, 'reload schema';
