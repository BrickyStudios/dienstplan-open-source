-- Nurvo Community Edition: Datenbankschema (nur Struktur). Einmal im SQL-Editor einer frischen Supabase-Datenbank ausführen.

set check_function_bodies = off;

set search_path = public, extensions;

-- Erweiterungen

create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- Aufzählungstypen

-- Sequenzen

-- Tabellen

create table public.admin_access_log (
  id uuid default gen_random_uuid() not null,
  admin_email text not null,
  facility_name text not null,
  reason text not null,
  accessed_at timestamp with time zone default now()
);

create table public.algorithm_runs (
  id uuid default gen_random_uuid() not null,
  facility_hash text not null,
  run_at timestamp with time zone default now(),
  week_start date not null,
  week_end date not null,
  total_slots integer default 0 not null,
  filled integer default 0 not null,
  unfilled integer default 0 not null,
  fill_rate double precision default 0 not null,
  staff_count integer default 0 not null,
  wish_count integer default 0 not null,
  burnout_warnings integer default 0 not null,
  unfilled_by_station jsonb,
  unfilled_by_type jsonb,
  is_demo boolean default false not null
);

create table public.analytics_events (
  id uuid default gen_random_uuid() not null,
  facility_name text,
  user_id text,
  session_id text,
  event_name text not null,
  page text,
  properties jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  time_to_first_action_ms integer
);

create table public.anbindung_belegung (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text not null,
  fall_schluessel text not null,
  seit timestamp with time zone not null,
  bis timestamp with time zone,
  aufenthalt text,
  quelle text default 'hl7'::text not null,
  anbindung_id uuid,
  aktualisiert_am timestamp with time zone default now() not null
);

create table public.anbindung_laeufe (
  id uuid default gen_random_uuid() not null,
  anbindung_id uuid not null,
  facility_name text not null,
  gestartet_am timestamp with time zone default now() not null,
  dauer_ms integer,
  status text not null,
  saetze integer default 0 not null,
  meldung text
);

create table public.anbindungen (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  katalog_id text not null,
  name text not null,
  weg text not null,
  aktiv boolean default true not null,
  konfig jsonb default '{}'::jsonb not null,
  geheimnis text,
  hl7_token_hash text,
  fall_salz text,
  kalender_token_hash text,
  letzter_lauf timestamp with time zone,
  letzter_status text,
  letzte_meldung text,
  erstellt_am timestamp with time zone default now() not null,
  erstellt_von text
);

create table public.auto_schedule_log (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  target_month text not null,
  action text not null,
  details text,
  created_at timestamp with time zone default now()
);

create table public.availability_entries (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  staff_name text not null,
  facility_name text not null,
  available_date date not null,
  shift_type text,
  note text,
  created_at timestamp with time zone default now()
);

create table public.bereich_members (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  bereich_id uuid not null,
  user_id uuid not null,
  staff_name text not null,
  created_at timestamp with time zone default now(),
  is_leader boolean default false not null
);

create table public.bereich_shift_assignments (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  shift_id uuid not null,
  user_id uuid,
  staff_name text not null,
  created_at timestamp with time zone default now()
);

create table public.bereich_shift_templates (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  bereich_id uuid not null,
  weekday smallint not null,
  start_time text,
  end_time text,
  label text,
  staff_needed integer default 1 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now()
);

create table public.bereich_shifts (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  bereich_id uuid not null,
  date date not null,
  start_time text,
  end_time text,
  label text,
  notes text,
  created_at timestamp with time zone default now(),
  planned_staff integer default 0 not null
);

create table public.bereich_tasks (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  bereich_id uuid not null,
  title text not null,
  room text,
  station text,
  building text,
  bed text,
  action text default 'reinigen'::text not null,
  priority text default 'normal'::text not null,
  status text default 'open'::text not null,
  created_by_name text,
  done_by_name text,
  created_at timestamp with time zone default now(),
  done_at timestamp with time zone,
  requires_signature boolean default false not null,
  signed_at timestamp with time zone,
  signed_by_name text,
  signature_text text,
  category_id uuid,
  category_name text,
  checklist jsonb,
  note text,
  code_id uuid,
  source text default 'manuell'::text not null
);

create table public.bereiche (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  name text not null,
  color text default '#64748b'::text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now(),
  shift_swap_enabled boolean,
  auto_plan_enabled boolean default true not null
);

create table public.burnout_scores (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  score_date date default CURRENT_DATE not null,
  computed_at timestamp with time zone default now() not null,
  window_days smallint default 28 not null,
  score smallint default 0 not null,
  band text default 'stabil'::text not null,
  total_shifts smallint default 0 not null,
  night_shifts smallint default 0 not null,
  weekend_shifts smallint default 0 not null,
  holiday_shifts smallint default 0 not null,
  max_consecutive_days smallint default 0 not null,
  short_rest_count smallint default 0 not null,
  overtime_pct smallint default 0 not null,
  rotation_changes smallint default 0 not null,
  short_break_shifts smallint default 0 not null,
  short_notice_shifts smallint default 0 not null,
  factors jsonb,
  trigger_source text
);

create table public.burnout_snapshots (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  snapshot_date date not null,
  risk_score integer not null,
  risk_level text not null,
  night_shifts_30d integer default 0,
  overtime_hours_30d numeric default 0,
  break_violations_30d integer default 0,
  consecutive_days integer default 0,
  created_at timestamp with time zone default now()
);

create table public.carriers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamp with time zone default now()
);

create table public.certificate_reminder_log (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  run_date date not null,
  action text not null,
  details text,
  created_at timestamp with time zone default now() not null
);

create table public.certificates (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  cert_type text not null,
  issued_at date not null,
  expires_at date not null,
  is_required boolean default true,
  document_url text,
  created_at timestamp with time zone default now()
);

create table public.checkin_tokens (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  facility text not null,
  token text default (gen_random_uuid())::text not null,
  issued_at timestamp with time zone default now() not null,
  used_at timestamp with time zone,
  expires_at timestamp with time zone default (now() + '28:00:00'::interval) not null,
  created_at timestamp with time zone default now()
);

create table public.compliance_reports (
  id uuid default gen_random_uuid() not null,
  facility_id uuid,
  period_start date not null,
  period_end date not null,
  total_shifts integer,
  compliant_shifts integer,
  violation_shifts integer,
  compliance_rate numeric,
  generated_at timestamp with time zone default now()
);

create table public.copilot_runs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  created_by text,
  freitext text not null,
  verstanden_als text,
  zusammenfassung text,
  zuteilungen jsonb default '[]'::jsonb not null,
  ausgeschlossen jsonb default '[]'::jsonb not null,
  befunde jsonb default '[]'::jsonb not null,
  umsetzbar boolean default false not null,
  korrekturrunden integer default 0 not null,
  uebermittelt_personen integer,
  uebermittelt_schichten integer,
  status text default 'vorgeschlagen'::text not null,
  uebernommen_at timestamp with time zone,
  uebernommen_von text,
  uebernommen_anzahl integer,
  benachrichtigt_anzahl integer,
  ai_provider text,
  ai_model text,
  is_demo boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.demo_bewertungen (
  id uuid default gen_random_uuid() not null,
  sterne integer not null,
  titel text default ''::text not null,
  text text default ''::text not null,
  name text default ''::text not null,
  funktion text default ''::text not null,
  einrichtung text default ''::text not null,
  einrichtungstyp text default ''::text not null,
  veroeffentlichung text default 'nein'::text not null,
  email text default ''::text not null,
  antworten jsonb default '{}'::jsonb not null,
  status text default 'neu'::text not null,
  user_id uuid,
  created_at timestamp with time zone default now() not null
);

create table public.demo_rate_limit (
  id uuid default gen_random_uuid() not null,
  ip text not null,
  created_at timestamp with time zone default now()
);

create table public.download_codes (
  id uuid default gen_random_uuid() not null,
  code text not null,
  description text,
  platform text default 'all'::text not null,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone,
  active boolean default true,
  user_id uuid,
  redeemed_at timestamp with time zone
);

create table public.emergency_plan_runs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  created_by text,
  freitext text not null,
  verstanden_als text,
  art text,
  zeitraum_von date,
  zeitraum_bis date,
  station text,
  zeitraum_begrenzt boolean default false not null,
  optionen jsonb default '[]'::jsonb not null,
  verworfene_anzahl integer default 0 not null,
  status text default 'vorgeschlagen'::text not null,
  ausgewaehlte_strategie text,
  ausgefuehrt_at timestamp with time zone,
  ausgefuehrt_von text,
  benachrichtigt_anzahl integer,
  ai_provider text,
  ai_model text,
  is_demo boolean default false not null,
  created_at timestamp with time zone default now() not null
);

create table public.external_agencies (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  name text not null,
  email text not null,
  phone text,
  notes text,
  active boolean default true not null,
  created_at timestamp with time zone default now()
);

create table public.external_agency_requests (
  id uuid default gen_random_uuid() not null,
  sick_report_id uuid not null,
  agency_id uuid not null,
  agency_name text not null,
  agency_email text not null,
  facility_name text not null,
  response_token text not null,
  status text default 'sent'::text not null,
  responder_name text,
  responder_phone text,
  responded_at timestamp with time zone,
  sent_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + '24:00:00'::interval) not null
);

create table public.facilities (
  id uuid default gen_random_uuid() not null,
  carrier_id uuid,
  name text not null,
  city text not null,
  address text,
  beds integer default 0,
  created_at timestamp with time zone default now(),
  carrier text default ''::text,
  contact_name text default ''::text,
  contact_email text default ''::text,
  plan text default 'professional'::text
);

create table public.facility_oncall_days (
  facility_name text not null,
  oncall_date date not null,
  enabled_by uuid,
  note text,
  created_at timestamp with time zone default now()
);

create table public.facility_settings (
  facility_name text not null,
  geo_lat double precision,
  geo_lng double precision,
  check_in_radius_m integer default 300 not null,
  updated_at timestamp with time zone default now(),
  employee_sick_reporting_enabled boolean default true,
  pause_threshold_minutes integer default 20 not null,
  understaffing_mode text default 'popup'::text not null,
  overtime_limit_pct integer default 20 not null,
  auto_scheduling_enabled boolean default false not null,
  plan_lead_months integer default 2 not null,
  wish_deadline_days integer default 14 not null,
  allow_late_wishes boolean default true not null,
  notification_email text,
  auto_request_external_agencies boolean default false not null,
  default_hourly_rate numeric,
  leaders_manage_vacation boolean default false not null,
  leaders_manage_wishes boolean default false not null,
  plan text default 'praxis'::text not null,
  default_break_min integer,
  default_weekend_pct numeric,
  default_holiday_pct numeric,
  default_overtime_compensation text default 'payout'::text not null,
  overtime_hours_per_day numeric default 8 not null,
  payroll_template jsonb,
  employee_availability_enabled boolean default true not null,
  schedule_springer_enabled boolean default false not null,
  shift_demand jsonb,
  overtime_rebalance_mode text default 'off'::text not null,
  shift_swap_mode text default 'manual'::text not null,
  fachkraft_quote numeric default 0.5 not null,
  shift_time_overrides jsonb,
  oncall_pay_enabled boolean default false not null,
  oncall_standby_pct numeric,
  oncall_hours_per_day numeric,
  oncall_work_pct numeric,
  doctor_demand jsonb,
  first_plan_generated_at timestamp with time zone,
  vacation_auto_approve boolean default false not null,
  flextime_enabled boolean default false not null,
  flextime_max_days_per_week integer,
  flextime_max_days_per_month integer,
  flextime_codetermination_ack boolean default false not null,
  debug_codes_enabled boolean default false,
  debug_codes_granted_at timestamp with time zone,
  debug_codes_granted_by text,
  bundesland text,
  ort text,
  special_days jsonb default '[]'::jsonb not null,
  special_days_learned_month text,
  auto_payroll_enabled boolean default false not null,
  default_max_shifts_per_week integer,
  default_max_consecutive_days integer,
  default_max_consecutive_nights integer,
  default_max_hours_per_shift numeric,
  default_min_rest_hours numeric,
  default_break_after_minutes integer,
  default_max_holiday_shifts_per_month integer,
  default_min_days_off_per_week integer,
  ai_monthly_planning_enabled boolean default false not null,
  wish_reminder_days_before integer,
  plan_create_days_before integer,
  require_2fa_leitung boolean default false not null,
  employee_late_reporting_enabled boolean default true not null,
  closed_slots jsonb,
  replacement_min jsonb,
  day_shift_times jsonb,
  selbstbedienung jsonb
);

create table public.facility_staff (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  full_name text not null,
  role text default 'Pflegekraft'::text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  job_type text default 'Vollzeit'::text,
  max_hours_per_week integer default 40,
  station text,
  department text,
  work_type text default 'shift'::text,
  phone text,
  user_id uuid,
  hourly_rate numeric,
  minijob_buffer_pct integer default 15,
  tax_class smallint default 1,
  church_tax boolean default false,
  children_count smallint default 0,
  weekend_pct numeric,
  holiday_pct numeric,
  break_min integer,
  email text,
  overtime_compensation text,
  overtime_hours_per_day numeric,
  max_shifts_per_week integer,
  max_consecutive_days integer,
  max_consecutive_nights integer,
  max_hours_per_shift numeric,
  min_rest_hours numeric,
  break_after_minutes integer,
  max_holiday_shifts_per_month integer,
  min_days_off_per_week integer,
  no_sunday_work boolean default false not null,
  qualifikation text,
  qualifikation_bestaetigt boolean default false not null,
  einsatz_stationen text[] default '{}'::text[] not null,
  dienstplanung text
);

