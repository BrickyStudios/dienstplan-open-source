-- Ablauf-Erinnerungen für Zertifikate (/api/cron/certificate-reminders, täglich).
-- Schließt die in docs/SYSTEM.md Kapitel 11 genannte Lücke: bisher wurde der Ablauf eines
-- Zertifikats nur berechnet und angezeigt, wenn jemand die Seite öffnete — nie aktiv gemeldet.
--
-- reminder_stage hält die höchste bereits ausgelöste Erinnerungsstufe für das aktuelle
-- Ablaufdatum eines Zertifikats. Die drei Schwellen (90/30/0 Tage, siehe Kapitel 16) sind
-- aufsteigend geordnet — dadurch löst jede Schwelle über die Laufzeit eines Zertifikats
-- höchstens einmal eine Erinnerung aus, auch wenn der Cron mehrfach am Tag oder nach einer
-- Pause läuft (lib/certificate-reminders.ts::decideCertificateReminder). Wird ein Zertifikat
-- erneuert, entsteht dafür eine neue Zeile (siehe app/api/leitung/certificates/route.ts,
-- app/api/mitarbeiter/certificates/route.ts) — reminder_stage startet dann automatisch wieder
-- bei NULL, ein manuelles Zurücksetzen ist nicht nötig.
alter table public.staff_certificates
  add column if not exists reminder_stage text
    check (reminder_stage in ('soon', 'urgent', 'expired'));

alter table public.staff_certificates
  add column if not exists last_reminded_at timestamptz;

comment on column public.staff_certificates.reminder_stage is
  'Höchste bereits ausgelöste Ablauf-Erinnerungsstufe: soon (<=90 Tage) | urgent (<=30 Tage) | expired (<0 Tage). NULL = noch keine Erinnerung gesendet.';

comment on column public.staff_certificates.last_reminded_at is
  'Zeitpunkt der letzten automatischen Ablauf-Erinnerung (Cron certificate-reminders).';

-- Protokoll jedes Cron-Laufs, analog zu auto_schedule_log (siehe Kapitel 22.3).
create table if not exists certificate_reminder_log (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  run_date date not null,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_certificate_reminder_log_run_date
  on certificate_reminder_log(run_date);

comment on table certificate_reminder_log is
  'Protokoll jedes Laufs von /api/cron/certificate-reminders (analog zu auto_schedule_log).';
