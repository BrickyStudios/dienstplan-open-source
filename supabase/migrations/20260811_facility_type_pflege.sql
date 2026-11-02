-- Einrichtungstyp: dritter Wert 'pflege' + expliziter Wert 'klinik'.
--
-- Warum: Bisher gab es nur 'station' (= „Krankenhaus/Heim mit PPBV") und 'praxis'.
-- Damit wurden Kliniken und vollstationäre Pflegeeinrichtungen unter PPBV
-- zusammengeworfen. Fachlich falsch:
--   • Krankenhaus → Pflegepersonalbemessungsverordnung (PPBV)
--   • Pflegeheim  → Personalbemessung nach § 113c SGB XI (PeBeM, seit 01.07.2023),
--                   nicht verpflichtend; verbindlich sind Personalmindestbestand und
--                   Fachkraftquote nach Landesrecht (NRW: WTG)
--   • Praxis      → keines von beidem
--
-- Kompatibilität: 'station' bleibt ein ERLAUBTER Wert und wird von lib/plan.ts
-- (normalizePlan) auf 'klinik' abgebildet. Bestehende Zeilen werden NICHT verändert,
-- ihr Verhalten bleibt exakt wie vorher. Neue Einrichtungen schreiben 'klinik' oder
-- 'pflege'.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.

-- ── 1) facility_settings.plan ───────────────────────────────────────────────────
-- (Spalte kommt ursprünglich aus 20260607_facility_plan.sql — hier defensiv wiederholt,
--  damit diese Datei auch alleine lauffähig ist.)
alter table public.facility_settings
  add column if not exists plan text not null default 'station';

-- Check-Constraint auf die vier erlaubten Werte setzen. Drop + Create, weil ein
-- bestehender Constraint die neuen Werte sonst weiter ablehnt.
alter table public.facility_settings
  drop constraint if exists facility_settings_plan_check;

alter table public.facility_settings
  add constraint facility_settings_plan_check
  check (plan in ('station', 'klinik', 'pflege', 'praxis'));

comment on column public.facility_settings.plan is
  'Einrichtungstyp: klinik (PPBV) | pflege (PeBeM § 113c SGB XI + Landesrecht) | praxis (kein Nachweis). ''station'' = Legacy-Alias für klinik.';

-- ── 2) invite_codes.plan ────────────────────────────────────────────────────────
-- Der Einrichtungstyp wird schon beim Anlegen des Demo-Codes festgelegt, damit die
-- Registrierung typgerecht seeden kann (Klinik: Stationen · Pflege: Wohnbereiche ·
-- Praxis: eine Einheit). NULL = wie bisher (Klinik).
alter table public.invite_codes
  add column if not exists plan text;

alter table public.invite_codes
  drop constraint if exists invite_codes_plan_check;

alter table public.invite_codes
  add constraint invite_codes_plan_check
  check (plan is null or plan in ('station', 'klinik', 'pflege', 'praxis'));

comment on column public.invite_codes.plan is
  'Einrichtungstyp, mit dem die Demo-Einrichtung angelegt wird. NULL ⇒ klinik.';
