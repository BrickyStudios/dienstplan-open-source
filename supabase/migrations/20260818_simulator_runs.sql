-- Protokoll jedes Laufs des Monats-Simulators (Debug-Werkzeug 8, /debug), analog zu
-- algorithm_runs und emergency_plan_runs. Rein informativ — nichts hier steuert Verhalten,
-- die Zeile hält nur fest, was ein Lauf erzeugt hat, damit man ihn später nachvollziehen kann.
--
-- NUR für Entwickler erreichbar (lib/debug-auth.ts → resolveDebugAccess()), genau wie die
-- restlichen sieben Werkzeuge. Kein Kundenkonto kann diese Tabelle je befüllen.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).
--
-- Code-Referenz: app/api/debug/simulate-month/route.ts, app/api/debug/simulate-month/next/route.ts

create table if not exists simulator_runs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  target_month text not null,                       -- 'YYYY-MM' des simulierten Monats
  seed integer not null,
  kind text not null default 'run'                   -- 'run' (Hauptlauf) | 'next_month' (Anschluss-Schritt)
    check (kind in ('run', 'next_month')),
  stats jsonb not null default '{}'::jsonb,           -- Zahlen-Block, siehe docs/DEBUG-TOOLS.md
  log text,                                           -- Freitext-Protokoll der einzelnen Schritte
  created_by text,                                    -- Login der ausführenden Entwicklerperson
  created_at timestamptz not null default now()
);

create index if not exists simulator_runs_facility on simulator_runs(facility_name, target_month, created_at desc);

alter table simulator_runs enable row level security;

notify pgrst, 'reload schema';
