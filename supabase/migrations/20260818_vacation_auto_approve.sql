-- Neue Einstellung: automatische Genehmigung von Urlaubsanträgen, wenn die Besetzung ohne
-- die Person weiterhin gedeckt bleibt. Berechnung analog zur Lücken-Logik der Ausfall-Kaskade
-- (lib/sick-resolution.ts: computeShiftGapExcluding) — "planned_staff − Besetzung ohne die
-- Person", wiederverwendet in lib/vacation-auto-approve.ts. Reicht die Besetzung NICHT, bleibt
-- der Antrag wie bisher offen für die Leitung (nie automatisch abgelehnt).
--
-- Greift im echten Genehmigungs-Codepfad (app/api/mitarbeiter/vacation-requests, POST) bei
-- JEDEM neuen Urlaubsantrag — nicht nur in der Simulation (Debug-Werkzeug 8, /debug).
--
-- 6. Bedingung des "Vollautomatik"-Master-Schalters (siehe docs/SYSTEM.md Kapitel 6.1):
--   auto_scheduling_enabled === true && understaffing_mode === 'auto' &&
--   shift_swap_mode === 'automatic' && overtime_rebalance_mode === 'auto' &&
--   auto_payroll_enabled === true && vacation_auto_approve === true
--
-- Defensiv (IF NOT EXISTS) → bis zur Ausführung bleibt die Automatik dauerhaft aus
-- (Bestandsverhalten, kein Bruch): Anträge landen wie bisher immer bei der Leitung.
alter table public.facility_settings
  add column if not exists vacation_auto_approve boolean not null default false;

comment on column public.facility_settings.vacation_auto_approve is
  'Automatische Genehmigung neuer Urlaubsanträge, wenn die Besetzung jeder betroffenen Schicht nach Herausnahme der Person weiterhin planned_staff deckt. Reicht sie nicht, bleibt der Antrag offen für die Leitung (nie automatisch abgelehnt). Teil des "Vollautomatik"-Master-Schalters (6. Bedingung).';

notify pgrst, 'reload schema';
