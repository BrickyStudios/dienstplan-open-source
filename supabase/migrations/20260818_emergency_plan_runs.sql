-- Notfallplan: Protokoll jedes Laufs (lib/ai-emergency-plan.ts), analog zu algorithm_runs
-- und ki_plan_recommendations. Für Situationen, die keine bestehende Automatik abdeckt
-- (Krankmeldungs-Kaskade, Schichttausch, Überstunden-Ausgleich, Copilot für eine einzelne
-- offene Schicht) — die Leitung beschreibt eine Ausnahmelage in Freitext und bekommt bis zu
-- drei geprüfte, inhaltlich unterschiedliche Lösungswege vorgelegt.
--
-- "optionen" speichert NUR die Lösungswege, die den Regel-Layer (lib/ai-guardrails.ts)
-- bestanden haben, bereits mit aufgelösten Namen/Schichtdaten (nicht die rohen IDs) — die
-- Ausführungs-Route (PUT) liest diese Spalte zurück und schreibt daraus shift_assignments,
-- ohne die Minimierung/Regelprüfung erneut laufen zu lassen.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).
--
-- Code-Referenzen: lib/ai-emergency-plan.ts, app/api/leitung/emergency-plan/route.ts,
--   app/(app)/(leitung)/notfallplan/page.tsx

create table if not exists emergency_plan_runs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  created_by text,                                        -- Leitung, die den Lauf gestartet hat
  freitext text not null,                                  -- die geschilderte Situation
  verstanden_als text,                                     -- Intent-Rückversicherung
  art text,                                                -- 'ausfall' | 'mehrbedarf' | 'unklar'
  zeitraum_von date,
  zeitraum_bis date,
  station text,
  zeitraum_begrenzt boolean not null default false,        -- Zeitraum wurde auf MAX_ZEITRAUM_TAGE gekürzt
  optionen jsonb not null default '[]'::jsonb,              -- EmergencyOptionResult[] mit aufgelösten Namen
  verworfene_anzahl integer not null default 0,             -- wie viele der bis zu drei Lösungswege verworfen wurden
  status text not null default 'vorgeschlagen'              -- vorgeschlagen | ausgefuehrt | verworfen
    check (status in ('vorgeschlagen', 'ausgefuehrt', 'verworfen')),
  ausgewaehlte_strategie text,                               -- welchen Lösungsweg die Leitung ausgeführt hat
  ausgefuehrt_at timestamptz,
  ausgefuehrt_von text,
  benachrichtigt_anzahl integer,                             -- wie viele betroffene Mitarbeiter erreicht wurden
  ai_provider text,
  ai_model text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists emergency_plan_runs_facility on emergency_plan_runs(facility_name, created_at desc);
create index if not exists emergency_plan_runs_status on emergency_plan_runs(facility_name, status);

alter table emergency_plan_runs enable row level security;

notify pgrst, 'reload schema';