create table public.feedback_answers (
  id uuid default gen_random_uuid() not null,
  context text default 'app'::text not null,
  answers jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now()
);

create table public.feedback_interests (
  id uuid default gen_random_uuid() not null,
  context text default 'app'::text not null,
  email text default ''::text not null,
  message text default ''::text not null,
  facility text default ''::text,
  handled boolean default false not null,
  created_at timestamp with time zone default now()
);

create table public.flextime_requests (
  id uuid default gen_random_uuid() not null,
  staff_id uuid not null,
  facility_name text not null,
  from_date date not null,
  to_date date not null,
  days integer default 1 not null,
  hours numeric default 0 not null,
  reason text,
  status text default 'pending'::text not null,
  review_note text,
  submitted_at timestamp with time zone default now() not null,
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

create table public.gespraech_google_konten (
  id uuid default gen_random_uuid() not null,
  google_email text not null,
  kalender_id text default 'primary'::text not null,
  refresh_token text not null,
  zugriff_token text,
  zugriff_bis timestamp with time zone,
  zuletzt_abgeglichen timestamp with time zone,
  letzter_fehler text,
  verbunden_am timestamp with time zone default now() not null,
  verbunden_von text
);

create table public.gespraech_sperrzeiten (
  id uuid default gen_random_uuid() not null,
  von_datum date not null,
  bis_datum date not null,
  von_zeit time without time zone,
  bis_zeit time without time zone,
  grund text,
  herkunft text default 'hand'::text not null,
  quell_id text,
  erstellt_am timestamp with time zone default now() not null,
  erstellt_von text
);

create table public.gespraechs_termine (
  id uuid default gen_random_uuid() not null,
  datum date not null,
  zeit time without time zone not null,
  name text not null,
  email text not null,
  einrichtung text not null,
  telefon text,
  nachricht text,
  status text default 'angefragt'::text not null,
  token_hash text not null,
  beantwortet_am timestamp with time zone,
  beantwortet_von text,
  absage_grund text,
  quelle text default 'startseite'::text,
  erstellt_am timestamp with time zone default now() not null,
  kontaktweg text
);

create table public.invite_codes (
  id uuid default gen_random_uuid() not null,
  code text not null,
  role text not null,
  facility_id uuid,
  facility_name text not null,
  created_by text not null,
  used boolean default false,
  used_by uuid,
  used_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  preset_password text,
  invited_email text,
  preset_name text,
  session_hours integer default 48,
  preset_station text,
  preset_job_type text default 'Vollzeit'::text,
  preset_max_hours integer default 40,
  preset_hourly_rate numeric(6,2),
  preset_minijob_buffer integer default 15,
  preset_phone text,
  preset_email text,
  preset_first_name text,
  preset_last_name text,
  preset_weekend_pct numeric,
  preset_holiday_pct numeric,
  preset_vacation_days integer,
  preset_break_min integer,
  preset_certificates jsonb,
  plan text,
  preset_station_secondary text,
  preset_role text
);

create table public.ip_sperren (
  ip text not null,
  grund text not null,
  gesperrt_am timestamp with time zone default now() not null,
  gesperrt_bis timestamp with time zone,
  anzahl_sperren integer default 1 not null,
  von text default 'automatisch'::text not null,
  aufgehoben_am timestamp with time zone,
  aufgehoben_von text
);

create table public.ki_monthly_adjustment_runs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  zeitraum_von date not null,
  zeitraum_bis date not null,
  sonder_tage jsonb default '[]'::jsonb not null,
  vorschlaege jsonb default '[]'::jsonb not null,
  verworfene_anzahl integer default 0 not null,
  zusammenfassung text,
  status text default 'vorgeschlagen'::text not null,
  source text default 'manuell'::text not null,
  ai_provider text,
  ai_model text,
  is_demo boolean default false not null,
  created_at timestamp with time zone default now() not null,
  entschieden_von text,
  entschieden_at timestamp with time zone
);

create table public.ki_plan_recommendations (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  analyzed_year smallint,
  analyzed_month smallint,
  summary text,
  recommendations jsonb default '[]'::jsonb not null,
  notes text,
  status text default 'pending'::text not null,
  effective_label text,
  source text default 'cron'::text not null,
  created_at timestamp with time zone default now(),
  decided_at timestamp with time zone,
  decided_by text
);

create table public.konto_anmeldungen (
  sitzung_id uuid not null,
  user_id uuid not null,
  erstellt_am timestamp with time zone default now() not null,
  ip text,
  land text,
  region text,
  stadt text,
  user_agent text,
  geraet text not null,
  neu boolean default false not null,
  gemeldet boolean default false not null
);

create table public.leitung_einrichtungen (
  user_id uuid not null,
  facility_name text not null,
  onboarding_completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table public.mitarbeiter_kalender (
  user_id uuid not null,
  facility_name text not null,
  token_hash text not null,
  erstellt_am timestamp with time zone default now() not null,
  letzter_abruf timestamp with time zone
);

create table public.mitarbeiter_rechte (
  facility_name text not null,
  user_id uuid not null,
  rechte text[] default '{}'::text[] not null,
  selbstbedienung jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text
);

create table public.nichterscheinen (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  shift_id uuid not null,
  staff_id uuid,
  staff_name text not null,
  datum date not null,
  schicht text,
  station text,
  status text not null,
  notiz text,
  entschieden_von text,
  entschieden_am timestamp with time zone default now() not null
);

create table public.notfall_ausloesungen (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  vorlage_id uuid,
  titel text not null,
  ausgeloest_von text not null,
  ausgeloest_von_rolle text not null,
  empfaenger jsonb default '[]'::jsonb not null,
  empfaenger_anzahl integer default 0 not null,
  erreicht_anzahl integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table public.notfall_berechtigte (
  facility_name text not null,
  user_id uuid not null,
  erteilt_von text,
  created_at timestamp with time zone default now() not null
);

create table public.notfall_rueckmeldungen (
  id uuid default gen_random_uuid() not null,
  ausloesung_id uuid not null,
  facility_name text not null,
  user_id uuid not null,
  staff_name text not null,
  created_at timestamp with time zone default now() not null
);

create table public.notfall_vorlagen (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  titel text not null,
  situation text default ''::text not null,
  stunden integer default 12 not null,
  station text,
  nachricht_eingeplant text,
  nachricht_bereitschaft text,
  nachricht_frei text,
  ki_entwurf boolean default false not null,
  erstellt_von text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  rueckmeldung boolean default false not null
);

create table public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  facility_name text not null,
  title text not null,
  message text not null,
  read boolean default false,
  created_at timestamp with time zone default now()
);

create table public.nurvo_admins (
  id uuid default gen_random_uuid() not null,
  name text not null,
  email text not null,
  added_by text,
  created_at timestamp with time zone default now()
);

create table public.on_call_entries (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  staff_name text not null,
  facility_name text not null,
  on_call_date date not null,
  shift_type text,
  created_at timestamp with time zone default now(),
  source text
);

create table public.overtime_rebalance_suggestions (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,
  shift_id uuid not null,
  shift_date date not null,
  action text not null,
  replacement_staff_id uuid,
  replacement_staff_name text,
  reason text,
  overtime_hours numeric,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone
);

create table public.payroll_entries (
  id uuid default gen_random_uuid() not null,
  run_id uuid not null,
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,
  job_type text,
  tax_class smallint default 1,
  hours_worked numeric default 0 not null,
  hourly_rate numeric,
  gross_pay numeric default 0 not null,
  kv_employee numeric default 0 not null,
  pv_employee numeric default 0 not null,
  rv_employee numeric default 0 not null,
  av_employee numeric default 0 not null,
  lohnsteuer numeric default 0 not null,
  kirchensteuer numeric default 0 not null,
  soli numeric default 0 not null,
  net_pay numeric default 0 not null,
  notes text,
  created_at timestamp with time zone default now(),
  overtime_hours numeric default 0 not null,
  overtime_vacation_days numeric default 0 not null,
  training_hours numeric default 0 not null,
  oncall_hours numeric,
  oncall_pay numeric,
  vacation_days numeric default 0 not null,
  vacation_hours numeric default 0 not null,
  flextime_days numeric default 0 not null,
  flextime_hours numeric default 0 not null,
  banked_hours numeric default 0 not null
);

create table public.payroll_runs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  month smallint not null,
  year smallint not null,
  status text default 'draft'::text not null,
  generated_by text,
  created_at timestamp with time zone default now(),
  overtime_credited boolean default false not null
);

create table public.personalakte (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  full_name text not null,
  geburtsdatum date,
  geburtsort text,
  geburtsname text,
  staatsangehoerigkeit text,
  strasse text,
  plz text,
  ort text,
  telefon_privat text,
  email_privat text,
  notfallkontakt text,
  steuer_id_enc text,
  sv_nummer_enc text,
  krankenkasse text,
  taetigkeit text,
  eintritt date,
  probezeit_bis date,
  befristet_bis date,
  austritt date,
  austrittsgrund text,
  wochenstunden numeric(5,2),
  urlaubstage_vertrag integer,
  kuendigungsfrist text,
  erinnert jsonb default '[]'::jsonb not null,
  geaendert_am timestamp with time zone default now() not null,
  geaendert_von text
);

create table public.personalakte_eintraege (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  art text not null,
  datum date not null,
  titel text not null,
  notiz text,
  wiedervorlage date,
  wiedervorlage_erinnert date,
  dokument_pfad text,
  dokument_name text,
  dokument_typ text,
  dokument_bytes integer,
  erstellt_von text,
  erstellt_am timestamp with time zone default now() not null,
  kenntnis_angefordert boolean default false not null,
  kenntnis_am timestamp with time zone,
  kenntnis_von text,
  datum_bis date,
  grund text
);

create table public.personalakte_protokoll (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  wer text not null,
  rolle text not null,
  aktion text not null,
  details text,
  am timestamp with time zone default now() not null
);

create table public.personalakte_verlauf (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  feld text not null,
  alt text,
  neu text,
  verschluesselt boolean default false not null,
  wer text not null,
  am timestamp with time zone default now() not null
);

create table public.platform_settings (
  id boolean default true not null,
  web_app_enabled boolean default true not null,
  updated_at timestamp with time zone default now(),
  updated_by text
);

create table public.ppbv_einstufung (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text not null,
  datum date not null,
  patienten integer not null,
  isolation integer default 0 not null,
  aufnahmen integer default 0 not null,
  neugeborene integer default 0 not null,
  gruppen jsonb default '{}'::jsonb not null,
  entlassen jsonb default '{}'::jsonb not null,
  quelle text default 'csv'::text not null,
  importiert_von uuid,
  importiert_am timestamp with time zone default now() not null
);

create table public.ppbv_records (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text not null,
  year smallint not null,
  month smallint not null,
  shifts_count integer default 0 not null,
  planned_sum integer default 0 not null,
  actual_sum integer default 0 not null,
  understaffed_count integer default 0 not null,
  fulfilled_shifts integer default 0 not null,
  compliance_pct integer default 0 not null,
  shift_quote_pct integer default 0 not null,
  by_type jsonb,
  generated_at timestamp with time zone default now() not null,
  generated_by text,
  source text default 'manuell'::text not null,
  generated_by_user_id uuid
);

create table public.roadmap_items (
  id uuid default gen_random_uuid() not null,
  category text not null,
  icon text default 'flag'::text not null,
  title text not null,
  description text,
  status text default 'planned'::text not null,
  delayed boolean default false not null,
  sort integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text
);

create table public.schicht_belegung (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text not null,
  datum date not null,
  schicht text not null,
  patienten integer not null,
  hoechststand integer not null,
  zugaenge integer default 0 not null,
  abgaenge integer default 0 not null,
  quelle text default 'station'::text not null,
  geaendert_von uuid,
  geaendert_von_name text,
  geaendert_am timestamp with time zone default now() not null,
  aenderungen integer default 1 not null
);

create table public.shift_assignments (
  id uuid default gen_random_uuid() not null,
  shift_id uuid,
  staff_id uuid,
  status text default 'confirmed'::text,
  is_springer boolean default false,
  created_at timestamp with time zone default now(),
  staff_name text,
  facility_name text,
  is_overtime boolean default false not null,
  understaffing_decision text
);

create table public.shift_difficulty_ratings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  facility text not null,
  station text,
  shift_date date not null,
  shift_type text,
  rating integer not null,
  note text,
  time_entry_id uuid,
  rated_at timestamp with time zone default now() not null
);

create table public.shift_release_offers (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  release_id uuid not null,
  staff_id uuid not null,
  rang smallint default 0 not null,
  score smallint,
  status text default 'offen'::text not null,
  frist timestamp with time zone not null,
  created_at timestamp with time zone default now() not null,
  decided_at timestamp with time zone
);

create table public.shift_release_requests (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  shift_id uuid not null,
  shift_date date not null,
  shift_type text not null,
  station text,
  reason text not null,
  status text default 'sucht_ersatz'::text not null,
  ersatz_noetig boolean,
  luecke smallint,
  uebernommen_von uuid,
  diagnose jsonb,
  created_at timestamp with time zone default now() not null,
  leitung_decided_at timestamp with time zone,
  resolved_at timestamp with time zone
);

