-- Eigene Produktanalytik reparieren — sie hat seit ihrer Einführung nichts geschrieben.
--
-- BEFUND
-- `app/api/track/route.ts` scheiterte bei JEDEM Aufruf, und der Fehler wurde verschluckt
-- (`catch { /* Never fail the user experience because of analytics */ }`). Die Absicht des
-- catch ist richtig — Analytik darf die App nie umbringen —, nur blieb dadurch ein
-- vollständiger Dauerausfall unsichtbar. Zwei unabhängige Ursachen:
--
--   1. Die Route schreibt `time_to_first_action_ms`. Diese Spalte gab es nie — in keiner
--      Migration. → PGRST204 bei jedem Aufruf, auch von Nicht-Angemeldeten. Dieselbe Spalte
--      liest auch app/api/admin/analytics/route.ts:144, die Auswertung lief also ebenfalls
--      ins Leere.
--   2. Die Route schreibt `user_id` als `"usr_" + anonHash(user.id)`, also einen Text. Die
--      Spalte war `uuid references auth.users(id)`. → 22P02 für jede angemeldete Person.
--
-- WARUM DAS SCHEMA NACHGIBT UND NICHT DER CODE
-- Die Pseudonymisierung ist Absicht: `anonHash` für die Person, `fac_…` für die Einrichtung.
-- Ein `uuid`-Fremdschlüssel auf `auth.users` ist das genaue Gegenteil davon — er wäre der
-- Klarbezug, den die Route gerade vermeiden will. Den Code an das Schema anzupassen hieße,
-- die Datenminimierung rückgängig zu machen, um einen Tippfehler zu heilen. Also umgekehrt.
--
-- Nach dieser Migration steht in der Tabelle kein Merkmal mehr, das eine Person ohne den
-- Server-Pepper (ANON_HASH_SECRET) rückführbar macht.
--
-- ACHTUNG: 20260529_features_oncall_agencies_analytics.sql stand nie in AUSFUEHREN.txt —
-- ob `analytics_events` in der Produktionsdatenbank überhaupt existiert, ist ungeprüft.
-- Diese Datei deckt beide Fälle ab: Sie legt die Tabelle in der KORRIGIERTEN Form an, falls
-- sie fehlt, und zieht andernfalls nur die beiden Abweichungen nach.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).
--
-- Code-Referenzen: app/api/track/route.ts, lib/useAnalytics.ts,
--   app/api/admin/analytics/route.ts

-- ── Fall A: Tabelle fehlt ganz → gleich richtig anlegen ──────────────────────────────
create table if not exists analytics_events (
  id                     uuid primary key default gen_random_uuid(),
  facility_name          text,                    -- pseudonym: "fac_" + HMAC
  user_id                text,                    -- pseudonym: "usr_" + HMAC, KEIN Fremdschlüssel
  session_id             text,
  event_name             text not null,
  page                   text,
  time_to_first_action_ms integer,
  properties             jsonb default '{}',
  created_at             timestamptz default now()
);

-- ── Fall B: Tabelle existiert in der alten Form → die zwei Abweichungen nachziehen ───

-- 0. Die beiden Policies aus 20260529 lösen, BEVOR der Spaltentyp geändert wird.
--
--    Ohne diesen Schritt bricht der Lauf ab (echter Fehler vom 16.09.2026):
--
--      ERROR: 0A000: cannot alter type of a column used in a policy definition
--      DETAIL: policy analytics_events_insert on table analytics_events
--              depends on column "user_id"
--
--    Postgres verweigert `alter column ... type`, solange eine Policy die Spalte
--    nennt. Beide tun das:
--      analytics_events_insert      with check (auth.uid() = user_id or user_id is null)
--      analytics_events_select_own  using      (auth.uid() = user_id)
--
--    SIE WERDEN NICHT NEU ANGELEGT, und das ist Absicht, kein Vergessen:
--
--    a) Sie wären nach der Umstellung sinnlos. `auth.uid()` ist eine uuid, `user_id`
--       danach ein Pseudonym der Form "usr_" + HMAC. Die Gleichung kann nie mehr
--       aufgehen — die Policies würden ohnehin niemanden mehr durchlassen.
--    b) Sie werden von nichts gebraucht. Schreiben (app/api/track/route.ts:37) und
--       Lesen (app/api/admin/analytics/route.ts) laufen beide über den
--       service_role-Schlüssel, und der umgeht RLS vollständig.
--    c) Ohne Policy ist die Tabelle STRENGER geschützt, nicht lockerer. RLS bleibt
--       eingeschaltet, und eine Tabelle mit aktivem RLS und null Policies weist
--       `anon` und `authenticated` komplett ab. Die alte Insert-Policy erlaubte
--       wegen `or user_id is null` jedem Browser, beliebige Zeilen in die
--       Analytik zu schreiben. Das fällt hier nebenbei mit weg.
drop policy if exists "analytics_events_insert"     on analytics_events;
drop policy if exists "analytics_events_select_own" on analytics_events;

-- 1. Fremdschlüssel auf auth.users lösen. Der Name wird nicht geraten, sondern aus dem
--    Katalog geholt — Postgres vergibt ihn automatisch, und er kann je nach
--    Entstehungsgeschichte abweichen.
do $$
declare
  fk_name text;
begin
  select conname into fk_name
  from pg_constraint
  where conrelid = 'analytics_events'::regclass
    and contype = 'f'
    and conkey = array[(
      select attnum from pg_attribute
      where attrelid = 'analytics_events'::regclass and attname = 'user_id'
    )::smallint];

  if fk_name is not null then
    execute format('alter table analytics_events drop constraint %I', fk_name);
  end if;
end $$;

-- 2. user_id auf text. Bestehende UUIDs bleiben als Text erhalten — sie stammen ohnehin aus
--    einer Zeit, in der nichts geschrieben wurde, die Tabelle ist also aller Voraussicht
--    nach leer.
alter table analytics_events
  alter column user_id type text using user_id::text;

-- 3. Die fehlende Spalte.
alter table analytics_events
  add column if not exists time_to_first_action_ms integer;

-- ── Indizes (idempotent, gelten für beide Fälle) ─────────────────────────────────────
create index if not exists analytics_events_created_at_idx on analytics_events(created_at desc);
create index if not exists analytics_events_event_name_idx on analytics_events(event_name);
create index if not exists analytics_events_facility_idx   on analytics_events(facility_name);

alter table analytics_events enable row level security;

notify pgrst, 'reload schema';

-- ── Kontrolle: 0 Zeilen = alles in Ordnung ───────────────────────────────────────────
select 'FEHLT: ' || spalte as befund
from (values ('user_id'), ('time_to_first_action_ms'), ('event_name'), ('session_id')) as s(spalte)
where not exists (
  select 1 from information_schema.columns
  where table_name = 'analytics_events' and column_name = s.spalte
)
union all
select 'user_id hat noch den falschen Typ: ' || data_type
from information_schema.columns
where table_name = 'analytics_events' and column_name = 'user_id' and data_type <> 'text'
union all
-- Haengt noch eine Policy an der Spalte, war der Lauf nicht vollstaendig — beim naechsten
-- Mal scheitert die Typaenderung an derselben Stelle wie am 16.09.2026.
select 'Policy haengt noch an user_id: ' || policyname
from pg_policies
where schemaname = 'public' and tablename = 'analytics_events'
  and coalesce(qual, '') || coalesce(with_check, '') like '%user_id%';
