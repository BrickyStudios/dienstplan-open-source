-- Erweiterter Mitarbeiter-Anlege-Flow: E-Mail-Prefill, getrennte Namen,
-- Lohn-/Zuschlags-/Urlaubs-/Pausen-Presets sowie Zertifikats-Presets.
--
-- ALLE Spalten sind ADDITIV und optional. Der Code liest/schreibt sie defensiv
-- (retry ohne die Spalte bei 42703/PGRST204), damit Registrierung/Redeem auch
-- VOR dieser Migration weiter funktionieren. Bankverbindungen bleiben bewusst
-- AUSSCHLIESSLICH lokal (localStorage) — hier gibt es dafür KEINE Spalte.

-- ── invite_codes: Presets fürs Anlege-Wizard ─────────────────────────────────
alter table invite_codes add column if not exists preset_email text;
alter table invite_codes add column if not exists preset_first_name text;
alter table invite_codes add column if not exists preset_last_name text;
alter table invite_codes add column if not exists preset_weekend_pct numeric;
alter table invite_codes add column if not exists preset_holiday_pct numeric;
alter table invite_codes add column if not exists preset_vacation_days integer;
alter table invite_codes add column if not exists preset_break_min integer;
alter table invite_codes add column if not exists preset_certificates jsonb; -- [{cert_name, expiry_date}]

-- ── facility_staff: Zuschläge, Pause, Kontakt-E-Mail ─────────────────────────
alter table facility_staff add column if not exists weekend_pct numeric;
alter table facility_staff add column if not exists holiday_pct numeric;
alter table facility_staff add column if not exists break_min integer;
alter table facility_staff add column if not exists email text;

-- ── user_profiles: Kontakt-E-Mail (für die Leitung sichtbar) ─────────────────
-- vacation_days/vacation_bonus_days kommen aus 20260607_vacation_entitlement.
alter table user_profiles add column if not exists email text;

-- ── facility_settings: Standardwerte fürs Onboarding ─────────────────────────
-- default_hourly_rate existiert bereits (20260601).
alter table facility_settings add column if not exists default_break_min integer;
alter table facility_settings add column if not exists default_weekend_pct numeric;
alter table facility_settings add column if not exists default_holiday_pct numeric;
