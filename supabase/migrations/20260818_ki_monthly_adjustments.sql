-- KI-Anpassungsschicht für Sondertage im Monats-Generator (lib/ai-monthly-adjustments.ts).
--
-- WICHTIG — zwei bewusste Kill-Switches, siehe docs/SYSTEM.md Kapitel 9.5 / 21 / 22.4:
--   1. Server-Variable KI_MONTHLY_PLANNING_ENABLED (nicht hier, in Vercel gesetzt) — ungesetzt
--      oder "false" = die ganze Schicht ist überall inaktiv, unabhängig von dieser Spalte.
--   2. facility_settings.ai_monthly_planning_enabled (diese Migration) — Standard FALSE.
-- Beide müssen zutreffen, sonst plant Nurvo exakt wie bisher (nur runSchedulingAlgorithm, keine
-- KI beteiligt). Der Monats-Generator selbst (lib/scheduling/generate-plan-core.ts) bleibt eine
-- reine Funktion ohne KI — diese Schicht setzt NUR danach an, für Sondertage.
--
-- Die arbeitsrechtliche Prüfung (Anhang III Nr. 4b KI-VO) ist für diese Funktion NICHT
-- abgeschlossen — deshalb Standard FALSE, bewusst nicht rückwirkend für Bestandskunden aktiv.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).
--
-- Code-Referenzen: lib/ai-monthly-adjustments.ts, app/api/leitung/generate-plan/route.ts,
--   app/api/leitung/monthly-ai-adjustments/route.ts, app/api/cron/auto-schedule/route.ts

alter table facility_settings
  add column if not exists ai_monthly_planning_enabled boolean not null default false;

-- Protokoll jedes KI-Anpassungslaufs — analog emergency_plan_runs / ki_plan_recommendations.
-- "vorschlaege" speichert NUR die Änderungen, die den Regel-Layer (lib/ai-guardrails.ts)
-- bestanden haben, bereits mit aufgelösten Namen/Schichtdaten (nicht die pseudonymen IDs, nicht
-- die rohen Zuordnungstabellen — die Rückübersetzung passiert ausschließlich innerhalb von
-- lib/ai-monthly-adjustments.ts und verlässt diese Funktion nie in Richtung Protokoll oder KI).
-- Jede Zeile in "vorschlaege" trägt zusätzlich "angewendet" (boolean) — die Ausführungs-Route
-- (PUT) markiert einzeln, was die Leitung bereits bestätigt und geschrieben hat.
create table if not exists ki_monthly_adjustment_runs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  zeitraum_von date not null,
  zeitraum_bis date not null,
  sonder_tage jsonb not null default '[]'::jsonb,        -- ResolvedSpecialDay[]
  vorschlaege jsonb not null default '[]'::jsonb,         -- ResolvedAdjustment[] + je Eintrag "angewendet"
  verworfene_anzahl integer not null default 0,
  zusammenfassung text,
  status text not null default 'vorgeschlagen'
    check (status in ('vorgeschlagen', 'teilweise_angewendet', 'angewendet', 'verworfen')),
  source text not null default 'manuell',                -- manuell | cron
  ai_provider text,
  ai_model text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  entschieden_von text,
  entschieden_at timestamptz
);

create index if not exists ki_monthly_adjustment_runs_facility on ki_monthly_adjustment_runs(facility_name, created_at desc);
create index if not exists ki_monthly_adjustment_runs_status on ki_monthly_adjustment_runs(facility_name, status);

alter table ki_monthly_adjustment_runs enable row level security;

notify pgrst, 'reload schema';
