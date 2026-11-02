-- ============================================================================
-- shift_assignments: Status 'manual' erlauben (07.10.2026)
--
-- Gefunden beim Einbau der Regelprüfung in die Einteilung von Hand: Die
-- Prüfregel shift_assignments_status_check stammt aus der Zeit vor dem
-- Migrationsordner und erlaubt nur 'confirmed' und 'cancelled' (am 07.10.2026
-- durch Probe-Einfügen ermittelt, Testzeilen sofort gelöscht). Die Route
-- app/api/leitung/shifts/assign schreibt aber 'manual' — jede Einteilung von
-- Hand ist in Produktion mit einem Serverfehler gescheitert.
--
-- Seit dem 07.10.2026 speichert die Route ersatzweise 'confirmed'. Mit dieser
-- Datei bleibt erkennbar, welche Einteilung von Hand kam.
--
-- Idempotent.
-- ============================================================================

alter table shift_assignments drop constraint if exists shift_assignments_status_check;
alter table shift_assignments add constraint shift_assignments_status_check
  check (status in ('confirmed', 'cancelled', 'manual'));

notify pgrst, 'reload schema';

-- Kontrolle: 0 Zeilen = alles da.
select 'manual FEHLT in der Pruefregel' as befund
where not exists (
  select 1 from pg_constraint
  where conname = 'shift_assignments_status_check'
    and pg_get_constraintdef(oid) like '%manual%');
