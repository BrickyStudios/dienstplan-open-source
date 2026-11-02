-- Bereiche (stationsübergreifende Arbeitsbereiche), Mitarbeiter-Zuordnung und
-- Aufgaben/Reinigungsaufträge.
-- 20260602
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch.
-- Einmalig im Supabase SQL-Editor ausführen, sonst:
--  - "bereiche" fehlt weiterhin → Bereiche-Tab speichert ins Leere
--  - "bereich_members"/"bereich_tasks" fehlen → Zuweisung & Aufgaben feuern nie
-- Code-Referenzen:
--   app/api/bereiche/route.ts, app/api/bereiche/members/route.ts,
--   app/api/bereiche/tasks/route.ts, app/api/mein-bereich/route.ts,
--   components/BereicheManager.tsx, app/(app)/bereiche/page.tsx

-- ── Bereiche (war bisher nur als Kommentar in app/api/bereiche/route.ts) ──────
create table if not exists bereiche (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  name text not null,
  color text not null default '#64748b',
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  unique(facility_name, name)
);
create index if not exists bereiche_facility on bereiche(facility_name);

-- ── Mitarbeiter-Zuordnung zu Bereichen (Leitung weist zu) ────────────────────
create table if not exists bereich_members (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  user_id uuid not null,
  staff_name text not null,
  created_at timestamptz default now(),
  unique(bereich_id, user_id)
);
create index if not exists bereich_members_facility on bereich_members(facility_name);
create index if not exists bereich_members_user on bereich_members(user_id);
create index if not exists bereich_members_bereich on bereich_members(bereich_id);

-- ── Aufgaben / Reinigungsaufträge je Bereich ─────────────────────────────────
-- Eine Tabelle für beide Eingabe-Arten:
--   * einfach     → nur title gesetzt ("Flur 2 muss gewischt werden")
--   * strukturiert → zusätzlich room/station/building/bed gefüllt
create table if not exists bereich_tasks (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  bereich_id uuid not null references bereiche(id) on delete cascade,
  title text not null,
  room text,
  station text,
  building text,
  bed text,
  action text not null default 'reinigen',   -- reinigen | austauschen | desinfizieren | reparieren | sonstiges
  priority text not null default 'normal'     -- normal | hoch
    check (priority in ('normal', 'hoch')),
  status text not null default 'open'
    check (status in ('open', 'done')),
  created_by_name text,
  done_by_name text,
  created_at timestamptz default now(),
  done_at timestamptz
);
create index if not exists bereich_tasks_bereich_status on bereich_tasks(bereich_id, status);
create index if not exists bereich_tasks_facility on bereich_tasks(facility_name, status);

-- RLS aktivieren (Zugriff läuft wie bei den übrigen Tabellen über service_role)
alter table bereiche enable row level security;
alter table bereich_members enable row level security;
alter table bereich_tasks enable row level security;
