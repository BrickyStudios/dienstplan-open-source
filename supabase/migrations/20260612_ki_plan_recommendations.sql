-- KI-Dienstplan-Check als Automatismus + Gedächtnis.
-- Der monatliche KI-Lauf (im bestehenden Cron auto-schedule, kurz vor der Planerstellung)
-- analysiert den vergangenen Monat + die Notizen der vorherigen Läufe und legt seine
-- Empfehlungen hier als 'pending' ab. Die Leitung nimmt sie an (→ Übernahme ab nächstem
-- ungeplanten Monat + Mitarbeiter-Benachrichtigung) oder lehnt ab. Im Demo-Modus kann die
-- Analyse 2×/Demo per Button manuell ausgelöst werden (source='demo').
-- 20260612
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch. Einmal im Supabase
-- SQL-Editor ausführen. Ohne diese Tabelle ist der KI-Automatismus inert (Routen degradieren
-- bei 42P01 sauber); der manuelle Apply-Pfad (PUT optimize-plan) funktioniert weiter.
--
-- Code-Referenzen: app/api/cron/auto-schedule, app/api/leitung/optimize-plan,
--   lib/ki-plan-analysis, components schichtplan/DemoBar.

create table if not exists ki_plan_recommendations (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  analyzed_year smallint,
  analyzed_month smallint,
  summary text,
  recommendations jsonb not null default '[]'::jsonb,   -- Optimization[]
  notes text,                                            -- KI-Notizen (Gedächtnis für den nächsten Lauf)
  status text not null default 'pending',                -- pending | accepted | rejected | applied
  effective_label text,                                  -- Wirkmonat bei Annahme
  source text not null default 'cron',                   -- cron | demo
  created_at timestamptz default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists ki_plan_recommendations_facility on ki_plan_recommendations(facility_name, status);

alter table ki_plan_recommendations enable row level security;

notify pgrst, 'reload schema';
