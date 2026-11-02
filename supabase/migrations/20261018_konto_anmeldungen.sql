-- Konto-Sicherheit für Kunden: jede neue Anmeldung festhalten, mit Ort und Gerät.
--
-- WARUM. `auth.sessions` (Migration 20260918, nurvo_sitzungen) kennt Gerät und IP, aber
-- keinen Ort, und eine Sitzung verschwindet beim Abmelden. Für „Warst du das?" braucht es
-- beides: wo eine Anmeldung herkam und ob das Gerät schon einmal da war. Diese Tabelle
-- ist das Gedächtnis dafür. Geschrieben wird sie aus proxy.ts beim ersten Seitenaufruf
-- einer neuen Sitzung (lib/sicherheit/konto.ts), mit den Geo-Köpfen von Vercel.
--
-- WER SIEHT WAS. RLS an, keine Policies, gelesen wird nur über den Server:
--   - die Person selbst: ihren ganzen Verlauf (/api/user/anmeldeverlauf);
--   - die Leitung: NUR Anmeldungen von neuem Gerät oder aus neuem Land, keine
--     gewöhnlichen Anmeldezeiten (/api/leitung/konto-sicherheit). Ein Anmeldeprotokoll
--     über Mitarbeitende wäre Verhaltenskontrolle — siehe components/Sitzungen.tsx.
--
-- AUFBEWAHRUNG. 180 Tage. Länger braucht der Vergleich „bekanntes Gerät" nicht.
--
-- Kurze Zeilen ohne do-Blöcke: Am 18.10.2026 brach beim Kopieren aus dem Chat eine
-- lange Zeile um, und der SQL-Editor meldete einen Syntaxfehler.

create table if not exists konto_anmeldungen (
  sitzung_id   uuid primary key,
  user_id      uuid not null,
  erstellt_am  timestamptz not null default now(),
  ip           text,
  land         text,
  region       text,
  stadt        text,
  user_agent   text,
  geraet       text not null,
  neu          boolean not null default false,
  gemeldet     boolean not null default false
);

create index if not exists konto_anmeldungen_user_zeit
  on konto_anmeldungen (user_id, erstellt_am desc);

alter table konto_anmeldungen enable row level security;

-- Eine Anmeldung eintragen und entscheiden, ob sie neu ist.
--
-- Neu heißt: Diese Person hat schon frühere Anmeldungen, aber keine mit demselben Gerät
-- (Betriebssystem + Browser) aus demselben Land. Die allererste Anmeldung ist nie neu —
-- sonst bekäme nach dem Einspielen jedes Konto eine Mail.
--
-- Mail: höchstens drei je Person und Tag, damit ein Angreifer mit vielen Geräten das
-- Postfach nicht flutet.
create or replace function konto_anmeldung_festhalten(
  p_sitzung    uuid,
  p_user       uuid,
  p_ip         text,
  p_land       text,
  p_region     text,
  p_stadt      text,
  p_user_agent text,
  p_geraet     text
) returns jsonb
language plpgsql
as $$
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
$$;

revoke all on function konto_anmeldung_festhalten from public;
revoke all on function konto_anmeldung_festhalten from anon;
revoke all on function konto_anmeldung_festhalten from authenticated;
grant execute on function konto_anmeldung_festhalten to service_role;

-- Fehlversuche je Konto schnell finden (Anmeldeverlauf, Leitungsansicht).
create index if not exists sicherheits_ereignisse_konto
  on sicherheits_ereignisse ((details->>'konto'), erstellt_am desc)
  where art = 'login_fehlgeschlagen';

-- Prüfabfrage: muss eine Zeile zeigen, rowsecurity = true.
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename = 'konto_anmeldungen';
