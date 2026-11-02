-- Lohnabrechnung-Automatik: monatlich serverseitig (Vercel Cron auto-schedule) den
-- Lohnabrechnungs-ENTWURF des Vormonats erstellen und die Leitung benachrichtigen
-- ("Lohnabrechnung ist fertig — bitte Löhne überweisen"). Finalisieren + Überweisen
-- bleiben bewusst eine Aktion der Leitung; IBANs liegen weiterhin nur lokal auf dem
-- Gerät der Leitung (lib/localBank.ts) und werden nie an einen Server gesendet.
-- Default false → Bestandsverhalten unverändert (Feature opt-in pro Einrichtung).
alter table public.facility_settings
  add column if not exists auto_payroll_enabled boolean not null default false;
