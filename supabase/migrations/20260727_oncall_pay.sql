-- Bereitschafts-/Rufbereitschafts-Vergütung.
--
-- Wer als Springer eingeplant ist (on_call_entries), bekommt die reine Bereitschaftszeit
-- — also die Zeit, in der er NICHT gerufen wurde — anteilig vom Stundenlohn vergütet
-- (oncall_standby_pct). Wird die Person tatsächlich gerufen, zählt diese Zeit ganz normal
-- als Arbeitszeit zum hinterlegten Stundenlohn; optional gibt es darauf zusätzlich einen
-- prozentualen Zuschlag (oncall_work_pct).
--
-- Alles defensiv + default aus: ohne gesetzte Werte rechnet die Lohnabrechnung exakt wie bisher.
alter table public.facility_settings
  add column if not exists oncall_pay_enabled boolean not null default false;
alter table public.facility_settings
  add column if not exists oncall_standby_pct numeric;      -- % des Stundenlohns je Bereitschaftsstunde ohne Einsatz
alter table public.facility_settings
  add column if not exists oncall_hours_per_day numeric;    -- Länge eines Bereitschaftsdienstes in Stunden
alter table public.facility_settings
  add column if not exists oncall_work_pct numeric;         -- zusätzlicher Zuschlag in % auf tatsächlich geleistete Einsatzstunden

-- Ausweis in der Lohnabrechnung: Bereitschaftsstunden (ohne Einsatz) + der daraus
-- resultierende Bruttobetrag (Bereitschaftsvergütung + Einsatz-Zuschlag).
alter table public.payroll_entries
  add column if not exists oncall_hours numeric;
alter table public.payroll_entries
  add column if not exists oncall_pay numeric;
