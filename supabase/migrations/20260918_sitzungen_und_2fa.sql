-- Sitzungen sichtbar machen und beenden koennen — und 2FA erzwingbar machen.
--
-- Aus Trello c/vgNXElMF: "Sicherheitsfunktionen aus better-auth einziehen". Die
-- Entscheidung fiel auf Variante B — die Funktionen einzeln auf Supabase Auth
-- nachziehen statt das Auth-Framework zu tauschen. Diese Datei liefert die beiden
-- Teile, die nicht in TypeScript gehen, weil sie im Schema `auth` liegen.
--
-- ── WARUM DAS NICHT OHNE SQL GEHT ─────────────────────────────────────────────────
-- supabase-js kann `auth.admin.signOut(jwt)` — aber nur mit dem Token DES NUTZERS.
-- Eine Leitung, die einer gekuendigten Kollegin den Zugang entzieht, hat dieses Token
-- nicht. Und `auth.sessions` liegt im Schema `auth`, das PostgREST nicht ausliefert.
-- Es gibt dafuer keine Admin-API; es gibt nur diesen Weg.
--
-- ── DAS LOCH, DAS DAMIT ZUGEHT ────────────────────────────────────────────────────
-- Bisher: Wer die Einrichtung verlaesst, bleibt angemeldet, bis das Refresh-Token
-- ablaeuft. Das Konto zu sperren half nicht — ein laufendes Access-Token gilt weiter,
-- und ein Refresh-Token erneuert es. Auf einem Stationsrechner, den mehrere benutzen,
-- ist das keine Theorie.
--
-- ── SICHERHEIT DIESER FUNKTIONEN ──────────────────────────────────────────────────
-- Beide sind SECURITY DEFINER und damit maechtiger als ihr Aufrufer. Deshalb:
--   * EXECUTE wird `public`, `anon` und `authenticated` ENTZOGEN und nur
--     `service_role` erteilt. Nur die API-Routen rufen sie, und die pruefen vorher,
--     WER fragt und ob das Ziel zur selben Einrichtung gehoert.
--   * `search_path` ist fest gesetzt. Ohne das kann ein Aufrufer mit eigenem Schema
--     die aufgerufenen Tabellen unterschieben — der klassische Fehler bei
--     SECURITY DEFINER.
--   * Sie geben kein Token heraus, nur Zeitpunkte und Geraeteangaben. Ein Token in
--     einer Antwort waere genau die Art Leck, die diese Karte schliessen soll.
--
-- Code-Referenzen: app/api/user/sitzungen/route.ts, lib/mfa.ts,
--   components/ZweiFaktor.tsx, components/Sitzungen.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Idempotent: ein zweiter Lauf aendert nichts.

-- ── 1) Sitzungen einer Person auflisten ─────────────────────────────────────────
-- `not_after` und `refreshed_at` gibt es erst ab GoTrue 2.x; aeltere Instanzen haben
-- die Spalten nicht. Deshalb wird nur gelesen, was sicher da ist.

create or replace function public.nurvo_sitzungen(ziel uuid)
returns table (
  id uuid,
  erstellt timestamptz,
  zuletzt timestamptz,
  aal text,
  geraet text,
  ip text
)
language sql
security definer
set search_path = auth, public
as $$
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
$$;

-- ── 2) Sitzungen beenden ────────────────────────────────────────────────────────
-- `ausser` laesst die eigene laufende Sitzung stehen: "Auf allen anderen Geraeten
-- abmelden" ist der Fall, den man taeglich braucht. NULL beendet alle — das ist der
-- Fall "Kollegin ist ausgeschieden".
--
-- Es reicht, die Zeile in auth.sessions zu loeschen: auth.refresh_tokens haengt per
-- Fremdschluessel daran und geht mit. Das Access-Token laeuft dann noch bis zu einer
-- Stunde, laesst sich aber nicht mehr erneuern.

create or replace function public.nurvo_sitzungen_beenden(ziel uuid, ausser uuid default null)
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  anzahl integer;
begin
  delete from auth.sessions s
  where s.user_id = ziel
    and (ausser is null or s.id <> ausser);
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;

-- ── 3) Nur der service_role darf das ────────────────────────────────────────────

revoke all on function public.nurvo_sitzungen(uuid) from public, anon, authenticated;
revoke all on function public.nurvo_sitzungen_beenden(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nurvo_sitzungen(uuid) to service_role;
grant execute on function public.nurvo_sitzungen_beenden(uuid, uuid) to service_role;

-- ── 4) Der Schalter fuer den Zwang ──────────────────────────────────────────────
-- 2FA ist fuer Leitung und Admin GEDACHT, aber nicht ab der ersten Minute erzwungen:
-- Wer den Zwang anschaltet, bevor jemand einen Faktor hinterlegt hat, sperrt die
-- Einrichtung aus ihrem eigenen Dienstplan aus. Deshalb ein Schalter je Einrichtung,
-- Standard AUS, und der Weg ist: erst alle Leitungen einrichten lassen, dann setzen.
--
-- Fuer Mitarbeitende gilt der Zwang NICHT und soll er nicht gelten — sie tippen am
-- Stationsrechner zwischen zwei Patienten. Ein zweiter Faktor ist dort Reibung ohne
-- passenden Nutzen; das Konto sieht ohnehin nur den eigenen Plan.

alter table public.facility_settings
  add column if not exists require_2fa_leitung boolean not null default false;

comment on column public.facility_settings.require_2fa_leitung is
  'Muessen Leitungs- und Admin-Konten dieser Einrichtung einen zweiten Faktor haben? '
  'Erst anschalten, wenn alle Leitungen einen hinterlegt haben — sonst sperrt es sie aus.';

-- ── 5) Nachsehen, ob es gelaufen ist ────────────────────────────────────────────
-- select public.nurvo_sitzungen('<eine user_id>');
-- select column_name from information_schema.columns
--   where table_name = 'facility_settings' and column_name = 'require_2fa_leitung';
