-- Ratenbegrenzung in einem Zug: prüfen, zählen und eintragen, ohne Lücke dazwischen.
--
-- DER FEHLER, den diese Funktion schließt (Sicherheitsaudit 18.09.2026, Befund 2).
-- `lib/rate-limit.ts` las erst den Stand und schrieb danach die Zeile:
--
--     const { count } = await db.from("demo_rate_limit").select(..., { count: "exact" })…
--     db.from("demo_rate_limit").insert({ ip: key }).then(() => {});   // ohne await
--
-- Zwischen Lesen und Schreiben liegt kein Lock und keine Transaktion. 50 gleichzeitige
-- Anfragen lesen alle `count = 0` und kommen alle durch — gegen ein Limit von 2. Beim
-- öffentlichen KI-Test (`/api/ki/demo`) sind das bezahlte Modellaufrufe; genau dafür ist
-- der Riegel da.
--
-- WARUM EIN ADVISORY LOCK UND NICHT NUR "EINE FUNKTION". Insert-dann-zählen reicht nicht:
-- In READ COMMITTED sieht jede Transaktion nur ihre eigene und die bereits übernommenen
-- Zeilen — zwei gleichzeitige Läufe zählen beide 1. `pg_advisory_xact_lock` serialisiert
-- die Läufe pro Schlüssel und wird am Transaktionsende von selbst wieder freigegeben.
-- Gesperrt wird nur gegen denselben Schlüssel; andere IPs warten nicht.
--
-- GEZÄHLT WERDEN NUR DURCHGELASSENE ANFRAGEN. Eine abgewiesene legt keine Zeile an,
-- sonst verlängert jeder Neuversuch die eigene Sperre — wer einmal gesperrt ist, käme
-- durch Draufhalten nie wieder heraus.
--
-- Das Aufräumen alter Zeilen läuft hier mit, und zwar AUF DEN SCHLÜSSEL BESCHRÄNKT.
-- In `/api/demo/login` stand dafür ein `delete().lt("created_at", …)` OHNE
-- `eq("ip", …)` — es räumte die Zähler aller anderen Endpunkte mit weg, darunter die
-- 30-Tage-Riegel des KI-Tests (Befund 1 desselben Audits).

create or replace function rate_limit_pruefen(
  p_key              text,
  p_fenster_sekunden integer,
  p_limit            integer
) returns jsonb
language plpgsql
as $$
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
$$;

comment on function rate_limit_pruefen(text, integer, integer) is
  'Ratenbegrenzung atomar: prueft das Fenster, traegt bei Erlaubnis ein und raeumt alte Zeilen desselben Schluessels ab. Rueckgabe {erlaubt, anzahl}. Nur service_role.';

-- Nur die Service-Role. Waere die Funktion fuer anon/authenticated aufrufbar, koennte ein
-- Client sie mit einem fremden Schluessel aufrufen und dessen Zaehler hochtreiben.
revoke all on function rate_limit_pruefen(text, integer, integer) from public;
do $$ begin
  execute 'revoke all on function rate_limit_pruefen(text, integer, integer) from anon, authenticated';
exception when undefined_object then null; end $$;
do $$ begin
  execute 'grant execute on function rate_limit_pruefen(text, integer, integer) to service_role';
exception when undefined_object then null; end $$;