create table public.shift_reports (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_id uuid not null,
  time_entry_id uuid not null,
  shift_id uuid,
  shift_date date not null,
  station text,
  planned_start timestamp with time zone,
  planned_end timestamp with time zone,
  actual_start timestamp with time zone not null,
  actual_end timestamp with time zone,
  late_minutes integer,
  early_leave_minutes integer,
  is_late boolean default false not null,
  left_early boolean default false not null,
  tolerance_minutes smallint default 5 not null,
  planned_minutes integer,
  actual_minutes integer,
  pause_minutes integer default 0 not null,
  required_pause_minutes integer default 0 not null,
  pause_compliant boolean,
  rest_hours_before numeric(6,2),
  rest_compliant boolean,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.shift_swap_requests (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  requester_staff_id uuid not null,
  requester_staff_name text not null,
  requester_shift_id uuid not null,
  requester_shift_date date not null,
  requester_shift_type text not null,
  target_staff_id uuid not null,
  target_staff_name text not null,
  target_shift_id uuid not null,
  target_shift_date date not null,
  target_shift_type text not null,
  reason text not null,
  mode text not null,
  status text default 'pending_leitung'::text not null,
  leitung_decided_at timestamp with time zone,
  colleague_decided_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  resolved_at timestamp with time zone
);

create table public.shift_templates (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  name text not null,
  start_time text not null,
  end_time text not null,
  color text default '#3b82f6'::text not null,
  sort_order integer default 0 not null,
  created_at timestamp with time zone default now()
);

create table public.shifts (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text default 'Station 1'::text not null,
  date date not null,
  shift_type text not null,
  planned_staff integer default 0 not null,
  actual_staff integer default 0 not null,
  notes text default ''::text,
  created_at timestamp with time zone default now(),
  start_time text,
  end_time text
);

create table public.sicherheits_ereignisse (
  id bigint generated always as identity not null,
  erstellt_am timestamp with time zone default now() not null,
  ip text not null,
  land text,
  region text,
  stadt text,
  art text not null,
  schwere text not null,
  punkte integer default 0 not null,
  methode text,
  pfad text,
  user_agent text,
  details jsonb default '{}'::jsonb not null,
  hat_gesperrt boolean default false not null,
  gemeldet boolean default false not null
);

create table public.sick_reports (
  id uuid default gen_random_uuid() not null,
  reporter_user_id uuid not null,
  sick_user_id uuid not null,
  sick_staff_name text not null,
  facility_name text not null,
  station text,
  sick_date date not null,
  shift_type text,
  note text,
  status text default 'open'::text,
  reported_by_leitung boolean default false,
  created_at timestamp with time zone default now(),
  request_replacement boolean
);

create table public.simulator_runs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  target_month text not null,
  seed integer not null,
  kind text default 'run'::text not null,
  stats jsonb default '{}'::jsonb not null,
  log text,
  created_by text,
  created_at timestamp with time zone default now() not null
);

create table public.springer_contacts (
  id uuid default gen_random_uuid() not null,
  sick_report_id uuid,
  contacted_staff_name text not null,
  contacted_user_id uuid,
  contact_reason text not null,
  contact_order integer not null,
  status text default 'pending'::text,
  contacted_at timestamp with time zone default now(),
  responded_at timestamp with time zone,
  response_note text
);

create table public.springer_oncall (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  staff_name text not null,
  staff_user_id uuid,
  oncall_date date not null,
  shift_type text,
  created_at timestamp with time zone default now()
);

create table public.springer_requests (
  id uuid default gen_random_uuid() not null,
  requesting_facility_id uuid,
  shift_id uuid,
  required_qualification text,
  status text default 'open'::text,
  matched_staff_id uuid,
  offering_facility_id uuid,
  notes text,
  created_at timestamp with time zone default now()
);

create table public.staff (
  id uuid default gen_random_uuid() not null,
  facility_id uuid,
  station_id uuid,
  name text not null,
  role text not null,
  email text,
  phone text,
  is_springer boolean default false,
  active boolean default true,
  created_at timestamp with time zone default now()
);

create table public.staff_availability (
  id uuid default gen_random_uuid() not null,
  staff_id uuid not null,
  facility_name text not null,
  day_of_week smallint not null,
  available boolean default true not null,
  from_time text,
  to_time text,
  created_at timestamp with time zone default now()
);

create table public.staff_certificates (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  full_name text not null,
  facility text not null,
  cert_name text not null,
  cert_type text not null,
  issued_date date,
  expiry_date date,
  created_at timestamp with time zone default now(),
  reminder_stage text,
  last_reminded_at timestamp with time zone
);

create table public.staff_wishes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  facility_name text not null,
  full_name text not null,
  date_from date,
  date_to date,
  shift_type text default 'all'::text,
  wish_type text default 'preference'::text not null,
  message text not null,
  status text default 'offen'::text,
  created_at timestamp with time zone default now()
);

create table public.staffing_needs (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station text not null,
  shift_type text not null,
  headcount integer default 1 not null,
  avg_gap numeric,
  understaffed_ratio numeric,
  sample_count integer,
  status text default 'offen'::text not null,
  note text,
  decided_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.station_leaders (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station_name text not null,
  user_id uuid not null,
  staff_name text not null,
  created_at timestamp with time zone default now()
);

create table public.station_tasks (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  station_name text not null,
  title text not null,
  room text,
  building text,
  bed text,
  action text default 'reinigen'::text not null,
  priority text default 'normal'::text not null,
  status text default 'open'::text not null,
  created_by_name text,
  done_by_name text,
  created_at timestamp with time zone default now(),
  done_at timestamp with time zone,
  requires_signature boolean default false not null,
  signed_at timestamp with time zone,
  signed_by_name text,
  signature_text text,
  category_id uuid,
  category_name text,
  checklist jsonb,
  note text,
  code_id uuid,
  source text default 'manuell'::text not null
);

create table public.stations (
  id uuid default gen_random_uuid() not null,
  facility_id uuid,
  name text not null,
  care_type text,
  ppbv_min_staff integer default 3,
  created_at timestamp with time zone default now(),
  facility_name text default ''::text not null,
  sort_order integer default 0 not null,
  color text default '#64748b'::text not null,
  archived boolean default false not null,
  station_type text default 'Pflegestation'::text not null,
  shift_swap_enabled boolean,
  ppbv_exempt boolean default false not null,
  betten integer,
  standort text,
  ppug_grenze_tag numeric(5,2),
  ppug_grenze_nacht numeric(5,2)
);

create table public.support_messages (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  user_name text not null,
  user_email text not null,
  facility text default ''::text,
  message text not null,
  reply text,
  replied_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  closed boolean default false,
  closed_at timestamp with time zone,
  is_demo_request boolean default false,
  contact_name text,
  contact_email_public text,
  contact_facility text,
  contact_role text,
  contact_phone text
);

create table public.task_categories (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  name text not null,
  scope text default 'both'::text not null,
  default_action text default 'reinigen'::text not null,
  requires_signature boolean default false not null,
  checklist jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now(),
  bereich_id uuid,
  active boolean default true not null
);

create table public.task_codes (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  code text not null,
  label text,
  station text,
  room text,
  bed text,
  building text,
  location_hint text,
  bereich_id uuid,
  allowed_category_ids jsonb default '[]'::jsonb not null,
  active boolean default true not null,
  created_at timestamp with time zone default now(),
  created_by_name text,
  last_scan_at timestamp with time zone,
  scan_count integer default 0 not null
);

create table public.time_entries (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  user_name text,
  facility text not null,
  station text,
  check_in timestamp with time zone default now() not null,
  check_out timestamp with time zone,
  duration_minutes integer,
  location_verified boolean default false,
  latitude double precision,
  longitude double precision,
  checkout_location_verified boolean default false,
  checkout_latitude double precision,
  checkout_longitude double precision,
  paused_at timestamp with time zone,
  total_pause_minutes integer default 0,
  required_break_minutes integer,
  break_compliant boolean
);

create table public.training_attendees (
  id uuid default gen_random_uuid() not null,
  training_id uuid not null,
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,
  created_at timestamp with time zone default now()
);

create table public.trainings (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  station text,
  paid boolean default true not null,
  notes text,
  created_by text,
  created_at timestamp with time zone default now()
);

create table public.user_devices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  device_id text not null,
  device_name text,
  first_seen timestamp with time zone default now(),
  last_seen timestamp with time zone default now()
);

create table public.user_profiles (
  id uuid not null,
  full_name text not null,
  role text not null,
  facility text,
  station_id uuid,
  staff_id uuid,
  avatar_url text,
  created_at timestamp with time zone default now(),
  archived boolean default false,
  station text default ''::text,
  station_secondary text default ''::text,
  department text,
  work_type text default 'shift'::text,
  demo_expires_at timestamp with time zone,
  demo_ai_calls integer default 0,
  download_platform text,
  onboarding_completed_at timestamp with time zone,
  payroll_auto boolean default false not null,
  vacation_days integer default 30 not null,
  vacation_bonus_days integer default 0 not null,
  phone text,
  email text,
  recovery_phrase_hash text,
  recovery_phrase_set_at timestamp with time zone,
  recovery_phrase_updated_by text,
  br_informed_ack_at timestamp with time zone,
  flextime_hours numeric default 0 not null
);

create table public.vacation_requests (
  id uuid default gen_random_uuid() not null,
  staff_id uuid,
  facility_id uuid,
  from_date date not null,
  to_date date not null,
  days integer not null,
  reason text,
  note text,
  status text default 'pending'::text,
  reviewed_by uuid,
  review_note text,
  submitted_at timestamp with time zone default now(),
  reviewed_at timestamp with time zone
);

create table public.verspaetungen (
  id uuid default gen_random_uuid() not null,
  facility_name text not null,
  user_id uuid not null,
  staff_name text not null,
  datum date not null,
  schicht text,
  minuten integer,
  notiz text,
  created_at timestamp with time zone default now() not null
);

-- Funktionen

