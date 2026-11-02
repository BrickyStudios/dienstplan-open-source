-- Performance-Indizes für die häufigsten DB-Zugriffe.
-- 20260618
--
-- Hintergrund: Das Basis-Schema indiziert shifts(facility_id), die App filtert aber
-- durchgängig nach der TEXT-Spalte facility_name (+ Datumsbereich) und shift_assignments
-- nach facility_name (+ shift_id / staff_name). Die bestehenden Indizes decken diese
-- realen Query-Pfade also nicht ab → diese Migration ergänzt sie.
--
-- Plain CREATE INDEX (kein CONCURRENTLY): der Supabase-SQL-Editor fährt jede Abfrage in
-- einem Transaktionsblock — darin ist CONCURRENTLY nicht erlaubt (ERROR 25001). Bei den
-- aktuellen Tabellengrößen (Demo-Phase, hunderte Zeilen) sperrt ein normaler CREATE INDEX
-- Schreibzugriffe nur Millisekunden → unkritisch. Falls die Tabellen später sehr groß sind,
-- können die Indizes außerhalb des Editors (psql, ohne Transaktion) mit CONCURRENTLY neu
-- gebaut werden. IF NOT EXISTS macht alles idempotent.
-- Migrationen laufen in diesem Projekt NICHT automatisch.

-- shifts: facility_name + Datumsbereich (Dashboard, Schichtplan, mein-plan, KI-Analyse)
create index if not exists idx_shifts_facility_name_date
  on shifts (facility_name, date);

-- shift_assignments: Tenant-Scoping + Join auf die Schicht (sehr häufig)
create index if not exists idx_shift_assignments_facility_shift
  on shift_assignments (facility_name, shift_id);

-- shift_assignments: „meine Zuordnungen" (facility_name + staff_name)
create index if not exists idx_shift_assignments_facility_staff
  on shift_assignments (facility_name, staff_name);
