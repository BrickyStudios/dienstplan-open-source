-- Vertrags-/Arbeitszeit-Grenzen pro Mitarbeiter + Einrichtungs-Defaults.
-- Alles nullable & defensiv (IF NOT EXISTS) → bis zur Ausführung inert, Bestandskunden
-- bleiben unverändert. Auflösung im Planer: Mitarbeiter-Wert ?? Einrichtungs-Default ??
-- gesetzlicher Code-Fallback (lib/scheduling/generate-plan-core.ts).

-- ── Pro Mitarbeiter (facility_staff). NULL = Einrichtungs-Default verwenden. ──
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS max_shifts_per_week integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS max_consecutive_days integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS max_consecutive_nights integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS max_hours_per_shift numeric;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS min_rest_hours numeric;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS break_after_minutes integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS break_min integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS max_holiday_shifts_per_month integer;
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS min_days_off_per_week integer;
-- Darf der/die Mitarbeiter:in sonntags eingeplant werden? true = NICHT sonntags (harte Grenze).
ALTER TABLE public.facility_staff ADD COLUMN IF NOT EXISTS no_sunday_work boolean NOT NULL DEFAULT false;

-- ── Einrichtungs-Defaults (facility_settings). NULL = gesetzlicher Code-Fallback. ──
-- Im Onboarding-Schritt „Arbeitszeit-Grenzen" gesetzt, später in den Einstellungen änderbar.
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_max_shifts_per_week integer;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_max_consecutive_days integer;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_max_consecutive_nights integer;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_max_hours_per_shift numeric;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_min_rest_hours numeric;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_break_after_minutes integer;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_max_holiday_shifts_per_month integer;
ALTER TABLE public.facility_settings ADD COLUMN IF NOT EXISTS default_min_days_off_per_week integer;
-- default_break_min existiert bereits (20260601_staff_payroll_and_default_wage-Reihe).