CREATE OR REPLACE FUNCTION public.execute_shift_swap(p_facility text, p_requester_shift uuid, p_target_shift uuid, p_requester_staff uuid, p_target_staff uuid, p_requester_name text, p_target_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  r_id uuid; r_sid uuid; r_name text;
  t_id uuid; t_sid uuid; t_name text;
begin
  select id, staff_id, staff_name into r_id, r_sid, r_name
    from shift_assignments
   where facility_name = p_facility
     and shift_id = p_requester_shift
     and coalesce(status, 'confirmed') <> 'cancelled'
     and ((staff_id is not null and staff_id = p_requester_staff) or staff_name = p_requester_name)
   order by (staff_id is not distinct from p_requester_staff) desc
   limit 1
   for update;
  if r_id is null then
    return jsonb_build_object('ok', false, 'reason', 'requester_missing');
  end if;

  select id, staff_id, staff_name into t_id, t_sid, t_name
    from shift_assignments
   where facility_name = p_facility
     and shift_id = p_target_shift
     and coalesce(status, 'confirmed') <> 'cancelled'
     and ((staff_id is not null and staff_id = p_target_staff) or staff_name = p_target_name)
   order by (staff_id is not distinct from p_target_staff) desc
   limit 1
   for update;
  if t_id is null then
    return jsonb_build_object('ok', false, 'reason', 'target_missing');
  end if;

  update shift_assignments set staff_id = t_sid, staff_name = t_name where id = r_id;
  update shift_assignments set staff_id = r_sid, staff_name = r_name where id = t_id;
  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_facility()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT facility FROM public.user_profiles WHERE id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.konto_anmeldung_festhalten(p_sitzung uuid, p_user uuid, p_ip text, p_land text, p_region text, p_stadt text, p_user_agent text, p_geraet text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  eingetragen boolean := false;
  frueher     boolean;
  bekannt     boolean;
  ist_neu     boolean := false;
  mail        boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('konto:' || p_user::text));

  select exists (
    select 1 from konto_anmeldungen
     where user_id = p_user and sitzung_id <> p_sitzung
  ) into frueher;

  select exists (
    select 1 from konto_anmeldungen
     where user_id = p_user
       and sitzung_id <> p_sitzung
       and geraet = p_geraet
       and coalesce(land, '') = coalesce(p_land, '')
  ) into bekannt;

  ist_neu := frueher and not bekannt;

  if ist_neu then
    select count(*) < 3 into mail
      from konto_anmeldungen
     where user_id = p_user and gemeldet
       and erstellt_am > now() - interval '1 day';
  end if;

  insert into konto_anmeldungen
    (sitzung_id, user_id, ip, land, region, stadt, user_agent,
     geraet, neu, gemeldet)
  values
    (p_sitzung, p_user, left(p_ip, 64), left(p_land, 8),
     left(p_region, 64), left(p_stadt, 128), left(p_user_agent, 500),
     left(p_geraet, 100), ist_neu, mail)
  on conflict (sitzung_id) do nothing;

  eingetragen := found;
  if not eingetragen then
    ist_neu := false;
    mail := false;
  end if;

  if random() < 0.01 then
    delete from konto_anmeldungen
     where erstellt_am < now() - interval '180 days';
  end if;

  return jsonb_build_object(
    'eingetragen', eingetragen,
    'neu', ist_neu,
    'mail_faellig', mail
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.nurvo_sitzungen(ziel uuid)
 RETURNS TABLE(id uuid, erstellt timestamp with time zone, zuletzt timestamp with time zone, aal text, geraet text, ip text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
  select
    s.id,
    s.created_at as erstellt,
    s.updated_at as zuletzt,
    coalesce(s.aal::text, 'aal1') as aal,
    s.user_agent as geraet,
    host(s.ip)::text as ip
  from auth.sessions s
  where s.user_id = ziel
  order by s.updated_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.nurvo_sitzungen_beenden(ziel uuid, ausser uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
declare
  anzahl integer;
begin
  delete from auth.sessions s
  where s.user_id = ziel
    and (ausser is null or s.id <> ausser);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rate_limit_pruefen(p_key text, p_fenster_sekunden integer, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  vorher integer;
begin
  -- Serialisiert gleichzeitige Läufe für genau diesen Schlüssel. Endet mit der Transaktion.
  perform pg_advisory_xact_lock(hashtext(p_key));

  select count(*) into vorher
    from demo_rate_limit
   where ip = p_key
     and created_at >= now() - make_interval(secs => p_fenster_sekunden);

  if vorher >= p_limit then
    return jsonb_build_object('erlaubt', false, 'anzahl', vorher);
  end if;

  insert into demo_rate_limit (ip) values (p_key);

  -- Aufräumen, doppelt so weit zurück wie das Fenster — und nur für diesen Schlüssel.
  delete from demo_rate_limit
   where ip = p_key
     and created_at < now() - make_interval(secs => p_fenster_sekunden * 2);

  return jsonb_build_object('erlaubt', true, 'anzahl', vorher + 1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_shift_assignments(p_facility text, p_shift_ids uuid[], p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  n integer;
begin
  delete from shift_assignments
   where facility_name = p_facility
     and shift_id = any(p_shift_ids);

  insert into shift_assignments
    (shift_id, facility_name, staff_id, staff_name, status, is_overtime, understaffing_decision, is_springer)
  select r.shift_id, p_facility, r.staff_id, r.staff_name,
         coalesce(r.status, 'confirmed'), coalesce(r.is_overtime, false),
         r.understaffing_decision, coalesce(r.is_springer, false)
    from jsonb_to_recordset(p_rows) as r(
           shift_id uuid, staff_id uuid, staff_name text, status text,
           is_overtime boolean, understaffing_decision text, is_springer boolean)
   where r.shift_id = any(p_shift_ids);

  get diagnostics n = row_count;
  return n;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sicherheit_ereignis_melden(p_ip text, p_land text, p_region text, p_stadt text, p_art text, p_schwere text, p_punkte integer, p_methode text, p_pfad text, p_user_agent text, p_details jsonb, p_schwelle integer, p_fenster_sekunden integer, p_erlaubt boolean, p_mail_wunsch boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  neue_id      bigint;
  sperre       ip_sperren%rowtype;
  aktiv        boolean := false;
  ab           timestamptz;
  summe        integer;
  neu_gesperrt boolean := false;
  bis          timestamptz;
  mail         boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('sicherheit:' || p_ip));

  insert into sicherheits_ereignisse
    (ip, land, region, stadt, art, schwere, punkte, methode, pfad, user_agent, details)
  values
    (left(p_ip, 64), left(p_land, 8), left(p_region, 64), left(p_stadt, 128), left(p_art, 64),
     p_schwere, greatest(p_punkte, 0), left(p_methode, 16), left(p_pfad, 500),
     left(p_user_agent, 500), coalesce(p_details, '{}'::jsonb))
  returning id into neue_id;

  select * into sperre from ip_sperren where ip = p_ip;
  if found then
    aktiv := sperre.aufgehoben_am is null
         and (sperre.gesperrt_bis is null or sperre.gesperrt_bis > now());
  end if;

  ab := greatest(now() - make_interval(secs => p_fenster_sekunden),
                 coalesce(sperre.aufgehoben_am, '-infinity'::timestamptz));

  select coalesce(sum(punkte), 0) into summe
    from sicherheits_ereignisse
   where ip = p_ip and erstellt_am >= ab;

  if not aktiv and not p_erlaubt and p_ip <> 'unknown' and summe >= p_schwelle then
    -- Erstes Mal 24 Stunden, jedes weitere Mal sieben Tage.
    bis := now() + case when sperre.ip is null then interval '24 hours' else interval '7 days' end;

    insert into ip_sperren (ip, grund, gesperrt_am, gesperrt_bis, anzahl_sperren, von)
    values (p_ip, left(p_art, 64), now(), bis, 1, 'automatisch')
    on conflict (ip) do update
      set grund = excluded.grund,
          gesperrt_am = now(),
          gesperrt_bis = excluded.gesperrt_bis,
          anzahl_sperren = ip_sperren.anzahl_sperren + 1,
          von = 'automatisch',
          aufgehoben_am = null,
          aufgehoben_von = null;

    update sicherheits_ereignisse set hat_gesperrt = true where id = neue_id;
    neu_gesperrt := true;
    aktiv := true;
  end if;

  -- Eine neue Sperre wird immer gemeldet (sie ist selten und will gesehen werden); alles
  -- andere höchstens einmal je IP und Stunde. Die Obergrenze von zwanzig gilt für beides.
  if (neu_gesperrt
      or (p_mail_wunsch
          and not exists (select 1 from sicherheits_ereignisse
                           where ip = p_ip and gemeldet and erstellt_am > now() - interval '1 hour')))
     and (select count(*) from sicherheits_ereignisse
           where gemeldet and erstellt_am > now() - interval '1 hour') < 20 then
    update sicherheits_ereignisse set gemeldet = true where id = neue_id;
    mail := true;
  end if;

  -- Aufräumen: etwa jeder hundertste Aufruf, nicht jeder.
  if random() < 0.01 then
    delete from sicherheits_ereignisse where erstellt_am < now() - interval '90 days';
  end if;

  return jsonb_build_object(
    'id', neue_id,
    'summe', summe,
    'gesperrt', aktiv,
    'neu_gesperrt', neu_gesperrt,
    'gesperrt_bis', bis,
    'mail_faellig', mail
  );
end;
$function$
;

-- Sichten

-- Schlüssel und Prüfungen

alter table public.admin_access_log add constraint admin_access_log_pkey PRIMARY KEY (id);
alter table public.algorithm_runs add constraint algorithm_runs_pkey PRIMARY KEY (id);
alter table public.analytics_events add constraint analytics_events_pkey PRIMARY KEY (id);
alter table public.anbindung_belegung add constraint anbindung_belegung_pkey PRIMARY KEY (id);
alter table public.anbindung_laeufe add constraint anbindung_laeufe_pkey PRIMARY KEY (id);
alter table public.anbindungen add constraint anbindungen_pkey PRIMARY KEY (id);
alter table public.auto_schedule_log add constraint auto_schedule_log_pkey PRIMARY KEY (id);
alter table public.availability_entries add constraint availability_entries_pkey PRIMARY KEY (id);
alter table public.bereich_members add constraint bereich_members_pkey PRIMARY KEY (id);
alter table public.bereich_shift_assignments add constraint bereich_shift_assignments_pkey PRIMARY KEY (id);
alter table public.bereich_shift_templates add constraint bereich_shift_templates_pkey PRIMARY KEY (id);
alter table public.bereich_shifts add constraint bereich_shifts_pkey PRIMARY KEY (id);
alter table public.bereich_tasks add constraint bereich_tasks_pkey PRIMARY KEY (id);
alter table public.bereiche add constraint bereiche_pkey PRIMARY KEY (id);
alter table public.burnout_scores add constraint burnout_scores_pkey PRIMARY KEY (id);
alter table public.burnout_snapshots add constraint burnout_snapshots_pkey PRIMARY KEY (id);
alter table public.carriers add constraint carriers_pkey PRIMARY KEY (id);
alter table public.certificate_reminder_log add constraint certificate_reminder_log_pkey PRIMARY KEY (id);
alter table public.certificates add constraint certificates_pkey PRIMARY KEY (id);
alter table public.checkin_tokens add constraint checkin_tokens_pkey PRIMARY KEY (id);
alter table public.compliance_reports add constraint compliance_reports_pkey PRIMARY KEY (id);
alter table public.copilot_runs add constraint copilot_runs_pkey PRIMARY KEY (id);
alter table public.demo_bewertungen add constraint demo_bewertungen_pkey PRIMARY KEY (id);
alter table public.demo_rate_limit add constraint demo_rate_limit_pkey PRIMARY KEY (id);
alter table public.download_codes add constraint download_codes_pkey PRIMARY KEY (id);
alter table public.emergency_plan_runs add constraint emergency_plan_runs_pkey PRIMARY KEY (id);
alter table public.external_agencies add constraint external_agencies_pkey PRIMARY KEY (id);
alter table public.external_agency_requests add constraint external_agency_requests_pkey PRIMARY KEY (id);
alter table public.facilities add constraint facilities_pkey PRIMARY KEY (id);
alter table public.facility_oncall_days add constraint facility_oncall_days_pkey PRIMARY KEY (facility_name, oncall_date);
alter table public.facility_settings add constraint facility_settings_pkey PRIMARY KEY (facility_name);
alter table public.facility_staff add constraint facility_staff_pkey PRIMARY KEY (id);
alter table public.feedback_answers add constraint feedback_answers_pkey PRIMARY KEY (id);
alter table public.feedback_interests add constraint feedback_interests_pkey PRIMARY KEY (id);
alter table public.flextime_requests add constraint flextime_requests_pkey PRIMARY KEY (id);
alter table public.gespraech_google_konten add constraint gespraech_google_konten_pkey PRIMARY KEY (id);
alter table public.gespraech_sperrzeiten add constraint gespraech_sperrzeiten_pkey PRIMARY KEY (id);
alter table public.gespraechs_termine add constraint gespraechs_termine_pkey PRIMARY KEY (id);
alter table public.invite_codes add constraint invite_codes_pkey PRIMARY KEY (id);
alter table public.ip_sperren add constraint ip_sperren_pkey PRIMARY KEY (ip);
alter table public.ki_monthly_adjustment_runs add constraint ki_monthly_adjustment_runs_pkey PRIMARY KEY (id);
alter table public.ki_plan_recommendations add constraint ki_plan_recommendations_pkey PRIMARY KEY (id);
alter table public.konto_anmeldungen add constraint konto_anmeldungen_pkey PRIMARY KEY (sitzung_id);
alter table public.leitung_einrichtungen add constraint leitung_einrichtungen_pkey PRIMARY KEY (user_id, facility_name);
alter table public.mitarbeiter_kalender add constraint mitarbeiter_kalender_pkey PRIMARY KEY (user_id);
alter table public.mitarbeiter_rechte add constraint mitarbeiter_rechte_pkey PRIMARY KEY (facility_name, user_id);
alter table public.nichterscheinen add constraint nichterscheinen_pkey PRIMARY KEY (id);
alter table public.notfall_ausloesungen add constraint notfall_ausloesungen_pkey PRIMARY KEY (id);
alter table public.notfall_berechtigte add constraint notfall_berechtigte_pkey PRIMARY KEY (facility_name, user_id);
alter table public.notfall_rueckmeldungen add constraint notfall_rueckmeldungen_pkey PRIMARY KEY (id);
alter table public.notfall_vorlagen add constraint notfall_vorlagen_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.nurvo_admins add constraint nurvo_admins_pkey PRIMARY KEY (id);
alter table public.on_call_entries add constraint on_call_entries_pkey PRIMARY KEY (id);
alter table public.overtime_rebalance_suggestions add constraint overtime_rebalance_suggestions_pkey PRIMARY KEY (id);
alter table public.payroll_entries add constraint payroll_entries_pkey PRIMARY KEY (id);
alter table public.payroll_runs add constraint payroll_runs_pkey PRIMARY KEY (id);
alter table public.personalakte add constraint personalakte_pkey PRIMARY KEY (id);
alter table public.personalakte_eintraege add constraint personalakte_eintraege_pkey PRIMARY KEY (id);
alter table public.personalakte_protokoll add constraint personalakte_protokoll_pkey PRIMARY KEY (id);
alter table public.personalakte_verlauf add constraint personalakte_verlauf_pkey PRIMARY KEY (id);
alter table public.platform_settings add constraint platform_settings_pkey PRIMARY KEY (id);
alter table public.ppbv_einstufung add constraint ppbv_einstufung_pkey PRIMARY KEY (id);
alter table public.ppbv_records add constraint ppbv_records_pkey PRIMARY KEY (id);
alter table public.roadmap_items add constraint roadmap_items_pkey PRIMARY KEY (id);
alter table public.schicht_belegung add constraint schicht_belegung_pkey PRIMARY KEY (id);
alter table public.shift_assignments add constraint shift_assignments_pkey PRIMARY KEY (id);
alter table public.shift_difficulty_ratings add constraint shift_difficulty_ratings_pkey PRIMARY KEY (id);
alter table public.shift_release_offers add constraint shift_release_offers_pkey PRIMARY KEY (id);
alter table public.shift_release_requests add constraint shift_release_requests_pkey PRIMARY KEY (id);
alter table public.shift_reports add constraint shift_reports_pkey PRIMARY KEY (id);
alter table public.shift_swap_requests add constraint shift_swap_requests_pkey PRIMARY KEY (id);
alter table public.shift_templates add constraint shift_templates_pkey PRIMARY KEY (id);
alter table public.shifts add constraint shifts_pkey PRIMARY KEY (id);
alter table public.sicherheits_ereignisse add constraint sicherheits_ereignisse_pkey PRIMARY KEY (id);
alter table public.sick_reports add constraint sick_reports_pkey PRIMARY KEY (id);
alter table public.simulator_runs add constraint simulator_runs_pkey PRIMARY KEY (id);
alter table public.springer_contacts add constraint springer_contacts_pkey PRIMARY KEY (id);
alter table public.springer_oncall add constraint springer_oncall_pkey PRIMARY KEY (id);
alter table public.springer_requests add constraint springer_requests_pkey PRIMARY KEY (id);
alter table public.staff add constraint staff_pkey PRIMARY KEY (id);
alter table public.staff_availability add constraint staff_availability_pkey PRIMARY KEY (id);
alter table public.staff_certificates add constraint staff_certificates_pkey PRIMARY KEY (id);
alter table public.staff_wishes add constraint staff_wishes_pkey PRIMARY KEY (id);
alter table public.staffing_needs add constraint staffing_needs_pkey PRIMARY KEY (id);
alter table public.station_leaders add constraint station_leaders_pkey PRIMARY KEY (id);
alter table public.station_tasks add constraint station_tasks_pkey PRIMARY KEY (id);
alter table public.stations add constraint stations_pkey PRIMARY KEY (id);
alter table public.support_messages add constraint support_messages_pkey PRIMARY KEY (id);
alter table public.task_categories add constraint task_categories_pkey PRIMARY KEY (id);
alter table public.task_codes add constraint task_codes_pkey PRIMARY KEY (id);
alter table public.time_entries add constraint time_entries_pkey PRIMARY KEY (id);
alter table public.training_attendees add constraint training_attendees_pkey PRIMARY KEY (id);
alter table public.trainings add constraint trainings_pkey PRIMARY KEY (id);
alter table public.user_devices add constraint user_devices_pkey PRIMARY KEY (id);
alter table public.user_profiles add constraint user_profiles_pkey PRIMARY KEY (id);
alter table public.vacation_requests add constraint vacation_requests_pkey PRIMARY KEY (id);
alter table public.verspaetungen add constraint verspaetungen_pkey PRIMARY KEY (id);
alter table public.bereich_members add constraint bereich_members_bereich_id_user_id_key UNIQUE (bereich_id, user_id);
alter table public.bereich_shift_assignments add constraint bereich_shift_assignments_shift_id_staff_name_key UNIQUE (shift_id, staff_name);
alter table public.bereiche add constraint bereiche_facility_name_name_key UNIQUE (facility_name, name);
alter table public.burnout_scores add constraint burnout_scores_facility_name_staff_id_score_date_key UNIQUE (facility_name, staff_id, score_date);
alter table public.checkin_tokens add constraint checkin_tokens_token_key UNIQUE (token);
alter table public.download_codes add constraint download_codes_code_key UNIQUE (code);
alter table public.external_agency_requests add constraint external_agency_requests_response_token_key UNIQUE (response_token);
alter table public.invite_codes add constraint invite_codes_code_key UNIQUE (code);
alter table public.mitarbeiter_kalender add constraint mitarbeiter_kalender_token_hash_key UNIQUE (token_hash);
alter table public.nichterscheinen add constraint nichterscheinen_facility_name_shift_id_staff_name_key UNIQUE (facility_name, shift_id, staff_name);
alter table public.notfall_rueckmeldungen add constraint notfall_rueckmeldungen_ausloesung_id_user_id_key UNIQUE (ausloesung_id, user_id);
alter table public.nurvo_admins add constraint nurvo_admins_email_key UNIQUE (email);
alter table public.payroll_runs add constraint payroll_runs_facility_name_month_year_key UNIQUE (facility_name, month, year);
alter table public.personalakte add constraint personalakte_facility_name_staff_id_key UNIQUE (facility_name, staff_id);
alter table public.ppbv_einstufung add constraint ppbv_einstufung_facility_name_station_datum_key UNIQUE (facility_name, station, datum);
alter table public.ppbv_records add constraint ppbv_records_facility_name_station_year_month_key UNIQUE (facility_name, station, year, month);
alter table public.schicht_belegung add constraint schicht_belegung_facility_name_station_datum_schicht_key UNIQUE (facility_name, station, datum, schicht);
alter table public.shift_assignments add constraint shift_assignments_shift_id_staff_id_key UNIQUE (shift_id, staff_id);
alter table public.shift_reports add constraint shift_reports_time_entry_id_key UNIQUE (time_entry_id);
alter table public.shift_templates add constraint shift_templates_facility_name_name_key UNIQUE (facility_name, name);
alter table public.springer_oncall add constraint springer_oncall_facility_name_staff_name_oncall_date_shift__key UNIQUE (facility_name, staff_name, oncall_date, shift_type);
alter table public.staff add constraint staff_email_key UNIQUE (email);
alter table public.staff_availability add constraint staff_availability_staff_id_day_of_week_key UNIQUE (staff_id, day_of_week);
alter table public.station_leaders add constraint station_leaders_station_name_user_id_facility_name_key UNIQUE (station_name, user_id, facility_name);
alter table public.task_codes add constraint task_codes_code_key UNIQUE (code);
alter table public.user_devices add constraint user_devices_user_id_device_id_key UNIQUE (user_id, device_id);
alter table public.bereich_shift_templates add constraint bereich_shift_templates_staff_needed_check CHECK (((staff_needed >= 0) AND (staff_needed <= 99)));
alter table public.bereich_shift_templates add constraint bereich_shift_templates_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)));
alter table public.bereich_tasks add constraint bereich_tasks_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'hoch'::text])));
alter table public.bereich_tasks add constraint bereich_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])));
alter table public.burnout_scores add constraint burnout_scores_score_check CHECK (((score >= 0) AND (score <= 100)));
alter table public.burnout_snapshots add constraint burnout_snapshots_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
alter table public.burnout_snapshots add constraint burnout_snapshots_risk_score_check CHECK (((risk_score >= 0) AND (risk_score <= 100)));
alter table public.copilot_runs add constraint copilot_runs_status_check CHECK ((status = ANY (ARRAY['vorgeschlagen'::text, 'uebernommen'::text])));
alter table public.demo_bewertungen add constraint demo_bewertungen_status_check CHECK ((status = ANY (ARRAY['neu'::text, 'freigegeben'::text, 'abgelehnt'::text])));
alter table public.demo_bewertungen add constraint demo_bewertungen_sterne_check CHECK (((sterne >= 1) AND (sterne <= 5)));
alter table public.demo_bewertungen add constraint demo_bewertungen_veroeffentlichung_check CHECK ((veroeffentlichung = ANY (ARRAY['nein'::text, 'anonym'::text, 'name'::text])));
alter table public.emergency_plan_runs add constraint emergency_plan_runs_status_check CHECK ((status = ANY (ARRAY['vorgeschlagen'::text, 'ausgefuehrt'::text, 'verworfen'::text])));
alter table public.external_agency_requests add constraint external_agency_requests_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
alter table public.facility_settings add constraint facility_settings_fachkraft_quote_check CHECK (((fachkraft_quote >= (0)::numeric) AND (fachkraft_quote <= (1)::numeric)));
alter table public.facility_settings add constraint facility_settings_plan_check CHECK ((plan = ANY (ARRAY['station'::text, 'klinik'::text, 'pflege'::text, 'praxis'::text])));
alter table public.facility_settings add constraint facility_settings_shift_swap_mode_check CHECK ((shift_swap_mode = ANY (ARRAY['manual'::text, 'automatic'::text, 'leitung_only'::text])));
alter table public.facility_staff add constraint facility_staff_dienstplanung_check CHECK (((dienstplanung IS NULL) OR (dienstplanung = ANY (ARRAY['schicht'::text, 'tagdienst'::text, 'selbst'::text]))));
alter table public.facility_staff add constraint facility_staff_qualifikation_check CHECK (((qualifikation IS NULL) OR (qualifikation = ANY (ARRAY['fachkraft'::text, 'hilfskraft_1j'::text, 'hilfskraft_ohne'::text, 'sonstige'::text]))));
alter table public.gespraech_sperrzeiten add constraint gespraech_sperrzeiten_reihenfolge CHECK ((bis_datum >= von_datum));
alter table public.gespraech_sperrzeiten add constraint gespraech_sperrzeiten_zeitpaar CHECK ((((von_zeit IS NULL) AND (bis_zeit IS NULL)) OR ((von_zeit IS NOT NULL) AND (bis_zeit IS NOT NULL) AND (bis_zeit > von_zeit))));
alter table public.gespraechs_termine add constraint gespraechs_termine_kontaktweg_check CHECK (((kontaktweg IS NULL) OR (kontaktweg = ANY (ARRAY['telefon'::text, 'teams'::text, 'zoom'::text]))));
alter table public.invite_codes add constraint invite_codes_plan_check CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['station'::text, 'klinik'::text, 'pflege'::text, 'praxis'::text]))));
alter table public.invite_codes add constraint invite_codes_role_check CHECK ((role = ANY (ARRAY['leitung'::text, 'mitarbeiter'::text, 'admin'::text, 'demo'::text])));
alter table public.ki_monthly_adjustment_runs add constraint ki_monthly_adjustment_runs_status_check CHECK ((status = ANY (ARRAY['vorgeschlagen'::text, 'teilweise_angewendet'::text, 'angewendet'::text, 'verworfen'::text])));
alter table public.leitung_einrichtungen add constraint leitung_einrichtungen_facility_name_check CHECK ((length(TRIM(BOTH FROM facility_name)) > 0));
alter table public.nichterscheinen add constraint nichterscheinen_status_check CHECK ((status = ANY (ARRAY['bestaetigt'::text, 'war_da'::text])));
alter table public.notfall_ausloesungen add constraint notfall_ausloesungen_ausgeloest_von_rolle_check CHECK ((ausgeloest_von_rolle = ANY (ARRAY['leitung'::text, 'mitarbeiter'::text])));
alter table public.notfall_vorlagen add constraint notfall_vorlagen_stunden_check CHECK (((stunden >= 1) AND (stunden <= 72)));
alter table public.overtime_rebalance_suggestions add constraint overtime_rebalance_suggestions_action_check CHECK ((action = ANY (ARRAY['remove'::text, 'swap'::text])));
alter table public.overtime_rebalance_suggestions add constraint overtime_rebalance_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'dismissed'::text, 'auto_applied'::text])));
alter table public.payroll_runs add constraint payroll_runs_month_check CHECK (((month >= 1) AND (month <= 12)));
alter table public.personalakte add constraint personalakte_urlaubstage_vertrag_check CHECK (((urlaubstage_vertrag IS NULL) OR ((urlaubstage_vertrag >= 0) AND (urlaubstage_vertrag <= 60))));
alter table public.personalakte add constraint personalakte_wochenstunden_check CHECK (((wochenstunden IS NULL) OR ((wochenstunden >= (0)::numeric) AND (wochenstunden <= (60)::numeric))));
alter table public.personalakte_eintraege add constraint personalakte_eintraege_art_check CHECK ((art = ANY (ARRAY['vertrag'::text, 'vertragsaenderung'::text, 'eintritt'::text, 'gespraech'::text, 'abmahnung'::text, 'fortbildung'::text, 'bescheinigung'::text, 'zeugnis'::text, 'austritt'::text, 'sonstiges'::text, 'krankschreibung'::text, 'fehlzeit'::text])));
alter table public.personalakte_eintraege add constraint personalakte_eintraege_notiz_check CHECK (((notiz IS NULL) OR (char_length(notiz) <= 5000)));
alter table public.personalakte_eintraege add constraint personalakte_eintraege_titel_check CHECK (((char_length(titel) >= 1) AND (char_length(titel) <= 200)));
alter table public.personalakte_eintraege add constraint personalakte_eintraege_zeitraum_check CHECK (((datum_bis IS NULL) OR (datum_bis >= datum)));
alter table public.platform_settings add constraint platform_settings_singleton CHECK (id);
alter table public.ppbv_einstufung add constraint ppbv_einstufung_aufnahmen_check CHECK ((aufnahmen >= 0));
alter table public.ppbv_einstufung add constraint ppbv_einstufung_check CHECK (((isolation >= 0) AND (isolation <= patienten)));
alter table public.ppbv_einstufung add constraint ppbv_einstufung_neugeborene_check CHECK ((neugeborene >= 0));
alter table public.ppbv_einstufung add constraint ppbv_einstufung_patienten_check CHECK ((patienten >= 0));
alter table public.ppbv_records add constraint ppbv_records_month_check CHECK (((month >= 1) AND (month <= 12)));
alter table public.roadmap_items add constraint roadmap_items_status_check CHECK ((status = ANY (ARRAY['done'::text, 'wip'::text, 'planned'::text])));
alter table public.schicht_belegung add constraint schicht_belegung_abgaenge_check CHECK ((abgaenge >= 0));
alter table public.schicht_belegung add constraint schicht_belegung_hoechststand_check CHECK (((hoechststand >= 0) AND (hoechststand <= 500)));
alter table public.schicht_belegung add constraint schicht_belegung_patienten_check CHECK (((patienten >= 0) AND (patienten <= 500)));
alter table public.schicht_belegung add constraint schicht_belegung_quelle_check CHECK ((quelle = ANY (ARRAY['station'::text, 'leitung'::text])));
alter table public.schicht_belegung add constraint schicht_belegung_schicht_check CHECK ((schicht = ANY (ARRAY['tag'::text, 'nacht'::text])));
alter table public.schicht_belegung add constraint schicht_belegung_zugaenge_check CHECK ((zugaenge >= 0));
alter table public.shift_assignments add constraint shift_assignments_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'manual'::text])));
alter table public.shift_difficulty_ratings add constraint shift_difficulty_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.shift_release_offers add constraint shift_release_offers_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'angenommen'::text, 'abgelehnt'::text, 'frist_abgelaufen'::text, 'uebersprungen'::text])));
alter table public.shift_release_requests add constraint shift_release_requests_status_check CHECK ((status = ANY (ARRAY['sucht_ersatz'::text, 'wartet_auf_kandidat'::text, 'wartet_auf_leitung'::text, 'ohne_ersatz_abgesagt'::text, 'uebernommen'::text, 'eskaliert'::text, 'abgelehnt_leitung'::text, 'zurueckgezogen'::text])));
alter table public.shift_swap_requests add constraint shift_swap_requests_mode_check CHECK ((mode = ANY (ARRAY['manual'::text, 'automatic'::text, 'leitung_only'::text])));
alter table public.shift_swap_requests add constraint shift_swap_requests_status_check CHECK ((status = ANY (ARRAY['pending_leitung'::text, 'pending_colleague'::text, 'approved'::text, 'declined_by_leitung'::text, 'declined_by_colleague'::text, 'failed'::text])));
alter table public.sicherheits_ereignisse add constraint sicherheits_ereignisse_schwere_check CHECK ((schwere = ANY (ARRAY['info'::text, 'warnung'::text, 'kritisch'::text])));
alter table public.sick_reports add constraint sick_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'covered'::text, 'uncovered'::text, 'cancelled'::text])));
alter table public.simulator_runs add constraint simulator_runs_kind_check CHECK ((kind = ANY (ARRAY['run'::text, 'next_month'::text])));
alter table public.springer_contacts add constraint springer_contacts_contact_reason_check CHECK ((contact_reason = ANY (ARRAY['on_call'::text, 'available'::text, 'contactable'::text])));
alter table public.springer_contacts add constraint springer_contacts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'no_response'::text])));
alter table public.springer_requests add constraint springer_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'matched'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text])));
alter table public.staff add constraint staff_role_check CHECK ((role = ANY (ARRAY['Pflegefachkraft'::text, 'Pflegehilfskraft'::text, 'Stationsleitung'::text, 'Springer'::text, 'Verwaltung'::text])));
alter table public.staff_certificates add constraint staff_certificates_reminder_stage_check CHECK ((reminder_stage = ANY (ARRAY['soon'::text, 'urgent'::text, 'expired'::text])));
alter table public.staffing_needs add constraint staffing_needs_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'in_arbeit'::text, 'erledigt'::text, 'verworfen'::text])));
alter table public.station_tasks add constraint station_tasks_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'hoch'::text])));
alter table public.station_tasks add constraint station_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text])));
alter table public.stations add constraint stations_betten_check CHECK (((betten IS NULL) OR (betten >= 0)));
alter table public.stations add constraint stations_ppug_grenze_nacht_check CHECK (((ppug_grenze_nacht IS NULL) OR (ppug_grenze_nacht > (0)::numeric)));
alter table public.stations add constraint stations_ppug_grenze_tag_check CHECK (((ppug_grenze_tag IS NULL) OR (ppug_grenze_tag > (0)::numeric)));
alter table public.user_profiles add constraint user_profiles_role_check CHECK ((role = ANY (ARRAY['leitung'::text, 'mitarbeiter'::text])));
alter table public.vacation_requests add constraint vacation_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])));
alter table public.verspaetungen add constraint verspaetungen_minuten_check CHECK (((minuten IS NULL) OR ((minuten >= 1) AND (minuten <= 600))));
alter table public.bereich_members add constraint bereich_members_bereich_id_fkey FOREIGN KEY (bereich_id) REFERENCES bereiche(id) ON DELETE CASCADE;
alter table public.bereich_shift_assignments add constraint bereich_shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES bereich_shifts(id) ON DELETE CASCADE;
alter table public.bereich_shift_templates add constraint bereich_shift_templates_bereich_id_fkey FOREIGN KEY (bereich_id) REFERENCES bereiche(id) ON DELETE CASCADE;
alter table public.bereich_shifts add constraint bereich_shifts_bereich_id_fkey FOREIGN KEY (bereich_id) REFERENCES bereiche(id) ON DELETE CASCADE;
alter table public.bereich_tasks add constraint bereich_tasks_bereich_id_fkey FOREIGN KEY (bereich_id) REFERENCES bereiche(id) ON DELETE CASCADE;
alter table public.burnout_snapshots add constraint burnout_snapshots_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
alter table public.certificates add constraint certificates_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
alter table public.compliance_reports add constraint compliance_reports_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id);
alter table public.download_codes add constraint download_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.external_agency_requests add constraint external_agency_requests_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES external_agencies(id) ON DELETE CASCADE;
alter table public.external_agency_requests add constraint external_agency_requests_sick_report_id_fkey FOREIGN KEY (sick_report_id) REFERENCES sick_reports(id) ON DELETE CASCADE;
alter table public.facilities add constraint facilities_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES carriers(id);
alter table public.facility_oncall_days add constraint facility_oncall_days_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.invite_codes add constraint invite_codes_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE;
alter table public.invite_codes add constraint invite_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);
alter table public.leitung_einrichtungen add constraint leitung_einrichtungen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notfall_ausloesungen add constraint notfall_ausloesungen_vorlage_id_fkey FOREIGN KEY (vorlage_id) REFERENCES notfall_vorlagen(id) ON DELETE SET NULL;
alter table public.notfall_berechtigte add constraint notfall_berechtigte_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notfall_rueckmeldungen add constraint notfall_rueckmeldungen_ausloesung_id_fkey FOREIGN KEY (ausloesung_id) REFERENCES notfall_ausloesungen(id) ON DELETE CASCADE;
alter table public.notfall_rueckmeldungen add constraint notfall_rueckmeldungen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.payroll_entries add constraint payroll_entries_run_id_fkey FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE;
alter table public.shift_release_offers add constraint shift_release_offers_release_id_fkey FOREIGN KEY (release_id) REFERENCES shift_release_requests(id) ON DELETE CASCADE;
alter table public.springer_contacts add constraint springer_contacts_sick_report_id_fkey FOREIGN KEY (sick_report_id) REFERENCES sick_reports(id) ON DELETE CASCADE;
alter table public.springer_requests add constraint springer_requests_matched_staff_id_fkey FOREIGN KEY (matched_staff_id) REFERENCES staff(id);
alter table public.springer_requests add constraint springer_requests_offering_facility_id_fkey FOREIGN KEY (offering_facility_id) REFERENCES facilities(id);
alter table public.springer_requests add constraint springer_requests_requesting_facility_id_fkey FOREIGN KEY (requesting_facility_id) REFERENCES facilities(id);
alter table public.staff add constraint staff_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id);
alter table public.staff add constraint staff_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
alter table public.stations add constraint stations_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE;
alter table public.training_attendees add constraint training_attendees_training_id_fkey FOREIGN KEY (training_id) REFERENCES trainings(id) ON DELETE CASCADE;
alter table public.user_devices add constraint user_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_profiles add constraint user_profiles_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES staff(id);
alter table public.user_profiles add constraint user_profiles_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id);
alter table public.vacation_requests add constraint vacation_requests_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id);
alter table public.vacation_requests add constraint vacation_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id);
alter table public.vacation_requests add constraint vacation_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
alter table public.verspaetungen add constraint verspaetungen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indizes

