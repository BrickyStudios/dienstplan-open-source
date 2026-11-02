-- 20260909_actual_staff_backfill.sql
--
-- Ist-Besetzung nachtragen fuer Dienstplaene, die VOR dem 09.09.2026 gespeichert wurden.
--
-- Hintergrund: Der Generator schrieb seine Einteilungen nur nach shift_assignments.
-- shifts.actual_staff — der Wert, aus dem Dashboard ("unterbesetzte Schichten"),
-- PPBV-/PeBeM-Quote, das Monatsraster im Schichtplan und die KI-Analyse ihre Zahlen ziehen —
-- blieb dabei auf 0 stehen. Ein vollstaendig erzeugter und gespeicherter Monatsplan sah
-- deshalb ueberall aus, als waere nichts gespeichert worden: alles rot, PPBV 0 %.
--
-- Ab dem 09.09.2026 zieht die App den Wert bei jeder Aenderung selbst nach
-- (lib/scheduling/actual-staff.ts). Diese Datei holt nur den Altbestand nach.
--
-- KEINE Schema-Aenderung, reine Datenkorrektur. Idempotent: mehrfaches Ausfuehren
-- liefert dasselbe Ergebnis.
--
-- BEWUSST KONSERVATIV: Es werden ausschliesslich Schichten angefasst, zu denen es
-- mindestens eine gueltige Zuweisung gibt. Schichten ohne Zuweisung behalten ihren
-- bisherigen Wert — dort koennte eine von Hand eingetragene oder geseedete Ist-Besetzung
-- stehen, die diese Datei nicht ueberschreiben soll.

begin;

with ist as (
  select
    a.shift_id,
    count(*)::int as anzahl
  from shift_assignments a
  where coalesce(a.status, 'confirmed') <> 'cancelled'
  group by a.shift_id
)
update shifts s
   set actual_staff = ist.anzahl
  from ist
 where ist.shift_id = s.id
   and s.actual_staff is distinct from ist.anzahl;

commit;

-- Kontrolle — sollte 0 Zeilen liefern (jede Schicht mit Zuweisungen hat den passenden Ist-Wert):
--
--   with ist as (
--     select a.shift_id, count(*)::int as anzahl
--       from shift_assignments a
--      where coalesce(a.status, 'confirmed') <> 'cancelled'
--      group by a.shift_id
--   )
--   select s.id, s.facility_name, s.date, s.station, s.shift_type, s.actual_staff, ist.anzahl
--     from shifts s join ist on ist.shift_id = s.id
--    where s.actual_staff is distinct from ist.anzahl;
