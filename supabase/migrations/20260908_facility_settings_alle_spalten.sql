-- ============================================================================
-- 20260908 - facility_settings: alle Spalten nachziehen, die der Code erwartet
-- ============================================================================
--
-- Warum diese Datei existiert, obwohl es die einzelnen Migrationen schon gibt:
--
-- Die Einstellungsseite meldete "gespeichert" und war nach dem Neuladen wieder
-- leer - bei Standort, Sondertagen, Gleitzeit, Vertragsgrenzen, praktisch allem.
-- Ursache war nicht die Seite, sondern die Datenbank: Fehlt eine Spalte,
-- antwortet PostgREST mit PGRST204, und app/api/leitung/facility-settings
-- wirft die betroffenen Felder aus dem Upsert und speichert den Rest. Gedacht
-- war das als Notnagel fuer EINE frisch hinzugekommene Spalte. Fehlen zwei
-- Dutzend, wirft der Notnagel faktisch die komplette Eingabe weg.
--
-- Diese Datei fasst deshalb JEDE facility_settings-Spalte zusammen, die
-- app/api/leitung/facility-settings/route.ts liest oder schreibt. Sie ist
-- vollstaendig idempotent (add column if not exists) - auf einer Datenbank,
-- die schon alle Migrationen hat, aendert sie nichts. Sie ersetzt die einzelnen
-- Migrationsdateien NICHT: deren Indizes, Constraints, Backfills und eigene
-- Tabellen (shift_swap_requests, ppbv_records, ...) fehlen hier bewusst.
-- Sie repariert genau eine Sache - dass Einstellungen ins Leere laufen.
--
-- Reihenfolge: kann jederzeit laufen, auch vor oder nach den Einzelmigrationen.
-- ============================================================================

create table if not exists facility_settings (
  facility_name text primary key,
  updated_at timestamptz default now()
);

-- Basis: Standort-Pruefung beim Ein-/Ausstempeln, Pausen, Warnschwellen
alter table facility_settings add column if not exists geo_lat double precision;
alter table facility_settings add column if not exists geo_lng double precision;
alter table facility_settings add column if not exists check_in_radius_m integer not null default 300;
alter table facility_settings add column if not exists employee_sick_reporting_enabled boolean not null default true;
alter table facility_settings add column if not exists pause_threshold_minutes integer not null default 20;
alter table facility_settings add column if not exists understaffing_mode text not null default 'popup';
alter table facility_settings add column if not exists overtime_limit_pct integer not null default 20;

-- Planung
alter table facility_settings add column if not exists auto_scheduling_enabled boolean not null default false;
alter table facility_settings add column if not exists plan_lead_months integer not null default 2;
alter table facility_settings add column if not exists wish_deadline_days integer not null default 14;
alter table facility_settings add column if not exists allow_late_wishes boolean not null default true;
alter table facility_settings add column if not exists schedule_springer_enabled boolean not null default false;
alter table facility_settings add column if not exists overtime_rebalance_mode text not null default 'off';
alter table facility_settings add column if not exists shift_swap_mode text not null default 'manual';
alter table facility_settings add column if not exists fachkraft_quote numeric not null default 0.5;
alter table facility_settings add column if not exists auto_request_external_agencies boolean not null default false;

-- Standort + Sondertage (der gemeldete Fehler)
alter table facility_settings add column if not exists bundesland text;
alter table facility_settings add column if not exists ort text;
alter table facility_settings add column if not exists special_days jsonb not null default '[]'::jsonb;
alter table facility_settings add column if not exists special_days_learned_month text;

-- Lohn, Zuschlaege, Bereitschaft
alter table facility_settings add column if not exists auto_payroll_enabled boolean not null default false;
alter table facility_settings add column if not exists vacation_auto_approve boolean not null default false;
alter table facility_settings add column if not exists leaders_manage_vacation boolean not null default false;
alter table facility_settings add column if not exists leaders_manage_wishes boolean not null default false;
alter table facility_settings add column if not exists default_hourly_rate numeric;
alter table facility_settings add column if not exists default_break_min integer;
alter table facility_settings add column if not exists default_weekend_pct numeric;
alter table facility_settings add column if not exists default_holiday_pct numeric;
alter table facility_settings add column if not exists default_overtime_compensation text not null default 'payout';
alter table facility_settings add column if not exists overtime_hours_per_day numeric not null default 8;
alter table facility_settings add column if not exists oncall_pay_enabled boolean not null default false;
alter table facility_settings add column if not exists oncall_standby_pct numeric;
alter table facility_settings add column if not exists oncall_hours_per_day numeric;
alter table facility_settings add column if not exists oncall_work_pct numeric;

-- Vertragsgrenzen als Einrichtungs-Default (null = gesetzlicher Fallback)
alter table facility_settings add column if not exists default_max_shifts_per_week integer;
alter table facility_settings add column if not exists default_max_consecutive_days integer;
alter table facility_settings add column if not exists default_max_consecutive_nights integer;
alter table facility_settings add column if not exists default_max_hours_per_shift numeric;
alter table facility_settings add column if not exists default_min_rest_hours numeric;
alter table facility_settings add column if not exists default_break_after_minutes integer;
alter table facility_settings add column if not exists default_max_holiday_shifts_per_month integer;
alter table facility_settings add column if not exists default_min_days_off_per_week integer;

-- Gleitzeit (Migration 20260830)
alter table facility_settings add column if not exists flextime_enabled boolean not null default false;
alter table facility_settings add column if not exists flextime_max_days_per_week integer;
alter table facility_settings add column if not exists flextime_max_days_per_month integer;
alter table facility_settings add column if not exists flextime_codetermination_ack boolean not null default false;

-- Kontrolle: sollte 0 Zeilen liefern.
-- Zeigt jede Spalte, die der Code erwartet und die immer noch fehlt.
select c.name as fehlende_spalte
from (values
  ('geo_lat'),('geo_lng'),('check_in_radius_m'),('employee_sick_reporting_enabled'),
  ('pause_threshold_minutes'),('understaffing_mode'),('overtime_limit_pct'),
  ('auto_scheduling_enabled'),('plan_lead_months'),('wish_deadline_days'),
  ('allow_late_wishes'),('schedule_springer_enabled'),('overtime_rebalance_mode'),
  ('shift_swap_mode'),('fachkraft_quote'),('auto_request_external_agencies'),
  ('bundesland'),('ort'),('special_days'),('auto_payroll_enabled'),
  ('vacation_auto_approve'),('leaders_manage_vacation'),('leaders_manage_wishes'),
  ('default_hourly_rate'),('default_break_min'),('default_weekend_pct'),
  ('default_holiday_pct'),('default_overtime_compensation'),('overtime_hours_per_day'),
  ('oncall_pay_enabled'),('oncall_standby_pct'),('oncall_hours_per_day'),
  ('oncall_work_pct'),('default_max_shifts_per_week'),('default_max_consecutive_days'),
  ('default_max_consecutive_nights'),('default_max_hours_per_shift'),
  ('default_min_rest_hours'),('default_break_after_minutes'),
  ('default_max_holiday_shifts_per_month'),('default_min_days_off_per_week'),
  ('flextime_enabled'),('flextime_max_days_per_week'),('flextime_max_days_per_month'),
  ('flextime_codetermination_ack')
) as c(name)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'facility_settings'
    and column_name = c.name
);
