-- ============================================================================
-- Nurvo — Schichttausch: Neubau des Fundaments + sauberes Swap-Schema
-- Einmalig im Supabase SQL-Editor ausführen. Idempotent & sicher.
--
-- Kernidee: KEIN neuer ID-Namensraum (das würde alle ~15 Consumer brechen).
-- Stattdessen wird die BESTEHENDE Identität zuverlässig gemacht:
--   shift_assignments.staff_id ist ab jetzt IMMER gesetzt (nie mehr null),
--   Auflösung exakt wie im Planer: user_profiles hat Vorrang vor facility_staff.
-- shifts / shift_assignments behalten alle Spalten → Lohn, Planerstellung,
-- Krank-Kaskade, Überstunden, „Mein Plan", Export laufen unverändert weiter.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) FUNDAMENT: die 23503-Ursache entfernen
-- shift_assignments.staff_id trug eine Fremdschlüssel-Bindung, die nur echte
-- Auth-Nutzer akzeptierte. Fiktive/Demo-Mitarbeiter (nur in facility_staff /
-- user_profiles, ohne auth.users-Konto) lösten 23503 aus → der GANZE staff_id
-- einer Charge wurde auf null gesetzt → seither matcht alles nur über den Namen.
-- Wir lösen JEDE Fremdschlüssel-Bindung auf staff_id (ohne ihren Namen kennen zu
-- müssen). staff_id bleibt eine gewöhnliche uuid.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'shift_assignments'
      and con.contype = 'f'
      and (select attname from pg_attribute
             where attrelid = con.conrelid and attnum = con.conkey[1]) = 'staff_id'
  loop
    execute format('alter table shift_assignments drop constraint %I', r.conname);
  end loop;
end $$;

-- Spalten sicherstellen (falls Alt-DB)
alter table shift_assignments add column if not exists staff_id      uuid;
alter table shift_assignments add column if not exists staff_name    text;
alter table shift_assignments add column if not exists facility_name text;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) BACKFILL: fehlende staff_id aus dem Namen auflösen
-- Kanonische ID = user_profiles.id (Vorrang), sonst facility_staff.id — exakt
-- dieselbe Priorität wie generate-plan-core.ts. Achtung: user_profiles nutzt die
-- Spalte "facility", alle anderen Tabellen "facility_name".
-- ─────────────────────────────────────────────────────────────────────────
update shift_assignments sa
   set staff_id = up.id
  from user_profiles up
 where sa.staff_id is null
   and up.facility  = sa.facility_name
   and up.full_name = sa.staff_name;

update shift_assignments sa
   set staff_id = fs.id
  from facility_staff fs
 where sa.staff_id is null
   and fs.facility_name = sa.facility_name
   and fs.full_name     = sa.staff_name;

create index if not exists idx_shift_assignments_fac_staff on shift_assignments(facility_name, staff_id);
create index if not exists idx_shift_assignments_shift     on shift_assignments(shift_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) SCHICHTTAUSCH-MODUS: leitung_only zulassen
-- Die Einstellungs-UI bietet manual/automatic/leitung_only bereits an, die alte
-- CHECK-Constraint erlaubte aber nur manual/automatic → „Nur über Leitung"
-- speichern schlug fehl (500). Alte Constraint dynamisch entfernen, neue setzen.
-- ─────────────────────────────────────────────────────────────────────────
alter table facility_settings add column if not exists shift_swap_mode text not null default 'manual';
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'facility_settings'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%shift_swap_mode%'
  loop
    execute format('alter table facility_settings drop constraint %I', r.conname);
  end loop;
end $$;
alter table facility_settings
  add constraint facility_settings_shift_swap_mode_check
  check (shift_swap_mode in ('manual','automatic','leitung_only'));

