-- Schichttausch: Mitarbeiter A tauscht eine eigene Schicht gegen eine Schicht von
-- Kollege B (echter 1-für-1-Tausch, Besetzung je Schicht bleibt dabei unverändert).
--
-- Ablauf Modus 'manual' (facility_settings.shift_swap_mode):
--   pending_leitung -> (Leitung genehmigt) -> pending_colleague -> (B nimmt an) -> approved
--                    -> (Leitung lehnt ab) -> declined_by_leitung
--                                           -> (B lehnt ab) -> declined_by_colleague
-- Ablauf Modus 'automatic':
--   pending_colleague -> (B nimmt an + Algorithmus weiterhin gültig) -> approved (sofort
--   ausgeführt, Leitung wird nur informiert) -> (B lehnt ab) -> declined_by_colleague
--
-- 'mode' wird bei Erstellung eingefroren, damit eine spätere Einstellungsänderung
-- laufende Anfragen nicht rückwirkend verändert. Legalitätsprüfung (ArbZG) läuft über
-- lib/shift-swap.ts (rankReplacementCandidates aus lib/scheduling/generate-plan-core.ts,
-- gleiche Logik wie Überstunden-Ausgleich/Springer-Ersatzsuche). PPBV-Besetzungsquote ist
-- durch den 1-für-1-Tausch strukturell unverändert — keine gesonderte Prüfung nötig.
create table if not exists shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,

  requester_staff_id uuid not null,
  requester_staff_name text not null,
  requester_shift_id uuid not null,
  requester_shift_date date not null,
  requester_shift_type text not null,

  target_staff_id uuid not null,
  target_staff_name text not null,
  target_shift_id uuid not null,
  target_shift_date date not null,
  target_shift_type text not null,

  reason text not null,
  mode text not null check (mode in ('manual', 'automatic')),

  status text not null default 'pending_leitung' check (status in (
    'pending_leitung', 'pending_colleague', 'approved',
    'declined_by_leitung', 'declined_by_colleague', 'failed'
  )),

  leitung_decided_at timestamptz,
  colleague_decided_at timestamptz,

  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_shift_swap_requests_facility_status
  on shift_swap_requests(facility_name, status);
create index if not exists idx_shift_swap_requests_target_staff
  on shift_swap_requests(target_staff_id, status);
create index if not exists idx_shift_swap_requests_requester
  on shift_swap_requests(requester_staff_id, status);

comment on table shift_swap_requests is
  'Peer-zu-Peer Schichttausch-Anfragen zwischen zwei Mitarbeitern, mit optionaler Leitungs-Freigabe (siehe facility_settings.shift_swap_mode).';

alter table facility_settings add column if not exists shift_swap_mode text not null default 'manual'
  check (shift_swap_mode in ('manual', 'automatic'));
