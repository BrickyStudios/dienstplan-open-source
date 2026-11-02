-- KI-Copilot in der Anwendung: Protokoll jedes Laufs — Anfrage, erkannter Auftrag, Vorschlag,
-- Regelbefunde und die Entscheidung der Leitung.
--
-- WARUM DIESE TABELLE PFLICHT IST UND NICHT KÜR
-- /ki-transparenz sagt öffentlich zu (Abschnitt 8, „Protokollierung (Art. 12)"): „Anfrage,
-- Vorschlag, Regelbefunde und Entscheidung werden protokolliert." Ohne diese Tabelle ist die
-- Zusage nicht eingelöst. Der Copilot darf produktiv deshalb erst laufen, wenn sie steht —
-- der Schalter KI_COPILOT_ENABLED ist bis dahin aus (app/api/leitung/copilot/route.ts).
--
-- Der Code schreibt defensiv: fehlt die Tabelle, funktionieren Vorschlag und Übernahme
-- trotzdem, es entsteht nur kein Protokolleintrag. Im Demo-Betrieb ist das hinnehmbar, im
-- produktiven nicht — siehe oben.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).
--
-- Code-Referenzen: app/api/leitung/copilot/route.ts, lib/ai-copilot.ts,
--   lib/ai-guardrails.ts, components/CopilotBefehlsleiste.tsx

create table if not exists copilot_runs (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  created_by text,                                          -- Leitung, die gefragt hat
  freitext text not null,                                    -- die Anfrage im Wortlaut
  verstanden_als text,                                       -- Intent-Rückversicherung an die Leitung
  zusammenfassung text,                                      -- Begründung der KI in einem Absatz
  zuteilungen jsonb not null default '[]'::jsonb,             -- Vorschlag mit aufgelösten Namen + Schichtdaten
  ausgeschlossen jsonb not null default '[]'::jsonb,          -- wen die KI bewusst NICHT vorschlägt, mit Grund
  befunde jsonb not null default '[]'::jsonb,                 -- Ergebnisse des Regel-Layers (Blocker + Warnungen)
  umsetzbar boolean not null default false,                   -- Regelprüfung bestanden?
  korrekturrunden integer not null default 0,                 -- wie oft die KI nachbessern musste
  uebermittelt_personen integer,                              -- wie viele Personen das Modell überhaupt gesehen hat
  uebermittelt_schichten integer,
  status text not null default 'vorgeschlagen'                -- vorgeschlagen | uebernommen
    check (status in ('vorgeschlagen', 'uebernommen')),
  uebernommen_at timestamptz,
  uebernommen_von text,
  uebernommen_anzahl integer,                                 -- wie viele der Vorschläge wirklich geschrieben wurden
  benachrichtigt_anzahl integer,                              -- wie viele Mitarbeiter erreicht wurden
  ai_provider text,
  ai_model text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists copilot_runs_facility on copilot_runs(facility_name, created_at desc);
create index if not exists copilot_runs_status on copilot_runs(facility_name, status);

alter table copilot_runs enable row level security;

notify pgrst, 'reload schema';
