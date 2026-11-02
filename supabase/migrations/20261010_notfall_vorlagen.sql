-- Notfall-Vorlagen: vorbereitete Notfallpläne, per Knopf auslösbar (10.10.2026)
--
-- Die Leitung legt vorher fest, was bei Situation X passiert („Glatteis", „Stromausfall",
-- „Grippewelle"), auf Wunsch mit einem KI-Entwurf. Im Ernstfall löst ein Knopf die Vorlage
-- aus: Nurvo benachrichtigt Eingeplante, Bereitschaft und freie Mitarbeitende mit dem
-- jeweiligen Text und meldet der Leitung, wer erreicht wurde. Auslösen dürfen Leitungen und
-- Pflegekräfte, denen die Leitung das erlaubt. Code: lib/notfall-vorlagen.ts.
--
-- OHNE DIESE DATEI lässt sich keine Vorlage speichern und nichts auslösen; die Seite
-- Notfallplan zeigt dann einen Hinweis auf diese Migration. Der spontane Notfallplan läuft
-- unabhängig davon weiter.
--
-- Alle drei Tabellen nur über die API (Service-Schlüssel); RLS an, keine Policy.

create table if not exists public.notfall_vorlagen (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  titel text not null,
  situation text not null default '',
  stunden integer not null default 12 check (stunden between 1 and 72),
  station text,                                   -- null = alle Stationen
  nachricht_eingeplant text,                      -- an alle, die im Fenster noch eine Schicht beginnen
  nachricht_bereitschaft text,                    -- an alle mit Bereitschaft im Fenster
  nachricht_frei text,                            -- an alle übrigen, nicht abwesenden Mitarbeitenden
  ki_entwurf boolean not null default false,      -- Text stammt (teilweise) aus einem KI-Entwurf
  erstellt_von text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notfall_vorlagen_facility on public.notfall_vorlagen(facility_name);
alter table public.notfall_vorlagen enable row level security;

-- Wer außer den Leitungen auslösen darf. Eine Zeile je Person und Einrichtung.
create table if not exists public.notfall_berechtigte (
  facility_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  erteilt_von text,
  created_at timestamptz not null default now(),
  primary key (facility_name, user_id)
);
alter table public.notfall_berechtigte enable row level security;

-- Protokoll jeder Auslösung: wer, wann, wer wurde erreicht.
create table if not exists public.notfall_ausloesungen (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  vorlage_id uuid references public.notfall_vorlagen(id) on delete set null,
  titel text not null,
  ausgeloest_von text not null,
  ausgeloest_von_rolle text not null check (ausgeloest_von_rolle in ('leitung', 'mitarbeiter')),
  empfaenger jsonb not null default '[]'::jsonb,  -- [{ name, gruppe, app, email }]
  empfaenger_anzahl integer not null default 0,
  erreicht_anzahl integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists notfall_ausloesungen_facility on public.notfall_ausloesungen(facility_name, created_at desc);
create index if not exists notfall_ausloesungen_vorlage on public.notfall_ausloesungen(vorlage_id, created_at desc);
alter table public.notfall_ausloesungen enable row level security;

notify pgrst, 'reload schema';

-- Prüfung: 3 Zeilen = alle Tabellen da.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('notfall_vorlagen', 'notfall_berechtigte', 'notfall_ausloesungen')
order by table_name;
