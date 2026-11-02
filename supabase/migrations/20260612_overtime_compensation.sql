-- Überstunden-Handling: Auszahlung oder Umwandlung in Urlaub.
-- Die Leitung legt im Onboarding einen Einrichtungs-Standard fest und kann ihn pro Mitarbeiter
-- überschreiben. Bei 'vacation' werden geleistete Überstunden beim Monatsabschluss der
-- Lohnabrechnung automatisch in Urlaubstage umgerechnet (Std → Tage über overtime_hours_per_day)
-- und dem Urlaubskonto (user_profiles.vacation_bonus_days) gutgeschrieben.
-- 20260612
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch. Einmal im Supabase
-- SQL-Editor ausführen. Ohne diese Spalten bleibt das Feature inert: alle Routen lesen/
-- schreiben defensiv (42703/PGRST204 → Standard 'payout', keine Umrechnung).
--
-- Code-Referenzen: app/api/leitung/staff, app/api/leitung/facility-settings,
--   app/api/onboarding/complete, app/api/leitung/lohnabrechnung (Umrechnung beim Finalisieren),
--   app/(app)/(leitung)/mitarbeiter, components/OnboardingWizard, app/(app)/einstellungen.

-- Einrichtungs-Standard
alter table facility_settings add column if not exists default_overtime_compensation text not null default 'payout';
alter table facility_settings add column if not exists overtime_hours_per_day numeric not null default 8;

-- Pro Mitarbeiter (überschreibt den Standard; null = Einrichtungs-Standard verwenden)
alter table facility_staff add column if not exists overtime_compensation text;
alter table facility_staff add column if not exists overtime_hours_per_day numeric;

-- Idempotenz + Transparenz der Auto-Umrechnung
alter table payroll_runs add column if not exists overtime_credited boolean not null default false;
alter table payroll_entries add column if not exists overtime_hours numeric not null default 0;
alter table payroll_entries add column if not exists overtime_vacation_days numeric not null default 0;

notify pgrst, 'reload schema';
