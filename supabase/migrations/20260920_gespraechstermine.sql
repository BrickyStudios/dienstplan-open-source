-- Gespraechstermine: Interessenten waehlen Tag und Uhrzeit, wir nehmen an oder sagen ab.
--
-- WOZU. Bis hierher gab es genau einen Weg von der Website zu uns: das Formular
-- "Demo anfragen". Es schreibt eine Nachricht, und danach beginnt das Hin und Her, in
-- dem zwei Seiten Termine vorschlagen. Bei einem Vertriebszyklus von drei bis sechs
-- Monaten ist jede Runde davon eine Woche.
--
-- Wer einen Termin waehlen kann, waehlt einen. Deshalb diese Tabelle.
--
-- KEIN AUTOMATISCHER TERMIN. Der Wunsch steht auf 'angefragt' und gilt erst, wenn ihn
-- ein Mensch angenommen hat. Ausdrueckliche Vorgabe: "wir muessen das dann annehmen".
-- Technisch waere die Zusage billiger; sie waere aber auch ein Versprechen, das drei
-- Gruender mit vollem Kalender nicht halten koennen.
--
-- Code-Referenzen: lib/gespraech/termine.ts, lib/gespraech/mails.ts,
--   app/api/gespraech/*, app/gespraech/[token]/page.tsx,
--   components/marketing/sections/Gespraech.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Idempotent: ein zweiter Lauf aendert nichts.

create table if not exists gespraechs_termine (
  id            uuid primary key default gen_random_uuid(),

  -- Der gewuenschte Termin. Datum und Zeit getrennt, weil genau so gefiltert wird
  -- ("welche Fenster sind am 22.09. schon weg") und weil eine Ortszeit ohne Zone
  -- ehrlicher ist als ein timestamptz, das eine Genauigkeit vortaeuscht: Das Gespraech
  -- findet in deutscher Ortszeit statt, nicht an einem Punkt auf der Zeitachse.
  datum         date not null,
  zeit          time not null,

  -- Wer fragt. Pflicht sind Name, E-Mail und Einrichtung — dieselben drei wie beim
  -- Formular "Demo anfragen", damit beide Wege dieselbe Auskunft liefern.
  name          text not null,
  email         text not null,
  einrichtung   text not null,
  telefon       text,
  nachricht     text,

  -- angefragt | bestaetigt | abgesagt | abgelaufen
  status        text not null default 'angefragt',

  -- Der Einmal-Link aus der Benachrichtigungsmail, mit dem angenommen oder abgesagt
  -- wird. Als SHA-256, nie im Klartext: Wer die Tabelle liest, kann damit keinen Termin
  -- bestaetigen. Gleiche Bauart wie bei den Anbindungen.
  token_hash    text not null,

  beantwortet_am   timestamptz,
  beantwortet_von  text,
  -- Bei einer Absage: was dem Interessenten geschrieben wurde.
  absage_grund     text,

  -- Herkunft, rein zur Auswertung: welche Seite hat den Knopf gezeigt.
  quelle        text default 'startseite',

  erstellt_am   timestamptz not null default now()
);

-- EIN OFFENER ODER BESTAETIGTER TERMIN JE FENSTER. Teil-Index, weil abgesagte und
-- abgelaufene Wuensche sich haeufen duerfen und dasselbe Fenster wieder freigeben.
-- Ohne ihn koennten zwei Besucher im selben Augenblick dasselbe Fenster belegen und wir
-- muessten einem davon nachtraeglich absagen.
create unique index if not exists gespraechs_termine_fenster
  on gespraechs_termine(datum, zeit)
  where status in ('angefragt', 'bestaetigt');

create unique index if not exists gespraechs_termine_token
  on gespraechs_termine(token_hash);

-- Die Abfrage der Fensterliste: "was ist ab heute belegt".
create index if not exists gespraechs_termine_offen
  on gespraechs_termine(datum, status);

-- Missbrauchsschutz: wie oft hat dieselbe Adresse angefragt.
create index if not exists gespraechs_termine_email
  on gespraechs_termine(email, erstellt_am desc);

alter table gespraechs_termine enable row level security;
-- Bewusst ohne Policy: Zugriff laeuft ausschliesslich ueber den service_role-Client
-- (lib/admin-client.ts). RLS an + null Policies = anon und authenticated sehen nichts.
-- In dieser Tabelle stehen Name, E-Mail und Telefonnummer von Interessenten; die
-- oeffentliche Fensterliste gibt ausschliesslich Datum und Uhrzeit heraus, nie eine
-- Zeile daraus.

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: gespraechs_termine' as befund
where to_regclass('public.gespraechs_termine') is null
union all
select 'SPALTE FEHLT: gespraechs_termine.' || t.spalte
from (values
  ('datum'), ('zeit'), ('name'), ('email'), ('einrichtung'),
  ('status'), ('token_hash'), ('beantwortet_am'), ('absage_grund')
) as t(spalte)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'gespraechs_termine'
    and c.column_name = t.spalte
)
union all
select 'INDEX FEHLT: gespraechs_termine_fenster'
where to_regclass('public.gespraechs_termine_fenster') is null;
