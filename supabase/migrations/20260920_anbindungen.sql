-- Anbindungen an Fremdsysteme: KIS, Pflegesoftware, Terminbuchung, Personaldienstleister.
--
-- WOZU. Nurvo steht in keiner Einrichtung allein. Der Personalstamm liegt im KIS oder
-- in der Pflegesoftware, die Belegung ebenfalls, und bei Ausfall ruft das Haus einen
-- Personaldienstleister an. Ohne Anbindung wird all das ein zweites Mal eingetippt —
-- und beim zweiten Mal anders.
--
-- WAS HIER *NICHT* ENTSTEHT: keine Tabelle fuer Patienten, keine fuer Diagnosen, keine
-- fuer Behandlungen. Aus einem KIS nimmt Nurvo Personal, Stationen und eine KOPFZAHL
-- je Station. Wer diese Datei erweitert, prueft das an jeder neuen Spalte; die
-- Begruendung steht ausfuehrlich in lib/anbindungen/hl7.ts.
--
-- Code-Referenzen: lib/anbindungen/*, app/api/leitung/anbindungen/*,
--   app/api/anbindungen/hl7/route.ts, app/api/anbindungen/kalender/[token]/route.ts,
--   app/(app)/(leitung)/anbindungen/page.tsx
--
-- Einmalig im Supabase-SQL-Editor ausfuehren (deployt NICHT automatisch mit).
-- Idempotent: ein zweiter Lauf aendert nichts.

-- ── 1) Die eingerichteten Anbindungen ───────────────────────────────────────────
create table if not exists anbindungen (
  id            uuid primary key default gen_random_uuid(),
  facility_name text not null,

  -- Welcher Eintrag aus lib/anbindungen/katalog.ts. Bewusst text und kein Fremdschluessel:
  -- der Katalog ist Code, keine Tabelle. Ein Eintrag, den es nicht mehr gibt, macht die
  -- Zeile hier lesbar kaputt statt unloeschbar.
  katalog_id    text not null,

  -- Wie die Einrichtung sie nennt ("ORBIS Haus Nord"). Zwei Anbindungen an dasselbe
  -- System sind erlaubt und kommen bei Traegern mit mehreren Haeusern vor.
  name          text not null,

  -- Der Adapter: fhir | hl7 | ics | vermittler | datei
  weg           text not null,

  aktiv         boolean not null default true,

  -- Nicht geheime Einstellungen: Basis-URL, Feldzuordnung, was uebernommen werden darf.
  -- Was hier steht, gibt die Leseroute heraus — Geheimnisse gehoeren nach unten.
  konfig        jsonb not null default '{}'::jsonb,

  -- ZUGANGSDATEN, VERSCHLUESSELT. Klartext waere hier falsch: Ein Lesezugriff auf das
  -- KIS eines Krankenhauses ist kein Passwort wie jedes andere. Verschluesselt wird in
  -- der Anwendung (lib/anbindungen/geheimnis.ts, AES-256-GCM) mit einem Schluessel aus
  -- der Umgebung, der NICHT in dieser Datenbank liegt. Wer die Datenbank hat, hat die
  -- Zugangsdaten damit noch nicht.
  geheimnis     text,

  -- Der Token, mit dem ein KIS seine HL7-Nachrichten schickt — als SHA-256, nie im
  -- Klartext. Gleiche Bauart wie ein Passwort: Wer die Tabelle liest, kann damit
  -- nichts einliefern.
  hl7_token_hash text,

  -- Das einrichtungseigene Salz fuer die Fall-Pseudonyme (siehe hl7.ts). Ohne Salz
  -- waere ein Hash ueber eine sechsstellige Fallnummer in Minuten zurueckgerechnet.
  -- Gilt fuer BEIDE Wege: HL7 hasht die Fallnummer, FHIR die Encounter-Id. Deshalb
  -- heisst die Spalte nicht hl7_salz.
  fall_salz     text,

  -- Der Token des Kalenderabos, ebenfalls als SHA-256. Wer ihn hat, sieht den
  -- Dienstplan — deshalb ist er widerrufbar (Zeile loeschen, neu anlegen).
  kalender_token_hash text,

  letzter_lauf    timestamptz,
  letzter_status  text,          -- ok | teilweise | fehler
  letzte_meldung  text,

  erstellt_am   timestamptz not null default now(),
  erstellt_von  text
);

create index if not exists anbindungen_facility on anbindungen(facility_name, aktiv);

-- Die beiden Token werden bei JEDEM eingehenden Aufruf nachgeschlagen, bevor bekannt
-- ist, zu welcher Einrichtung er gehoert. Ohne Index ist das ein Tabellendurchlauf je
-- HL7-Nachricht — bei einem Haus, das im Minutentakt sendet, jeden Tag 1440 davon.
create unique index if not exists anbindungen_hl7_token on anbindungen(hl7_token_hash)
  where hl7_token_hash is not null;
create unique index if not exists anbindungen_kalender_token on anbindungen(kalender_token_hash)
  where kalender_token_hash is not null;

alter table anbindungen enable row level security;
-- Bewusst ohne Policy: Zugriff laeuft ausschliesslich ueber den service_role-Client
-- (lib/admin-client.ts), die Mandantentrennung ueber resolveLeitung. RLS an + null
-- Policies = anon und authenticated sehen nichts. In dieser Tabelle stehen
-- Zugangsdaten zu fremden Systemen; sie ist der letzte Ort, an dem eine grosszuegige
-- Policy stehen darf (siehe den Befund vom 14.09.2026 zu external_agency_requests).

-- ── 2) Was wann lief ────────────────────────────────────────────────────────────
-- Ohne Protokoll ist eine Anbindung eine Blackbox: Sie laeuft, oder sie laeuft nicht,
-- und niemand kann sagen, seit wann. Genau diese Frage stellt die IT des Hauses als
-- erste, wenn Zahlen nicht stimmen.
create table if not exists anbindung_laeufe (
  id            uuid primary key default gen_random_uuid(),
  anbindung_id  uuid not null,
  facility_name text not null,
  gestartet_am  timestamptz not null default now(),
  dauer_ms      integer,
  status        text not null,        -- ok | teilweise | fehler
  saetze        integer not null default 0,
  meldung       text
);

create index if not exists anbindung_laeufe_anbindung
  on anbindung_laeufe(anbindung_id, gestartet_am desc);

alter table anbindung_laeufe enable row level security;

-- ── 3) Belegung je Station ──────────────────────────────────────────────────────
-- EINE ZEILE JE FALL, NICHT JE PATIENT. Gespeichert wird ein Pseudonym, ein Ort und
-- zwei Zeitpunkte — mehr braucht eine Kopfzahl nicht, und mehr darf ein
-- Dienstplanwerkzeug nicht haben.
--
-- Warum ueberhaupt je Fall und nicht gleich eine Zahl je Tag: Aus einem ADT-Strom
-- laesst sich keine Zahl ableiten, ohne die Faelle auseinanderzuhalten. Eine Verlegung
-- ist ein Abgang und ein Zugang; eine Korrektur darf nicht als zweite Aufnahme zaehlen;
-- eine Entlassung muss den richtigen Fall treffen. Wer nur zaehlt, zaehlt nach einer
-- Woche falsch.
create table if not exists anbindung_belegung (
  id             uuid primary key default gen_random_uuid(),
  facility_name  text not null,
  station        text not null,

  -- SHA-256 aus Salz und Fallnummer, 32 Zeichen. Nicht rueckrechenbar und zwischen
  -- zwei Einrichtungen nicht vergleichbar.
  fall_schluessel text not null,

  seit           timestamptz not null,
  bis            timestamptz,          -- null = liegt noch

  aufenthalt     text,                 -- I stationaer | O ambulant | E Notaufnahme
  quelle         text not null default 'hl7',
  anbindung_id   uuid,
  aktualisiert_am timestamptz not null default now()
);

-- HOECHSTENS EIN OFFENER ABSCHNITT JE FALL. Der Index ist bewusst ein Teil-Index:
-- Geschlossene Abschnitte duerfen sich haeufen, das IST die Verlaufsgeschichte
-- ("lag von Montag bis Mittwoch auf Station 1, danach auf Station 3"). Offen darf
-- immer nur einer sein — sonst zaehlt derselbe Mensch nach drei Verlegungen viermal.
--
-- Warum nicht eine Zeile je Fall, deren Station sich aendert: Dann waere die Frage
-- "wie viele lagen am Dienstag auf Station 1" nicht mehr zu beantworten, weil die
-- Vergangenheit ueberschrieben ist. Genau diese Frage stellt die Personalbemessung.
create unique index if not exists anbindung_belegung_fall_offen
  on anbindung_belegung(facility_name, fall_schluessel)
  where bis is null;

-- Der Verlauf wird nach Fall gelesen, wenn eine Zahl nachgeprueft wird.
create index if not exists anbindung_belegung_fall
  on anbindung_belegung(facility_name, fall_schluessel);

-- Die Abfrage der Auswertung: "wer lag am Tag X auf Station Y".
create index if not exists anbindung_belegung_station
  on anbindung_belegung(facility_name, station, seit);
create index if not exists anbindung_belegung_offen
  on anbindung_belegung(facility_name, station)
  where bis is null;

alter table anbindung_belegung enable row level security;

notify pgrst, 'reload schema';

-- ── Kontrollabfrage: 0 Zeilen = alles da ────────────────────────────────────────
select 'TABELLE FEHLT: ' || t.tabelle as befund
from (values ('anbindungen'), ('anbindung_laeufe'), ('anbindung_belegung')) as t(tabelle)
where to_regclass('public.' || t.tabelle) is null
union all
select 'SPALTE FEHLT: ' || t.tabelle || '.' || t.spalte
from (values
  ('anbindungen','katalog_id'), ('anbindungen','weg'), ('anbindungen','konfig'),
  ('anbindungen','geheimnis'), ('anbindungen','hl7_token_hash'), ('anbindungen','fall_salz'),
  ('anbindungen','kalender_token_hash'), ('anbindungen','letzter_status'),
  ('anbindung_laeufe','saetze'), ('anbindung_laeufe','status'),
  ('anbindung_belegung','fall_schluessel'), ('anbindung_belegung','bis')
) as t(tabelle, spalte)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = t.tabelle and c.column_name = t.spalte
);
