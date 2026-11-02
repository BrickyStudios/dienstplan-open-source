-- Dritter Schichttausch-Modus 'leitung_only':
-- Mitarbeiter sehen den „Schicht tauschen"-Button gar nicht erst — der Tausch wird
-- ausschließlich von der Leitung durchgeführt (Leitungs-Dashboard → „Schicht tauschen").
-- Ergänzt die bestehenden Modi 'manual' und 'automatic' (Migration 20260719).

-- 1) facility_settings.shift_swap_mode: dritten Wert zulassen.
alter table facility_settings drop constraint if exists facility_settings_shift_swap_mode_check;
alter table facility_settings add constraint facility_settings_shift_swap_mode_check
  check (shift_swap_mode in ('manual', 'automatic', 'leitung_only'));

-- 2) shift_swap_requests.mode: von der Leitung ausgeführte Tausche werden mit mode
--    'leitung_only' (Status 'approved') protokolliert, damit sie in der Tausch-Historie
--    beider Mitarbeiter auftauchen.
alter table shift_swap_requests drop constraint if exists shift_swap_requests_mode_check;
alter table shift_swap_requests add constraint shift_swap_requests_mode_check
  check (mode in ('manual', 'automatic', 'leitung_only'));