CREATE INDEX algorithm_runs_at ON public.algorithm_runs USING btree (run_at DESC);
CREATE INDEX algorithm_runs_facility ON public.algorithm_runs USING btree (facility_hash, run_at DESC);
CREATE INDEX analytics_events_created_at_idx ON public.analytics_events USING btree (created_at DESC);
CREATE INDEX analytics_events_event_name_idx ON public.analytics_events USING btree (event_name);
CREATE INDEX analytics_events_facility_idx ON public.analytics_events USING btree (facility_name);
CREATE UNIQUE INDEX anbindung_belegung_fall_offen ON public.anbindung_belegung USING btree (facility_name, fall_schluessel) WHERE (bis IS NULL);
CREATE INDEX anbindung_belegung_fall ON public.anbindung_belegung USING btree (facility_name, fall_schluessel);
CREATE INDEX anbindung_belegung_station ON public.anbindung_belegung USING btree (facility_name, station, seit);
CREATE INDEX anbindung_belegung_offen ON public.anbindung_belegung USING btree (facility_name, station) WHERE (bis IS NULL);
CREATE INDEX anbindung_laeufe_anbindung ON public.anbindung_laeufe USING btree (anbindung_id, gestartet_am DESC);
CREATE INDEX anbindungen_facility ON public.anbindungen USING btree (facility_name, aktiv);
CREATE UNIQUE INDEX anbindungen_hl7_token ON public.anbindungen USING btree (hl7_token_hash) WHERE (hl7_token_hash IS NOT NULL);
CREATE UNIQUE INDEX anbindungen_kalender_token ON public.anbindungen USING btree (kalender_token_hash) WHERE (kalender_token_hash IS NOT NULL);
CREATE INDEX bereich_members_facility ON public.bereich_members USING btree (facility_name);
CREATE INDEX bereich_members_user ON public.bereich_members USING btree (user_id);
CREATE INDEX bereich_members_bereich ON public.bereich_members USING btree (bereich_id);
CREATE INDEX bereich_shift_assignments_shift ON public.bereich_shift_assignments USING btree (shift_id);
CREATE INDEX bereich_shift_assignments_facility ON public.bereich_shift_assignments USING btree (facility_name);
CREATE INDEX bereich_shift_templates_facility ON public.bereich_shift_templates USING btree (facility_name);
CREATE INDEX bereich_shift_templates_bereich ON public.bereich_shift_templates USING btree (bereich_id);
CREATE UNIQUE INDEX bereich_shift_templates_eindeutig ON public.bereich_shift_templates USING btree (bereich_id, weekday, COALESCE(start_time, ''::text), COALESCE(lower(label), ''::text));
CREATE INDEX bereich_shifts_facility_date ON public.bereich_shifts USING btree (facility_name, date);
CREATE INDEX bereich_shifts_bereich_date ON public.bereich_shifts USING btree (bereich_id, date);
CREATE INDEX bereich_tasks_bereich_status ON public.bereich_tasks USING btree (bereich_id, status);
CREATE INDEX bereich_tasks_facility ON public.bereich_tasks USING btree (facility_name, status);
CREATE INDEX bereich_tasks_code ON public.bereich_tasks USING btree (code_id);
CREATE INDEX bereich_tasks_station ON public.bereich_tasks USING btree (facility_name, station);
CREATE INDEX bereiche_facility ON public.bereiche USING btree (facility_name);
CREATE INDEX burnout_scores_staff ON public.burnout_scores USING btree (staff_id, score_date DESC);
CREATE INDEX burnout_scores_facility ON public.burnout_scores USING btree (facility_name, score_date DESC);
CREATE INDEX idx_burnout_staff ON public.burnout_snapshots USING btree (staff_id, snapshot_date DESC);
CREATE INDEX idx_certificate_reminder_log_run_date ON public.certificate_reminder_log USING btree (run_date);
CREATE INDEX idx_certs_expires ON public.certificates USING btree (expires_at);
CREATE INDEX idx_certs_staff ON public.certificates USING btree (staff_id);
CREATE INDEX idx_checkin_tokens_user ON public.checkin_tokens USING btree (user_id, expires_at DESC);
CREATE INDEX idx_checkin_tokens_token ON public.checkin_tokens USING btree (token);
CREATE INDEX copilot_runs_facility ON public.copilot_runs USING btree (facility_name, created_at DESC);
CREATE INDEX copilot_runs_status ON public.copilot_runs USING btree (facility_name, status);
CREATE INDEX demo_bewertungen_created ON public.demo_bewertungen USING btree (created_at DESC);
CREATE INDEX demo_rate_limit_idx ON public.demo_rate_limit USING btree (ip, created_at);
CREATE INDEX demo_rate_limit_ip_created ON public.demo_rate_limit USING btree (ip, created_at);
CREATE INDEX download_codes_user_id_idx ON public.download_codes USING btree (user_id);
CREATE INDEX emergency_plan_runs_facility ON public.emergency_plan_runs USING btree (facility_name, created_at DESC);
CREATE INDEX emergency_plan_runs_status ON public.emergency_plan_runs USING btree (facility_name, status);
CREATE INDEX facility_staff_qualifikation ON public.facility_staff USING btree (facility_name, qualifikation);
CREATE INDEX feedback_answers_created ON public.feedback_answers USING btree (created_at DESC);
CREATE INDEX feedback_interests_created ON public.feedback_interests USING btree (created_at DESC);
CREATE INDEX idx_flextime_requests_staff ON public.flextime_requests USING btree (staff_id, status);
CREATE INDEX idx_flextime_requests_facility ON public.flextime_requests USING btree (facility_name, status, from_date);
CREATE UNIQUE INDEX gespraech_google_konten_email ON public.gespraech_google_konten USING btree (google_email, kalender_id);
CREATE INDEX gespraech_sperrzeiten_zeitraum ON public.gespraech_sperrzeiten USING btree (bis_datum, von_datum);
CREATE UNIQUE INDEX gespraech_sperrzeiten_quelle ON public.gespraech_sperrzeiten USING btree (herkunft, quell_id) WHERE (quell_id IS NOT NULL);
CREATE UNIQUE INDEX gespraechs_termine_fenster ON public.gespraechs_termine USING btree (datum, zeit) WHERE (status = ANY (ARRAY['angefragt'::text, 'bestaetigt'::text]));
CREATE UNIQUE INDEX gespraechs_termine_token ON public.gespraechs_termine USING btree (token_hash);
CREATE INDEX gespraechs_termine_offen ON public.gespraechs_termine USING btree (datum, status);
CREATE INDEX gespraechs_termine_email ON public.gespraechs_termine USING btree (email, erstellt_am DESC);
CREATE INDEX idx_invite_code ON public.invite_codes USING btree (code);
CREATE INDEX idx_invite_facility ON public.invite_codes USING btree (facility_id);
CREATE INDEX ki_monthly_adjustment_runs_facility ON public.ki_monthly_adjustment_runs USING btree (facility_name, created_at DESC);
CREATE INDEX ki_monthly_adjustment_runs_status ON public.ki_monthly_adjustment_runs USING btree (facility_name, status);
CREATE INDEX ki_plan_recommendations_facility ON public.ki_plan_recommendations USING btree (facility_name, status);
CREATE INDEX konto_anmeldungen_user_zeit ON public.konto_anmeldungen USING btree (user_id, erstellt_am DESC);
CREATE INDEX nichterscheinen_facility_datum ON public.nichterscheinen USING btree (facility_name, datum DESC);
CREATE INDEX nichterscheinen_person ON public.nichterscheinen USING btree (facility_name, staff_name, datum DESC);
CREATE INDEX notfall_ausloesungen_facility ON public.notfall_ausloesungen USING btree (facility_name, created_at DESC);
CREATE INDEX notfall_ausloesungen_vorlage ON public.notfall_ausloesungen USING btree (vorlage_id, created_at DESC);
CREATE INDEX notfall_rueckmeldungen_ausloesung ON public.notfall_rueckmeldungen USING btree (ausloesung_id);
CREATE INDEX notfall_vorlagen_facility ON public.notfall_vorlagen USING btree (facility_name);
CREATE INDEX notifications_user ON public.notifications USING btree (user_id, read, created_at DESC);
CREATE INDEX idx_overtime_rebalance_suggestions_facility_status ON public.overtime_rebalance_suggestions USING btree (facility_name, status);
CREATE UNIQUE INDEX idx_overtime_rebalance_suggestions_unique_pending ON public.overtime_rebalance_suggestions USING btree (facility_name, staff_id, shift_id) WHERE (status = 'pending'::text);
CREATE INDEX payroll_entries_run ON public.payroll_entries USING btree (run_id);
CREATE INDEX payroll_entries_staff ON public.payroll_entries USING btree (facility_name, staff_name);
CREATE INDEX personalakte_eintraege_person ON public.personalakte_eintraege USING btree (facility_name, staff_id, datum DESC);
CREATE INDEX personalakte_eintraege_wiedervorlage ON public.personalakte_eintraege USING btree (facility_name, wiedervorlage) WHERE (wiedervorlage IS NOT NULL);
CREATE INDEX personalakte_eintraege_abwesenheit ON public.personalakte_eintraege USING btree (facility_name, art, datum, datum_bis) WHERE (art = ANY (ARRAY['krankschreibung'::text, 'fehlzeit'::text]));
CREATE INDEX personalakte_protokoll_person ON public.personalakte_protokoll USING btree (facility_name, staff_id, am DESC);
CREATE INDEX personalakte_verlauf_person ON public.personalakte_verlauf USING btree (facility_name, staff_id, am DESC);
CREATE INDEX ppbv_einstufung_monat ON public.ppbv_einstufung USING btree (facility_name, datum);
CREATE INDEX ppbv_records_facility_period ON public.ppbv_records USING btree (facility_name, year, month);
CREATE INDEX roadmap_items_sort_idx ON public.roadmap_items USING btree (sort);
CREATE INDEX schicht_belegung_monat ON public.schicht_belegung USING btree (facility_name, datum);
CREATE INDEX idx_assignments_shift ON public.shift_assignments USING btree (shift_id);
CREATE INDEX shift_assignments_shift ON public.shift_assignments USING btree (shift_id);
CREATE INDEX shift_assignments_fac ON public.shift_assignments USING btree (facility_name, created_at DESC);
CREATE INDEX idx_shift_assignments_facility_shift ON public.shift_assignments USING btree (facility_name, shift_id);
CREATE INDEX idx_shift_assignments_facility_staff ON public.shift_assignments USING btree (facility_name, staff_name);
CREATE INDEX idx_shift_assignments_fac_staff ON public.shift_assignments USING btree (facility_name, staff_id);
CREATE INDEX idx_shift_assignments_shift ON public.shift_assignments USING btree (shift_id);
CREATE INDEX idx_difficulty_facility_date ON public.shift_difficulty_ratings USING btree (facility, shift_date DESC);
CREATE INDEX idx_offer_release ON public.shift_release_offers USING btree (release_id, rang);
CREATE INDEX idx_offer_staff ON public.shift_release_offers USING btree (staff_id, status);
CREATE UNIQUE INDEX uniq_offenes_angebot_pro_vorgang ON public.shift_release_offers USING btree (release_id) WHERE (status = 'offen'::text);
CREATE INDEX idx_release_facility_status ON public.shift_release_requests USING btree (facility_name, status);
CREATE INDEX idx_release_staff ON public.shift_release_requests USING btree (staff_id, status);
CREATE INDEX idx_release_shift ON public.shift_release_requests USING btree (shift_id);
CREATE UNIQUE INDEX uniq_offene_abgabe_pro_schicht ON public.shift_release_requests USING btree (shift_id, staff_id) WHERE (status = ANY (ARRAY['sucht_ersatz'::text, 'wartet_auf_kandidat'::text, 'wartet_auf_leitung'::text]));
CREATE INDEX shift_reports_facility_date ON public.shift_reports USING btree (facility_name, shift_date DESC);
CREATE INDEX shift_reports_staff_date ON public.shift_reports USING btree (staff_id, shift_date DESC);
CREATE INDEX shift_reports_facility_late ON public.shift_reports USING btree (facility_name, is_late);
CREATE INDEX idx_ssr_facility_status ON public.shift_swap_requests USING btree (facility_name, status);
CREATE INDEX idx_ssr_target ON public.shift_swap_requests USING btree (target_staff_id, status);
CREATE INDEX idx_ssr_requester ON public.shift_swap_requests USING btree (requester_staff_id, status);
CREATE UNIQUE INDEX uniq_open_swap_per_shift ON public.shift_swap_requests USING btree (requester_shift_id) WHERE (status = ANY (ARRAY['pending_leitung'::text, 'pending_colleague'::text]));
CREATE INDEX idx_shifts_facility_name_date ON public.shifts USING btree (facility_name, date);
CREATE INDEX sicherheits_ereignisse_ip_zeit ON public.sicherheits_ereignisse USING btree (ip, erstellt_am DESC);
CREATE INDEX sicherheits_ereignisse_zeit ON public.sicherheits_ereignisse USING btree (erstellt_am DESC);
CREATE INDEX sicherheits_ereignisse_konto ON public.sicherheits_ereignisse USING btree (((details ->> 'konto'::text)), erstellt_am DESC) WHERE (art = 'login_fehlgeschlagen'::text);
CREATE INDEX simulator_runs_facility ON public.simulator_runs USING btree (facility_name, target_month, created_at DESC);
CREATE INDEX idx_springer_status ON public.springer_requests USING btree (status);
CREATE UNIQUE INDEX staffing_needs_unique ON public.staffing_needs USING btree (facility_name, station, shift_type);
CREATE INDEX staffing_needs_facility_status ON public.staffing_needs USING btree (facility_name, status);
CREATE INDEX station_leaders_facility ON public.station_leaders USING btree (facility_name);
CREATE INDEX station_leaders_user ON public.station_leaders USING btree (user_id);
CREATE INDEX station_tasks_station_status ON public.station_tasks USING btree (facility_name, station_name, status);
CREATE INDEX station_tasks_code ON public.station_tasks USING btree (code_id);
CREATE INDEX task_categories_facility ON public.task_categories USING btree (facility_name);
CREATE INDEX task_codes_facility ON public.task_codes USING btree (facility_name, active);
CREATE INDEX task_codes_station ON public.task_codes USING btree (facility_name, station);
CREATE INDEX time_entries_user ON public.time_entries USING btree (user_id, check_in DESC);
CREATE INDEX time_entries_fac ON public.time_entries USING btree (facility, check_in DESC);
CREATE INDEX idx_training_attendees_training ON public.training_attendees USING btree (training_id);
CREATE INDEX idx_trainings_facility_date ON public.trainings USING btree (facility_name, date);
CREATE INDEX user_devices_user_id ON public.user_devices USING btree (user_id);
CREATE INDEX idx_vacation_status ON public.vacation_requests USING btree (status);
CREATE INDEX idx_vacation_staff ON public.vacation_requests USING btree (staff_id);
CREATE INDEX verspaetungen_facility ON public.verspaetungen USING btree (facility_name, datum DESC);

