-- Merkt sich den Zeitpunkt des allerersten erfolgreichen Planlaufs je Einrichtung. Gesetzt in
-- lib/scheduling/first-plan.ts, aufgerufen sowohl von der manuellen Route
-- (app/api/leitung/generate-plan/route.ts, PUT) als auch vom Cron
-- (app/api/cron/auto-schedule/route.ts, autoGeneratePlan) — jeweils direkt NACH dem
-- erfolgreichen Insert in shift_assignments, und nur wenn dabei mindestens eine Zeile
-- entstanden ist (kein Setzen bei einem Leerlauf ohne Personal/Bedarf).
--
-- Steuert die Sichtbarkeit des Buttons "Dienstplan generieren" im Schichtplan
-- (app/(app)/(leitung)/schichtplan/page.tsx): Rolle demo sieht ihn immer; Rolle leitung sieht
-- ihn, bis SOWOHL first_plan_generated_at gesetzt ALS AUCH auto_scheduling_enabled aktiv ist
-- — sonst gäbe es für eine Einrichtung ohne (mehr) aktive Automatik nach dem ersten Plan
-- keine Möglichkeit mehr, je einen zweiten manuell zu erzeugen.
--
-- Defensiv (IF NOT EXISTS) → bis zur Ausführung bleibt first_plan_generated_at dauerhaft NULL
-- und der Button entsprechend dauerhaft sichtbar (Bestandsverhalten, kein Bruch).
alter table public.facility_settings
  add column if not exists first_plan_generated_at timestamptz null;

comment on column public.facility_settings.first_plan_generated_at is
  'Zeitpunkt des ersten erfolgreichen Planlaufs (manuell oder Cron) mit mindestens einer erzeugten shift_assignments-Zeile. NULL = noch nie ein Plan erzeugt. Steuert zusammen mit auto_scheduling_enabled die Sichtbarkeit von "Dienstplan generieren" im Schichtplan.';
