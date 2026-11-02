-- Aufgaben-Kategorien mit standardisierten Verläufen / Checklisten.
-- Slice "Aufgaben" / Teil B2. Die Leitung legt Kategorien an (z.B. "Zimmer-Grundreinigung",
-- "Gerät warten") mit einem vordefinierten Checklisten-Verlauf + Voreinstellungen
-- (Standard-Aktion, Signatur-Pflicht). Beim Anlegen einer Aufgabe wählt man eine Kategorie —
-- deren Checkliste + Signatur-Pflicht werden in die Aufgabe kopiert, sodass jeder Durchlauf
-- standardisiert abgearbeitet (abgehakt) werden kann.
-- 20260612
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch. Einmal im Supabase
-- SQL-Editor ausführen. Ohne diese Tabelle/Spalten bleibt das Feature inert: die Routen
-- lesen/schreiben defensiv (42P01/42703 → Kategorien-Liste leer, Checklisten-Felder ignoriert),
-- Aufgaben funktionieren unverändert.
--
-- Code-Referenzen: app/api/leitung/task-categories, app/api/leitung/station-tasks,
--   app/api/bereiche/tasks, app/api/mein-station, app/api/mein-bereich,
--   components/StationTaskManager, components/BereicheManager, components/TaskCategoryManager.

create table if not exists task_categories (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  name text not null,
  scope text not null default 'both',            -- 'station' | 'bereich' | 'both'
  default_action text not null default 'reinigen',
  requires_signature boolean not null default false,
  checklist jsonb not null default '[]'::jsonb,    -- Array von Schritt-Texten: ["Schritt 1", ...]
  created_at timestamptz default now()
);

create index if not exists task_categories_facility on task_categories(facility_name);

alter table task_categories enable row level security;

-- Aufgaben verweisen auf eine Kategorie (denormalisierter Name für stabile Anzeige/Export)
-- und tragen eine eigene Checklisten-Instanz: [{ "text": "Schritt", "done": false }, ...].
alter table station_tasks add column if not exists category_id uuid;
alter table station_tasks add column if not exists category_name text;
alter table station_tasks add column if not exists checklist jsonb;

alter table bereich_tasks add column if not exists category_id uuid;
alter table bereich_tasks add column if not exists category_name text;
alter table bereich_tasks add column if not exists checklist jsonb;

notify pgrst, 'reload schema';