-- Trigger

-- Zeilenschutz (RLS)

alter table public.admin_access_log enable row level security;
alter table public.algorithm_runs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.anbindung_belegung enable row level security;
alter table public.anbindung_laeufe enable row level security;
alter table public.anbindungen enable row level security;
alter table public.auto_schedule_log enable row level security;
alter table public.availability_entries enable row level security;
alter table public.bereich_members enable row level security;
alter table public.bereich_shift_assignments enable row level security;
alter table public.bereich_shift_templates enable row level security;
alter table public.bereich_shifts enable row level security;
alter table public.bereich_tasks enable row level security;
alter table public.bereiche enable row level security;
alter table public.burnout_scores enable row level security;
alter table public.burnout_snapshots enable row level security;
alter table public.carriers enable row level security;
alter table public.certificate_reminder_log enable row level security;
alter table public.certificates enable row level security;
alter table public.checkin_tokens enable row level security;
alter table public.compliance_reports enable row level security;
alter table public.copilot_runs enable row level security;
alter table public.demo_bewertungen enable row level security;
alter table public.demo_rate_limit enable row level security;
alter table public.download_codes enable row level security;
alter table public.emergency_plan_runs enable row level security;
alter table public.external_agencies enable row level security;
alter table public.external_agency_requests enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_oncall_days enable row level security;
alter table public.facility_settings enable row level security;
alter table public.facility_staff enable row level security;
alter table public.feedback_answers enable row level security;
alter table public.feedback_interests enable row level security;
alter table public.flextime_requests enable row level security;
alter table public.gespraech_google_konten enable row level security;
alter table public.gespraech_sperrzeiten enable row level security;
alter table public.gespraechs_termine enable row level security;
alter table public.invite_codes enable row level security;
alter table public.ip_sperren enable row level security;
alter table public.ki_monthly_adjustment_runs enable row level security;
alter table public.ki_plan_recommendations enable row level security;
alter table public.konto_anmeldungen enable row level security;
alter table public.leitung_einrichtungen enable row level security;
alter table public.mitarbeiter_kalender enable row level security;
alter table public.mitarbeiter_rechte enable row level security;
alter table public.nichterscheinen enable row level security;
alter table public.notfall_ausloesungen enable row level security;
alter table public.notfall_berechtigte enable row level security;
alter table public.notfall_rueckmeldungen enable row level security;
alter table public.notfall_vorlagen enable row level security;
alter table public.notifications enable row level security;
alter table public.nurvo_admins enable row level security;
alter table public.on_call_entries enable row level security;
alter table public.overtime_rebalance_suggestions enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.personalakte enable row level security;
alter table public.personalakte_eintraege enable row level security;
alter table public.personalakte_protokoll enable row level security;
alter table public.personalakte_verlauf enable row level security;
alter table public.platform_settings enable row level security;
alter table public.ppbv_einstufung enable row level security;
alter table public.ppbv_records enable row level security;
alter table public.roadmap_items enable row level security;
alter table public.schicht_belegung enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.shift_difficulty_ratings enable row level security;
alter table public.shift_release_offers enable row level security;
alter table public.shift_release_requests enable row level security;
alter table public.shift_reports enable row level security;
alter table public.shift_swap_requests enable row level security;
alter table public.shift_templates enable row level security;
alter table public.shifts enable row level security;
alter table public.sicherheits_ereignisse enable row level security;
alter table public.sick_reports enable row level security;
alter table public.simulator_runs enable row level security;
alter table public.springer_contacts enable row level security;
alter table public.springer_oncall enable row level security;
alter table public.springer_requests enable row level security;
alter table public.staff enable row level security;
alter table public.staff_availability enable row level security;
alter table public.staff_certificates enable row level security;
alter table public.staff_wishes enable row level security;
alter table public.staffing_needs enable row level security;
alter table public.station_leaders enable row level security;
alter table public.station_tasks enable row level security;
alter table public.stations enable row level security;
alter table public.support_messages enable row level security;
alter table public.task_categories enable row level security;
alter table public.task_codes enable row level security;
alter table public.time_entries enable row level security;
alter table public.training_attendees enable row level security;
alter table public.trainings enable row level security;
alter table public.user_devices enable row level security;
alter table public.user_profiles enable row level security;
alter table public.vacation_requests enable row level security;
alter table public.verspaetungen enable row level security;