-- ─────────────────────────────────────────────────────────────────────────
-- 4) SWAP-ANFRAGEN: sauberes Schema (Neubau)
-- Nur die Swap-Routen + Swap-UI lesen diese Tabelle — kein anderer Consumer.
-- Neu-Anlage ist daher unkritisch (evtl. offene Anfragen gehen verloren; sie
-- sind transient). Ablauf des Status-Automaten:
--   manual:      pending_leitung → (Leitung ✓) → pending_colleague → (Kollege ✓) → approved
--   automatic:   pending_colleague → (Kollege ✓ + Re-Prüfung) → approved (Leitung nur informiert)
--   *_by_leitung / *_by_colleague / failed = Endzustände.
-- ─────────────────────────────────────────────────────────────────────────
drop table if exists shift_swap_requests cascade;
create table shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,

  requester_staff_id   uuid not null,
  requester_staff_name text not null,
  requester_shift_id   uuid not null,
  requester_shift_date date not null,
  requester_shift_type text not null,

  target_staff_id   uuid not null,
  target_staff_name text not null,
  target_shift_id   uuid not null,
  target_shift_date date not null,
  target_shift_type text not null,

  reason text not null,
  mode   text not null check (mode in ('manual','automatic','leitung_only')),
  status text not null default 'pending_leitung' check (status in (
    'pending_leitung','pending_colleague','approved',
    'declined_by_leitung','declined_by_colleague','failed'
  )),

  leitung_decided_at   timestamptz,
  colleague_decided_at timestamptz,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_ssr_facility_status on shift_swap_requests(facility_name, status);
create index idx_ssr_target          on shift_swap_requests(target_staff_id, status);
create index idx_ssr_requester       on shift_swap_requests(requester_staff_id, status);

-- Zugriff läuft ausschließlich über den Service-Role-Client (server-seitig).
-- RLS an, ohne Policy → anon/authenticated sehen nichts, Service-Role bleibt frei.
alter table shift_swap_requests enable row level security;

comment on table shift_swap_requests is
  'Peer-zu-Peer Schichttausch-Anfragen, optional mit Leitungs-Freigabe (facility_settings.shift_swap_mode). Nur server-seitig (Service-Role) zugegriffen.';

-- ─────────────────────────────────────────────────────────────────────────
-- 5) ATOMARE AUSFÜHRUNG (RPC)
-- Vertauscht die Besetzung zweier Zuweisungen in EINER Transaktion mit
-- Row-Locks (for update). Verhindert den halb-getauschten Zustand, den zwei
-- getrennte Updates hinterlassen konnten. Wählt die konkrete Person primär über
-- staff_id, ersatzweise über den Namen (Altzeilen). Rückgabe: jsonb {ok, reason?}.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function execute_shift_swap(
  p_facility        text,
  p_requester_shift uuid, p_target_shift uuid,
  p_requester_staff uuid, p_target_staff uuid,
  p_requester_name  text, p_target_name  text
) returns jsonb
language plpgsql
as $$
declare
  r_id uuid; r_sid uuid; r_name text;
  t_id uuid; t_sid uuid; t_name text;
begin
  select id, staff_id, staff_name into r_id, r_sid, r_name
    from shift_assignments
   where facility_name = p_facility
     and shift_id = p_requester_shift
     and coalesce(status, 'confirmed') = 'confirmed'
     and ((staff_id is not null and staff_id = p_requester_staff) or staff_name = p_requester_name)
   order by (staff_id is not distinct from p_requester_staff) desc
   limit 1
   for update;
  if r_id is null then
    return jsonb_build_object('ok', false, 'reason', 'requester_missing');
  end if;

  select id, staff_id, staff_name into t_id, t_sid, t_name
    from shift_assignments
   where facility_name = p_facility
     and shift_id = p_target_shift
     and coalesce(status, 'confirmed') = 'confirmed'
     and ((staff_id is not null and staff_id = p_target_staff) or staff_name = p_target_name)
   order by (staff_id is not distinct from p_target_staff) desc
   limit 1
   for update;
  if t_id is null then
    return jsonb_build_object('ok', false, 'reason', 'target_missing');
  end if;

  update shift_assignments set staff_id = t_sid, staff_name = t_name where id = r_id;
  update shift_assignments set staff_id = r_sid, staff_name = r_name where id = t_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Die Funktion darf NICHT direkt von eingeloggten Clients aufrufbar sein
-- (sonst umginge man die ArbZG-Prüfung). Nur Service-Role.
revoke all on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) from public;
do $$ begin
  execute 'revoke all on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) from anon, authenticated';
exception when undefined_object then null; end $$;
do $$ begin
  execute 'grant execute on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) to service_role';
exception when undefined_object then null; end $$;
