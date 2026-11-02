-- 20260909_plan_vorlaufzeiten.sql
--
-- Vorlaufzeiten der Monats-Automatik, beide in TAGEN vor dem ersten Tag des geplanten
-- Monats — so, wie es im Onboarding und in den Einstellungen gefragt wird:
--
--   wish_reminder_days_before  Wie viele Tage vor dem neuen Monat werden die Mitarbeiter
--                              an Dienstwuensche und Urlaub erinnert?
--   plan_create_days_before    Wie viele Tage vor dem neuen Monat wird der Plan erstellt?
--
-- Warum neue Spalten und nicht die alten weiterbenutzt: plan_lead_months zaehlte in
-- MONATEN ab heute, wish_deadline_days in TAGEN vor einem daraus abgeleiteten
-- Erzeugungstag. Zusammen ergab "2 Monate Vorlauf, 14 Tage Frist" in Wahrheit "der Plan
-- entsteht am 17. des uebernaechsten Vormonats" — vorhersagen konnte das niemand.
--
-- Die alten Spalten bleiben stehen und werden NICHT geloescht: Sie sind der Rueckfall,
-- solange diese Migration nicht gelaufen ist (lib/scheduling/monats-automatik.ts rechnet
-- sie dann in dieselbe Tages-Sprache um). Nach dem Einspielen gewinnen die neuen Werte.
--
-- Idempotent (IF NOT EXISTS). Die Spalten sind bewusst NULLABLE ohne Default: NULL heisst
-- "nie eingestellt" und laesst den Code den Altbestand umrechnen. Ein Default wuerde jede
-- bestehende Einrichtung stillschweigend auf einen anderen Planungstag umstellen.

alter table public.facility_settings add column if not exists wish_reminder_days_before integer;
alter table public.facility_settings add column if not exists plan_create_days_before   integer;

-- Bestehende Einrichtungen mit aktiver Automatik auf ihren HEUTIGEN Planungstag umrechnen,
-- damit sich durch das Einspielen nichts verschiebt:
--   plan_create_days_before   = 30 * (plan_lead_months - 1) + wish_deadline_days
--   wish_reminder_days_before = plan_create_days_before + wish_deadline_days
-- (dieselbe Umrechnung wie loeseVorlaufzeiten() im Code). Nur dort, wo noch nichts steht.
update public.facility_settings
   set plan_create_days_before = least(120, greatest(1,
         30 * (coalesce(plan_lead_months, 2) - 1) + coalesce(wish_deadline_days, 14)))
 where plan_create_days_before is null;

update public.facility_settings
   set wish_reminder_days_before = least(180, greatest(plan_create_days_before + 1,
         plan_create_days_before + coalesce(wish_deadline_days, 14)))
 where wish_reminder_days_before is null
   and plan_create_days_before is not null;

notify pgrst, 'reload schema';

-- Kontrolle — zeigt je Einrichtung, wann erinnert und wann geplant wird:
--
--   select facility_name, auto_scheduling_enabled,
--          wish_reminder_days_before, plan_create_days_before,
--          plan_lead_months, wish_deadline_days
--     from public.facility_settings
--    order by facility_name;
