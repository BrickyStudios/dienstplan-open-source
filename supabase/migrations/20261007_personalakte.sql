-- ============================================================================
-- Digitale Personalakte
-- ============================================================================
--
-- WAS HIER LIEGT. Je Person einer Einrichtung eine Akte (personalakte) mit dem,
-- was der Personalstamm (facility_staff) nicht hat: Geburts- und Anschriftsdaten,
-- Steuer-ID und SV-Nummer, Krankenkasse, Eintritt/Austritt, Probezeit, Befristung,
-- Wochenstunden, Urlaubsanspruch laut Vertrag. Dazu beliebig viele Eintraege
-- (personalakte_eintraege): Vertrag, Vertragsaenderung, Mitarbeitergespraech,
-- Abmahnung, Fortbildung, Bescheinigung, Sonstiges — je mit Datum, Notiz,
-- Wiedervorlage und optional einem Dokument im privaten Storage-Bucket
-- "personalakte". Jeder Lese- und Schreibzugriff landet in personalakte_protokoll.
--
-- WAS HIER NICHT LIEGT. Steuerklasse, Kirchensteuer, Kinder und Stundensatz stehen
-- schon an facility_staff und werden dort weiter gepflegt (die Lohnabrechnung liest
-- sie von dort). Keine IBAN: die bleibt wie bisher nur im Browser der Leitung
-- (lib/localBank.ts). Keine Krankheitsdiagnosen — eine AU-Bescheinigung ist als
-- Dokument moeglich, ihr Inhalt wird nicht ausgewertet.
--
-- STEUER-ID UND SV-NUMMER liegen verschluesselt (AES-256-GCM, Schluessel in der
-- Umgebung PERSONALAKTE_SCHLUESSEL, nicht in der Datenbank). Fehlt der Schluessel,
-- speichert die App diese zwei Felder nicht und sagt das — alles andere geht.
--
-- ZUGRIFF. RLS an, keine Policy, nur service_role ueber app/api/leitung/personalakte
-- (Leitung der eigenen Einrichtung) und app/api/mitarbeiter/personalakte (nur die
-- eigene Akte, lesend — Einsichtsrecht nach § 83 BetrVG bzw. Art. 15 DSGVO).
-- Stations- und Bereichsleitungen sehen keine Akte.
--
-- OHNE DIESE DATEI bricht nichts: /personalakte zeigt den Hinweis, dass die
-- Migration fehlt; der taegliche Cron ueberspringt die Fristen.
--
-- Idempotent.
-- ============================================================================

create table if not exists personalakte (
  id              uuid primary key default gen_random_uuid(),
  facility_name   text not null,
  staff_id        uuid not null,           -- facility_staff.id
  full_name       text not null,

  -- Person
  geburtsdatum         date,
  geburtsort           text,
  geburtsname          text,
  staatsangehoerigkeit text,
  strasse              text,
  plz                  text,
  ort                  text,
  telefon_privat       text,
  email_privat         text,
  notfallkontakt       text,

  -- Steuer und Sozialversicherung (verschluesselt, siehe Kopf)
  steuer_id_enc        text,
  sv_nummer_enc        text,
  krankenkasse         text,

  -- Beschaeftigung
  taetigkeit           text,
  eintritt             date,
  probezeit_bis        date,
  befristet_bis        date,
  austritt             date,
  austrittsgrund       text,
  wochenstunden        numeric(5,2) check (wochenstunden is null or (wochenstunden >= 0 and wochenstunden <= 60)),
  urlaubstage_vertrag  integer check (urlaubstage_vertrag is null or (urlaubstage_vertrag >= 0 and urlaubstage_vertrag <= 60)),
  kuendigungsfrist     text,

  -- Welche Fristerinnerungen schon verschickt sind: Schluessel wie
  -- "probezeit:30:2026-12-31". Das Datum steht mit drin, damit eine geaenderte
  -- Frist neu erinnert.
  erinnert             jsonb not null default '[]'::jsonb,

  geaendert_am         timestamptz not null default now(),
  geaendert_von        text,

  unique (facility_name, staff_id)
);

create table if not exists personalakte_eintraege (
  id              uuid primary key default gen_random_uuid(),
  facility_name   text not null,
  staff_id        uuid not null,
  art             text not null check (art in (
                    'vertrag', 'vertragsaenderung', 'gespraech', 'abmahnung',
                    'fortbildung', 'bescheinigung', 'sonstiges')),
  datum           date not null,
  titel           text not null check (char_length(titel) between 1 and 200),
  notiz           text check (notiz is null or char_length(notiz) <= 5000),
  wiedervorlage   date,
  wiedervorlage_erinnert date,             -- fuer welches Datum schon erinnert wurde
  dokument_pfad   text,
  dokument_name   text,
  dokument_typ    text,
  dokument_bytes  integer,
  erstellt_von    text,
  erstellt_am     timestamptz not null default now()
);

create index if not exists personalakte_eintraege_person
  on personalakte_eintraege(facility_name, staff_id, datum desc);
create index if not exists personalakte_eintraege_wiedervorlage
  on personalakte_eintraege(facility_name, wiedervorlage) where wiedervorlage is not null;

create table if not exists personalakte_protokoll (
  id              uuid primary key default gen_random_uuid(),
  facility_name   text not null,
  staff_id        uuid not null,
  wer             text not null,
  rolle           text not null,           -- leitung | mitarbeiter | admin
  aktion          text not null,           -- gelesen | geaendert | eintrag_neu | eintrag_geloescht | dokument_geoeffnet
  details         text,
  am              timestamptz not null default now()
);

create index if not exists personalakte_protokoll_person
  on personalakte_protokoll(facility_name, staff_id, am desc);

alter table personalakte enable row level security;
alter table personalakte_eintraege enable row level security;
alter table personalakte_protokoll enable row level security;
revoke all on personalakte, personalakte_eintraege, personalakte_protokoll from anon, authenticated;

notify pgrst, 'reload schema';
