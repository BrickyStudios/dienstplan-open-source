-- Sicherheitswacht: verdächtige Anfragen festhalten, Angreifer-IPs automatisch sperren.
--
-- WARUM ES DAS GIBT (OSINT-/Breach-Scan vom 17.10.2026, docs/sicherheit/OSINT-SCAN-20261017.md).
-- Auf dem Hobby-Tarif hält Vercel Laufzeit-Logs eine Stunde und CDN-Logs zwölf Stunden,
-- und keines von beiden enthält die IP. Ein Abtastversuch vom Vormittag war am Abend nur
-- noch als „Land: VN, Pfad: /api/session/properties" zu sehen — wer es war, wie oft und ob
-- danach noch etwas kam, ließ sich nicht mehr sagen. Diese beiden Tabellen sind das
-- Gedächtnis, das dort fehlt.
--
-- WER SCHREIBT. Nur der Server mit dem service_role-Schlüssel (lib/sicherheit/wacht.ts),
-- und zwar ausschließlich über die Funktion unten. RLS ist an, Policies gibt es keine:
-- anon und authenticated sehen und schreiben hier nichts.
--
-- AUFBEWAHRUNG. Ereignisse 90 Tage (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an
-- der Abwehr von Angriffen; die IP ist ein personenbezogenes Datum). Das Aufräumen läuft in
-- der Funktion mit, gelegentlich statt bei jedem Aufruf.

create table if not exists sicherheits_ereignisse (
  id            bigint generated always as identity primary key,
  erstellt_am   timestamptz not null default now(),
  ip            text not null,
  land          text,
  region        text,
  stadt         text,
  art           text not null,
  schwere       text not null check (schwere in ('info', 'warnung', 'kritisch')),
  punkte        integer not null default 0,
  methode       text,
  pfad          text,
  user_agent    text,
  details       jsonb not null default '{}'::jsonb,
  hat_gesperrt  boolean not null default false,
  gemeldet      boolean not null default false
);

create index if not exists sicherheits_ereignisse_ip_zeit on sicherheits_ereignisse (ip, erstellt_am desc);
create index if not exists sicherheits_ereignisse_zeit    on sicherheits_ereignisse (erstellt_am desc);

alter table sicherheits_ereignisse enable row level security;

comment on table sicherheits_ereignisse is
  'Verdächtige Anfragen (Scanner-Pfade, fehlgeschlagene Anmeldungen, Rate-Limit, verweigerter Admin-Zugriff). Nur service_role. 90 Tage.';

-- Eine Zeile je IP, die jemals gesperrt war. Aktiv ist eine Sperre, solange sie nicht
-- aufgehoben ist und gesperrt_bis in der Zukunft liegt (null = dauerhaft). Die Zeile bleibt
-- nach dem Ablauf stehen: Wer wiederkommt, wird beim zweiten Mal länger gesperrt.
create table if not exists ip_sperren (
  ip              text primary key,
  grund           text not null,
  gesperrt_am     timestamptz not null default now(),
  gesperrt_bis    timestamptz,
  anzahl_sperren  integer not null default 1,
  von             text not null default 'automatisch',
  aufgehoben_am   timestamptz,
  aufgehoben_von  text
);

alter table ip_sperren enable row level security;

comment on table ip_sperren is
  'Gesperrte IP-Adressen. Aktiv = aufgehoben_am is null and (gesperrt_bis is null or gesperrt_bis > now()). Nur service_role.';

-- ── Ein Ereignis melden, in einem Zug ─────────────────────────────────────────────
--
-- Eintragen, Punkte im Fenster zusammenzählen, bei Überschreiten sperren und entscheiden,
-- ob eine Mail fällig ist — unter einem Advisory-Lock je IP, aus demselben Grund wie bei
-- rate_limit_pruefen (20260920_rate_limit_atomar.sql): Ohne Lock zählen zwanzig gleichzeitige
-- Scanner-Anfragen alle dieselbe Summe, und keine sperrt.
--
-- Gezählt wird ab der letzten Aufhebung. Hebt ein Admin eine Sperre auf, liegen die Punkte,
-- die zur Sperre geführt haben, noch im Fenster — ohne diese Grenze sperrte der nächste
-- Tippfehler die IP sofort wieder.
--
-- Mails: jede neue Sperre, sonst höchstens eine je IP und Stunde; zwanzig je Stunde insgesamt. Ein
-- verteilter Scan aus tausend Adressen soll das Postfach nicht unbrauchbar machen.
create or replace function sicherheit_ereignis_melden(
  p_ip               text,
  p_land             text,
  p_region           text,
  p_stadt            text,
  p_art              text,
  p_schwere          text,
  p_punkte           integer,
  p_methode          text,
  p_pfad             text,
  p_user_agent       text,
  p_details          jsonb,
  p_schwelle         integer,
  p_fenster_sekunden integer,
  p_erlaubt          boolean,
  p_mail_wunsch      boolean
) returns jsonb
language plpgsql
as $$
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
$$;

-- Kurze Zeilen und ohne do-Blöcke: Die erste Fassung hatte hier 180 Zeichen lange Zeilen mit
-- der vollen Argumentliste, und beim Kopieren aus dem Chat brach eine davon um — der
-- SQL-Editor meldete „syntax error at or near do“. Der Name allein reicht, es gibt die
-- Funktion nur einmal. anon, authenticated und service_role gibt es in jedem Supabase.
comment on function sicherheit_ereignis_melden is
  'Trägt ein Sicherheitsereignis ein, zählt die Punkte der IP im Fenster, sperrt bei Überschreiten und sagt, ob eine Mail fällig ist. Nur service_role.';

revoke all on function sicherheit_ereignis_melden from public;
revoke all on function sicherheit_ereignis_melden from anon;
revoke all on function sicherheit_ereignis_melden from authenticated;
grant execute on function sicherheit_ereignis_melden to service_role;

-- Prüfabfrage: muss zwei Zeilen zeigen, beide mit rowsecurity = true.
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in ('sicherheits_ereignisse', 'ip_sperren');