-- Policies

create policy external_agencies_isolation on public.external_agencies as PERMISSIVE for ALL to public using ((facility_name = get_my_facility())) with check ((facility_name = get_my_facility()));
create policy external_agency_requests_leitung on public.external_agency_requests as PERMISSIVE for ALL to public using ((facility_name = get_my_facility())) with check ((facility_name = get_my_facility()));
create policy facility_oncall_days_isolation on public.facility_oncall_days as PERMISSIVE for ALL to public using ((facility_name = get_my_facility())) with check ((facility_name = get_my_facility()));
create policy tenant_isolation on public.facility_settings as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.facility_staff as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.invite_codes as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy own_row on public.nurvo_admins as PERMISSIVE for ALL to public using ((email = (( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text));
create policy tenant_isolation on public.payroll_entries as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.payroll_runs as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy "platform_settings read" on public.platform_settings as PERMISSIVE for SELECT to public using (true);
create policy "roadmap_items read" on public.roadmap_items as PERMISSIVE for SELECT to public using (true);
create policy tenant_isolation on public.shifts as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.sick_reports as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.springer_oncall as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.staff_wishes as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.stations as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy own_messages on public.support_messages as PERMISSIVE for ALL to public using ((user_id = auth.uid()));
create policy tenant_isolation on public.time_entries as PERMISSIVE for ALL to public using ((facility = get_my_facility()));
create policy tenant_isolation on public.training_attendees as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy tenant_isolation on public.trainings as PERMISSIVE for ALL to public using ((facility_name = get_my_facility()));
create policy "Eigenes Profil bearbeiten" on public.user_profiles as PERMISSIVE for UPDATE to public using ((auth.uid() = id));
create policy "Eigenes Profil lesen" on public.user_profiles as PERMISSIVE for SELECT to public using ((auth.uid() = id));
create policy "Profil erstellen" on public.user_profiles as PERMISSIVE for INSERT to public with check ((auth.uid() = id));
create policy read_own_facility on public.user_profiles as PERMISSIVE for SELECT to public using (((facility = get_my_facility()) OR (id = auth.uid())));
create policy "Mitarbeiter sehen eigene Anträge" on public.vacation_requests as PERMISSIVE for SELECT to public using ((auth.uid() = staff_id));
create policy "Mitarbeiter stellen Anträge" on public.vacation_requests as PERMISSIVE for INSERT to public with check ((auth.uid() = staff_id));
create policy own_requests on public.vacation_requests as PERMISSIVE for ALL to public using ((staff_id = auth.uid()));

-- Rechte auf Tabellen

revoke all on public.admin_access_log from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.admin_access_log to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.admin_access_log to authenticated;
revoke all on public.algorithm_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.algorithm_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.algorithm_runs to authenticated;
revoke all on public.analytics_events from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.analytics_events to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.analytics_events to authenticated;
revoke all on public.anbindung_belegung from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindung_belegung to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindung_belegung to authenticated;
revoke all on public.anbindung_laeufe from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindung_laeufe to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindung_laeufe to authenticated;
revoke all on public.anbindungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.anbindungen to authenticated;
revoke all on public.auto_schedule_log from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.auto_schedule_log to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.auto_schedule_log to authenticated;
revoke all on public.availability_entries from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.availability_entries to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.availability_entries to authenticated;
revoke all on public.bereich_members from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_members to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_members to authenticated;
revoke all on public.bereich_shift_assignments from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shift_assignments to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shift_assignments to authenticated;
revoke all on public.bereich_shift_templates from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shift_templates to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shift_templates to authenticated;
revoke all on public.bereich_shifts from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shifts to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_shifts to authenticated;
revoke all on public.bereich_tasks from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_tasks to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereich_tasks to authenticated;
revoke all on public.bereiche from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereiche to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.bereiche to authenticated;
revoke all on public.burnout_scores from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.burnout_scores to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.burnout_scores to authenticated;
revoke all on public.burnout_snapshots from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.burnout_snapshots to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.burnout_snapshots to authenticated;
revoke all on public.carriers from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.carriers to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.carriers to authenticated;
revoke all on public.certificate_reminder_log from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.certificate_reminder_log to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.certificate_reminder_log to authenticated;
revoke all on public.certificates from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.certificates to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.certificates to authenticated;
revoke all on public.checkin_tokens from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.checkin_tokens to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.checkin_tokens to authenticated;
revoke all on public.compliance_reports from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.compliance_reports to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.compliance_reports to authenticated;
revoke all on public.copilot_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.copilot_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.copilot_runs to authenticated;
revoke all on public.demo_bewertungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.demo_bewertungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.demo_bewertungen to authenticated;
revoke all on public.demo_rate_limit from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.demo_rate_limit to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.demo_rate_limit to authenticated;
revoke all on public.download_codes from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.download_codes to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.download_codes to authenticated;
revoke all on public.emergency_plan_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.emergency_plan_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.emergency_plan_runs to authenticated;
revoke all on public.external_agencies from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.external_agencies to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.external_agencies to authenticated;
revoke all on public.external_agency_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.external_agency_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.external_agency_requests to authenticated;
revoke all on public.facilities from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facilities to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facilities to authenticated;
revoke all on public.facility_oncall_days from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_oncall_days to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_oncall_days to authenticated;
revoke all on public.facility_settings from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_settings to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_settings to authenticated;
revoke all on public.facility_staff from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_staff to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.facility_staff to authenticated;
revoke all on public.feedback_answers from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.feedback_answers to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.feedback_answers to authenticated;
revoke all on public.feedback_interests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.feedback_interests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.feedback_interests to authenticated;
revoke all on public.flextime_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.flextime_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.flextime_requests to authenticated;
revoke all on public.gespraech_google_konten from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraech_google_konten to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraech_google_konten to authenticated;
revoke all on public.gespraech_sperrzeiten from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraech_sperrzeiten to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraech_sperrzeiten to authenticated;
revoke all on public.gespraechs_termine from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraechs_termine to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.gespraechs_termine to authenticated;
revoke all on public.invite_codes from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.invite_codes to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.invite_codes to authenticated;
revoke all on public.ip_sperren from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ip_sperren to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ip_sperren to authenticated;
revoke all on public.ki_monthly_adjustment_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ki_monthly_adjustment_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ki_monthly_adjustment_runs to authenticated;
revoke all on public.ki_plan_recommendations from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ki_plan_recommendations to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ki_plan_recommendations to authenticated;
revoke all on public.konto_anmeldungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.konto_anmeldungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.konto_anmeldungen to authenticated;
revoke all on public.leitung_einrichtungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.leitung_einrichtungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.leitung_einrichtungen to authenticated;
revoke all on public.mitarbeiter_kalender from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.mitarbeiter_kalender to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.mitarbeiter_kalender to authenticated;
revoke all on public.mitarbeiter_rechte from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.mitarbeiter_rechte to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.mitarbeiter_rechte to authenticated;
revoke all on public.nichterscheinen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.nichterscheinen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.nichterscheinen to authenticated;
revoke all on public.notfall_ausloesungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_ausloesungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_ausloesungen to authenticated;
revoke all on public.notfall_berechtigte from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_berechtigte to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_berechtigte to authenticated;
revoke all on public.notfall_rueckmeldungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_rueckmeldungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_rueckmeldungen to authenticated;
revoke all on public.notfall_vorlagen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_vorlagen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notfall_vorlagen to authenticated;
revoke all on public.notifications from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notifications to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.notifications to authenticated;
revoke all on public.nurvo_admins from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.nurvo_admins to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.nurvo_admins to authenticated;
revoke all on public.on_call_entries from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.on_call_entries to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.on_call_entries to authenticated;
revoke all on public.overtime_rebalance_suggestions from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.overtime_rebalance_suggestions to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.overtime_rebalance_suggestions to authenticated;
revoke all on public.payroll_entries from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.payroll_entries to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.payroll_entries to authenticated;
revoke all on public.payroll_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.payroll_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.payroll_runs to authenticated;
revoke all on public.personalakte from anon, authenticated;
revoke all on public.personalakte_eintraege from anon, authenticated;
revoke all on public.personalakte_protokoll from anon, authenticated;
revoke all on public.personalakte_verlauf from anon, authenticated;
revoke all on public.platform_settings from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.platform_settings to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.platform_settings to authenticated;
revoke all on public.ppbv_einstufung from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ppbv_einstufung to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ppbv_einstufung to authenticated;
revoke all on public.ppbv_records from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ppbv_records to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.ppbv_records to authenticated;
revoke all on public.roadmap_items from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.roadmap_items to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.roadmap_items to authenticated;
revoke all on public.schicht_belegung from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.schicht_belegung to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.schicht_belegung to authenticated;
revoke all on public.shift_assignments from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_assignments to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_assignments to authenticated;
revoke all on public.shift_difficulty_ratings from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_difficulty_ratings to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_difficulty_ratings to authenticated;
revoke all on public.shift_release_offers from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_release_offers to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_release_offers to authenticated;
revoke all on public.shift_release_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_release_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_release_requests to authenticated;
revoke all on public.shift_reports from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_reports to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_reports to authenticated;
revoke all on public.shift_swap_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_swap_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_swap_requests to authenticated;
revoke all on public.shift_templates from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_templates to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shift_templates to authenticated;
revoke all on public.shifts from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shifts to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.shifts to authenticated;
revoke all on public.sicherheits_ereignisse from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.sicherheits_ereignisse to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.sicherheits_ereignisse to authenticated;
revoke all on public.sick_reports from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.sick_reports to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.sick_reports to authenticated;
revoke all on public.simulator_runs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.simulator_runs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.simulator_runs to authenticated;
revoke all on public.springer_contacts from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_contacts to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_contacts to authenticated;
revoke all on public.springer_oncall from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_oncall to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_oncall to authenticated;
revoke all on public.springer_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.springer_requests to authenticated;
revoke all on public.staff from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff to authenticated;
revoke all on public.staff_availability from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_availability to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_availability to authenticated;
revoke all on public.staff_certificates from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_certificates to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_certificates to authenticated;
revoke all on public.staff_wishes from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_wishes to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staff_wishes to authenticated;
revoke all on public.staffing_needs from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staffing_needs to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.staffing_needs to authenticated;
revoke all on public.station_leaders from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.station_leaders to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.station_leaders to authenticated;
revoke all on public.station_tasks from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.station_tasks to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.station_tasks to authenticated;
revoke all on public.stations from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.stations to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.stations to authenticated;
revoke all on public.support_messages from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.support_messages to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.support_messages to authenticated;
revoke all on public.task_categories from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.task_categories to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.task_categories to authenticated;
revoke all on public.task_codes from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.task_codes to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.task_codes to authenticated;
revoke all on public.time_entries from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.time_entries to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.time_entries to authenticated;
revoke all on public.training_attendees from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.training_attendees to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.training_attendees to authenticated;
revoke all on public.trainings from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.trainings to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.trainings to authenticated;
revoke all on public.user_devices from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.user_devices to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.user_devices to authenticated;
revoke all on public.user_profiles from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.user_profiles to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.user_profiles to authenticated;
revoke all on public.vacation_requests from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.vacation_requests to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.vacation_requests to authenticated;
revoke all on public.verspaetungen from anon, authenticated;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.verspaetungen to anon;
grant MAINTAIN, REFERENCES, SELECT, TRIGGER on public.verspaetungen to authenticated;

-- Rechte auf Funktionen

revoke all on function public.execute_shift_swap(p_facility text, p_requester_shift uuid, p_target_shift uuid, p_requester_staff uuid, p_target_staff uuid, p_requester_name text, p_target_name text) from public, anon, authenticated;
grant execute on function public.execute_shift_swap(p_facility text, p_requester_shift uuid, p_target_shift uuid, p_requester_staff uuid, p_target_staff uuid, p_requester_name text, p_target_name text) to service_role;
revoke all on function public.get_my_facility() from public, anon, authenticated;
grant execute on function public.get_my_facility() to public;
grant execute on function public.get_my_facility() to anon;
grant execute on function public.get_my_facility() to authenticated;
grant execute on function public.get_my_facility() to service_role;
revoke all on function public.konto_anmeldung_festhalten(p_sitzung uuid, p_user uuid, p_ip text, p_land text, p_region text, p_stadt text, p_user_agent text, p_geraet text) from public, anon, authenticated;
grant execute on function public.konto_anmeldung_festhalten(p_sitzung uuid, p_user uuid, p_ip text, p_land text, p_region text, p_stadt text, p_user_agent text, p_geraet text) to service_role;
revoke all on function public.nurvo_sitzungen(ziel uuid) from public, anon, authenticated;
grant execute on function public.nurvo_sitzungen(ziel uuid) to service_role;
revoke all on function public.nurvo_sitzungen_beenden(ziel uuid, ausser uuid) from public, anon, authenticated;
grant execute on function public.nurvo_sitzungen_beenden(ziel uuid, ausser uuid) to service_role;
revoke all on function public.rate_limit_pruefen(p_key text, p_fenster_sekunden integer, p_limit integer) from public, anon, authenticated;
grant execute on function public.rate_limit_pruefen(p_key text, p_fenster_sekunden integer, p_limit integer) to service_role;
revoke all on function public.replace_shift_assignments(p_facility text, p_shift_ids uuid[], p_rows jsonb) from public, anon, authenticated;
grant execute on function public.replace_shift_assignments(p_facility text, p_shift_ids uuid[], p_rows jsonb) to service_role;
revoke all on function public.sicherheit_ereignis_melden(p_ip text, p_land text, p_region text, p_stadt text, p_art text, p_schwere text, p_punkte integer, p_methode text, p_pfad text, p_user_agent text, p_details jsonb, p_schwelle integer, p_fenster_sekunden integer, p_erlaubt boolean, p_mail_wunsch boolean) from public, anon, authenticated;
grant execute on function public.sicherheit_ereignis_melden(p_ip text, p_land text, p_region text, p_stadt text, p_art text, p_schwere text, p_punkte integer, p_methode text, p_pfad text, p_user_agent text, p_details jsonb, p_schwelle integer, p_fenster_sekunden integer, p_erlaubt boolean, p_mail_wunsch boolean) to service_role;

-- Speicher

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('app-data', 'app-data', 'f', null, NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('datenexport', 'datenexport', 'f', null, NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('personalakte', 'personalakte', 'f', 4194304, NULL) on conflict (id) do nothing;

-- Realtime

notify pgrst, 'reload schema';
