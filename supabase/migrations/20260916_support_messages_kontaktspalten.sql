-- Kontaktspalten fuer Website-, Demo- und Wartelisten-Anfragen.
--
-- Bisher standen diese Spalten nur als KOMMENTAR im Code
-- (app/api/demo-anfrage/route.ts, Zeile 75 ff.). In supabase/migrations/ tauchte
-- support_messages ausschliesslich in 20260519_rls_tenant_isolation.sql auf — eine
-- Datei, die die Spalten anlegt, gab es nie.
--
-- WAS OHNE DIESE DATEI PASSIERT:
--   /api/website-contact faengt den Schemafehler ab und schreibt einen Minimal-
--   Datensatz: die Anfrage landet OHNE Name, Telefon, Einrichtung und Rolle in der
--   Tabelle. Es kommt nur noch eine E-Mail-Adresse an.
--   /api/demo-anfrage schlaegt bei user_id NOT NULL ganz fehl und meldet
--   "DB-Migration fehlt".
--   Das ist genau der Kanal, ueber den die ersten Kunden hereinkommen.
--
-- Ob der Fall in der produktiven Datenbank eintritt, ist aus dem Repo nicht
-- erkennbar — die Kontrollabfrage unten sagt es. Die Datei gehoert unabhaengig
-- davon ins Repo, damit der naechste Aufbau (Self-Hosting-Kit) sie mitbekommt.
--
-- Idempotent: auf einer vollstaendigen Datenbank aendert sie nichts.

-- Anfragen von der Website haben keinen angemeldeten Nutzer.
alter table public.support_messages alter column user_id drop not null;

alter table public.support_messages
  add column if not exists is_demo_request      boolean default false,
  add column if not exists contact_name         text,
  add column if not exists contact_email_public text,
  add column if not exists contact_facility     text,
  add column if not exists contact_role         text,
  add column if not exists contact_phone        text;

-- ── Kontrollabfrage ─────────────────────────────────────────────────────────────
-- Nach dem Ausfuehren mitlaufen lassen: 0 Zeilen = alles da.
-- Kommt eine Zeile zurueck, fehlt genau die genannte Spalte noch.
select c.name as fehlende_spalte
from (values ('is_demo_request'),('contact_name'),('contact_email_public'),
             ('contact_facility'),('contact_role'),('contact_phone')) as c(name)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'support_messages'
    and column_name = c.name
);
