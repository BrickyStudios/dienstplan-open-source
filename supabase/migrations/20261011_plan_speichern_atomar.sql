-- Plan speichern in EINER Transaktion.
--
-- WARUM. PUT /api/leitung/generate-plan ersetzt die Zuweisungen der gespeicherten
-- Schichten: erst löschen, dann einfügen — bis zum 11.10.2026 als zwei getrennte
-- Aufrufe. Scheiterte das Einfügen (Netz, Zeitüberschreitung, ungültige Zeile), war der
-- alte Plan für diese Schichten schon weg, und die Leitung sah nur einen 500er.
--
-- Eine plpgsql-Funktion läuft als eine Anweisung und damit atomar: Entweder ist danach
-- der neue Plan da, oder der alte steht unverändert.
--
-- Ohne diese Datei läuft die Route weiter, über einen Ersatzweg: Sie sichert den alten
-- Stand vor dem Löschen und spielt ihn zurück, wenn das Einfügen scheitert
-- (lib/scheduling/plan-speichern.ts). Das ist gut, aber nicht atomar — ein Abbruch genau
-- zwischen Löschen und Zurückspielen bliebe möglich.
--
-- Idempotent (create or replace).

create or replace function replace_shift_assignments(
  p_facility  text,
  p_shift_ids uuid[],
  p_rows      jsonb
) returns integer
language plpgsql
as $$
declare
  n integer;
begin
  delete from shift_assignments
   where facility_name = p_facility
     and shift_id = any(p_shift_ids);

  insert into shift_assignments
    (shift_id, facility_name, staff_id, staff_name, status, is_overtime, understaffing_decision, is_springer)
  select r.shift_id, p_facility, r.staff_id, r.staff_name,
         coalesce(r.status, 'confirmed'), coalesce(r.is_overtime, false),
         r.understaffing_decision, coalesce(r.is_springer, false)
    from jsonb_to_recordset(p_rows) as r(
           shift_id uuid, staff_id uuid, staff_name text, status text,
           is_overtime boolean, understaffing_decision text, is_springer boolean)
   -- Nur Schichten, die auch gelöscht wurden: Die Funktion ersetzt, sie ergänzt nicht.
   where r.shift_id = any(p_shift_ids);

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Nur Service-Role — wie execute_shift_swap. Ein eingeloggter Client könnte sonst die
-- Pläne fremder Einrichtungen ersetzen.
revoke all on function replace_shift_assignments(text, uuid[], jsonb) from public;
do $$ begin
  execute 'revoke all on function replace_shift_assignments(text, uuid[], jsonb) from anon, authenticated';
exception when undefined_object then null; end $$;
do $$ begin
  execute 'grant execute on function replace_shift_assignments(text, uuid[], jsonb) to service_role';
exception when undefined_object then null; end $$;

-- Prüfung: 1 Zeile = Funktion da.
select proname from pg_proc where proname = 'replace_shift_assignments';
