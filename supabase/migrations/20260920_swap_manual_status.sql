-- Schichttausch: ein von Hand eingeteilter Dienst ist besetzt, nicht unsichtbar.
--
-- `app/api/leitung/shifts/assign` schreibt eine von Hand eingeteilte Zuweisung mit
-- `status = 'manual'`. Überall sonst im Produkt gilt die Auslegung aus
-- `lib/scheduling/actual-staff.ts`: gültig ist alles außer 'cancelled', fehlender Status
-- heißt 'confirmed'. Nur der Tausch verglich fest auf 'confirmed' — im Code (behoben am
-- 20.09.2026) und hier in der Datenbankfunktion.
--
-- Wirkung ohne diese Datei: Die Leitung teilt jemanden von Hand ein, die Person will
-- tauschen — und execute_shift_swap findet ihre Zuweisung nicht. Der Tausch bricht mit
-- 'requester_missing' ab, obwohl die Schicht sichtbar besetzt ist. Die Oberfläche sagt
-- dann „Eine der beiden Zuweisungen wurde in der Zwischenzeit geändert", und niemand
-- kommt darauf, dass es an der Art der Einteilung liegt.
--
-- Geändert sind ausschließlich die beiden Status-Zeilen; der Rest der Funktion ist
-- unverändert aus 20260722_shift_swap_rebuild.sql übernommen, damit ein Vergleich der
-- beiden Dateien genau das zeigt.

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
     and coalesce(status, 'confirmed') <> 'cancelled'
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
     and coalesce(status, 'confirmed') <> 'cancelled'
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

-- Rechte wie gehabt: nur die Service-Role, sonst ließe sich die ArbZG-Prüfung umgehen.
revoke all on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) from public;
do $$ begin
  execute 'revoke all on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) from anon, authenticated';
exception when undefined_object then null; end $$;
do $$ begin
  execute 'grant execute on function execute_shift_swap(text,uuid,uuid,uuid,uuid,text,text) to service_role';
exception when undefined_object then null; end $$;
