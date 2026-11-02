-- Gleitzeittage (Freizeitausgleich) + einstellbare Antrags-Grenzen + Urlaubsentgelt.
-- 20260830
--
-- WICHTIG: Migrationen laufen in diesem Projekt NICHT automatisch. Einmal im Supabase
-- SQL-Editor ausfuehren. Ohne diese Objekte bleibt das Feature inert: alle Routen lesen/
-- schreiben defensiv (42P01/42703/PGRST204 -> Gleitzeit ausgeblendet, Lohn wie bisher).
--
-- FACHLICH (siehe Wikipedia "Gleitzeit", § 2 Nr. 6 AZV):
-- Ein Gleitzeittag ist WEDER Urlaub nach dem BUrlG NOCH Sonderurlaub, sondern ein
-- Freizeitausgleich aus dem Arbeitszeitkonto in Hoehe eines Arbeitstages. Deshalb eine
-- EIGENE Tabelle und ein EIGENES Konto (user_profiles.flextime_hours) — nicht
-- vacation_requests / vacation_days. Genehmigungspflichtig durch die Leitung.
-- Mitbestimmungspflichtig nach § 87 Abs. 1 Nr. 2 BetrVG (Hinweis in den Einstellungen).
--
-- Code-Referenzen: app/api/mitarbeiter/flextime-requests, app/api/leitung/flextime-requests,
--   lib/flextime.ts, lib/legal-limits.ts, lib/payroll/run-payroll.ts (Urlaubsentgelt),
--   app/(app)/urlaub, app/(app)/(leitung)/urlaubsantraege, app/(app)/einstellungen.

-- ── Antraege auf Gleitzeittage ───────────────────────────────────────────────
-- Spiegelt vacation_requests: staff_id = user_profiles.id, englisches Status-Vokabular
-- pending/approved/declined (NICHT offen/beruecksichtigt/…).
create table if not exists public.flextime_requests (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null,
  facility_name text not null,
  from_date     date not null,
  to_date       date not null,
  days          integer not null default 1,
  -- Vom Konto abgebuchte Stunden (days x Stunden/Tag zum Zeitpunkt der Genehmigung).
  -- Festgehalten, damit eine spaetere Aenderung von overtime_hours_per_day die schon
  -- gebuchten Antraege nicht rueckwirkend verschiebt.
  hours         numeric not null default 0,
  reason        text,
  status        text not null default 'pending',
  review_note   text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid
);

create index if not exists idx_flextime_requests_staff
  on public.flextime_requests(staff_id, status);
create index if not exists idx_flextime_requests_facility
  on public.flextime_requests(facility_name, status, from_date);

comment on table public.flextime_requests is
  'Antraege auf Gleitzeittage (Freizeitausgleich aus dem Arbeitszeitkonto, § 2 Nr. 6 AZV) — kein Urlaub nach BUrlG.';

-- ── Arbeitszeitkonto (Gleitzeitguthaben) ─────────────────────────────────────
-- Gutschrift beim Finalisieren der Lohnabrechnung (overtime_compensation = 'flextime'),
-- Abbuchung beim Genehmigen eines Gleitzeittags. Kein negativer Saldo in v1: ein Antrag
-- ohne Deckung wird abgelehnt.
alter table public.user_profiles add column if not exists flextime_hours numeric not null default 0;

comment on column public.user_profiles.flextime_hours is
  'Gleitzeitguthaben in Stunden. Quelle: Ueberstunden bei overtime_compensation=flextime. Abbuchung bei genehmigtem Gleitzeittag.';

-- ── Einrichtungs-Einstellungen ───────────────────────────────────────────────
-- NULL bei den Limits = unbegrenzt. Jede Einrichtung entscheidet selbst; die App gibt
-- keine Norm vor, weist aber auf gesetzliche Grenzen hin (lib/legal-limits.ts).
alter table public.facility_settings add column if not exists flextime_enabled boolean not null default false;
alter table public.facility_settings add column if not exists flextime_max_days_per_week integer;
alter table public.facility_settings add column if not exists flextime_max_days_per_month integer;
-- Bestaetigung der Mitbestimmung nach § 87 Abs. 1 Nr. 2 BetrVG beim Aktivieren.
alter table public.facility_settings add column if not exists flextime_codetermination_ack boolean not null default false;

comment on column public.facility_settings.flextime_max_days_per_week is
  'Max. Gleitzeittage pro Kalenderwoche und Person. NULL = unbegrenzt.';

-- ── Lohnabrechnung: Transparenz je Posten ────────────────────────────────────
-- Wie overtime_hours (Migration 20260612) nur zur Nachvollziehbarkeit auf dem Beleg.
alter table public.payroll_entries add column if not exists vacation_days   numeric not null default 0;
alter table public.payroll_entries add column if not exists vacation_hours  numeric not null default 0;
alter table public.payroll_entries add column if not exists flextime_days   numeric not null default 0;
alter table public.payroll_entries add column if not exists flextime_hours  numeric not null default 0;
-- Ueberstunden, die NICHT ausgezahlt, sondern aufs Konto gebucht wurden (vacation/flextime).
-- Ohne diese Trennung wuerden gebankte Stunden doppelt verguetet: einmal als Stunden und
-- ein zweites Mal als bezahlter freier Tag.
alter table public.payroll_entries add column if not exists banked_hours    numeric not null default 0;

comment on column public.payroll_entries.vacation_hours is
  'Bezahlte Urlaubsstunden des Monats (Urlaubsentgelt) — in hours_worked enthalten.';
comment on column public.payroll_entries.banked_hours is
  'Ueberstunden, die statt Auszahlung aufs Urlaubs-/Gleitzeitkonto gebucht wurden.';

notify pgrst, 'reload schema';
