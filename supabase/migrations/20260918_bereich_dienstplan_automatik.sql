-- Automatische Bereichs-Dienstpläne: Wochenvorlage je Bereich + Schalter je Bereich.
-- 20260918
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch und NICHT mit dem
-- Vercel-Deploy mit. Einmalig im Supabase-SQL-Editor ausführen:
--   https://supabase.com/dashboard/project/<projekt-ref>/sql
--
-- Solange sie nicht gelaufen ist, funktioniert die Automatik trotzdem — sie schreibt dann
-- nur das fort, was sich in den letzten acht Wochen wiederholt hat
-- (lib/scheduling/bereich-automatik.ts, `vorlagenAusHistorie`). Was ohne diese Migration
-- FEHLT, ist die von Hand gepflegte Wochenvorlage und der Schalter „diesen Bereich nicht
-- automatisch planen".
--
-- Code-Referenzen:
--   lib/scheduling/bereich-automatik.ts, lib/scheduling/bereich-plan.ts,
--   app/api/leitung/bereich-shift-templates/route.ts,
--   app/api/leitung/bereich-shifts/generate/route.ts,
--   app/api/cron/auto-schedule/route.ts

-- ── Wochenvorlage je Bereich ─────────────────────────────────────────────────
-- Eine Zeile = ein wiederkehrender Dienst an einem Wochentag. „Mo–Fr 06:00–14:00,
-- zwei Leute" sind fünf Zeilen, nicht eine: Ein Bereich streicht selten die ganze
-- Woche, aber oft einen einzelnen Tag, und das muss ohne Sonderfeld gehen.
create table if not exists bereich_shift_templates (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  -- 0 = Montag … 6 = Sonntag. BEWUSST nicht die Postgres-Konvention (dow: 0 = Sonntag):
  -- Der Dienstplan im Produkt beginnt am Montag, und zwei Zählweisen im selben Feature
  -- sind ein Fehler, der erst am Sonntag auffällt.
  weekday smallint not null check (weekday between 0 and 6),
  start_time text,
  end_time text,
  label text,                                   -- freie Bezeichnung, z.B. "Frühdienst", "Visite"
  staff_needed integer not null default 1 check (staff_needed >= 0 and staff_needed <= 99),
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists bereich_shift_templates_facility on bereich_shift_templates(facility_name);
create index if not exists bereich_shift_templates_bereich on bereich_shift_templates(bereich_id);

-- Eindeutigkeit über denselben Schlüssel, den der Code benutzt (`vorlagenSchluessel`):
-- Bereich + Wochentag + Beginn + Bezeichnung. NULL und '' sind dabei dasselbe, sonst
-- ließen sich zwei „montags ohne Uhrzeit"-Vorlagen nebeneinander anlegen.
create unique index if not exists bereich_shift_templates_eindeutig
  on bereich_shift_templates (bereich_id, weekday, coalesce(start_time, ''), coalesce(lower(label), ''));

alter table bereich_shift_templates enable row level security;

-- ── Schalter je Bereich ──────────────────────────────────────────────────────
-- Standard ist AN. Der Auslöser dieser Änderung war eine Einrichtung, deren
-- Bereichsraster leer blieb, während der Stationsplan von selbst entstand — ein
-- Standard auf „aus" hätte genau daran nichts geändert.
alter table bereiche add column if not exists auto_plan_enabled boolean not null default true;
