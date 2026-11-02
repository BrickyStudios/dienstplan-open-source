-- „Nicht erschienen" — von der Leitung entschiedene Fälle (09.10.2026)
--
-- Nurvo ERKENNT nur einen Verdacht: eingeteilt, Dienst vorbei, kein Stempel, keine
-- Krankmeldung, kein genehmigter Urlaub (lib/nichterscheinen.ts). Ein Verdacht wird nie
-- gespeichert, er wird bei jedem Aufruf neu gerechnet. Gespeichert wird erst, was die
-- Leitung entschieden hat:
--
--   bestaetigt — die Person ist nicht zum Dienst erschienen. Erscheint in der
--                Personalakte (Bereich „Fehlzeiten"), im Dienstplan und in der Übersicht.
--   war_da     — Fehlalarm (Stempel vergessen, Dienst getauscht, abgesprochen). Bleibt
--                gespeichert, damit derselbe Verdacht nicht wiederkommt; erscheint
--                NIRGENDS als Fehlzeit.
--
-- Warum nicht automatisch: Ein vergessener Stempel ist kein Fehlverhalten. Eine
-- automatisch angelegte Fehlzeit in der Personalakte wäre genau die falsche Eintragung,
-- vor der lib/personalakte warnt. Und eine Auswertung von Anwesenheit ist eine technische
-- Einrichtung nach § 87 Abs. 1 Nr. 6 BetrVG — die betroffene Person sieht deshalb ihre
-- bestätigten Fälle selbst (Meine Personalakte).
--
-- Nur der Server liest und schreibt (RLS an, keine Policy).

create table if not exists public.nichterscheinen (
  id             uuid primary key default gen_random_uuid(),
  facility_name  text not null,
  shift_id       uuid not null,
  -- kanonische Person: user_profiles.id, wenn registriert, sonst facility_staff.id
  staff_id       uuid,
  staff_name     text not null,
  datum          date not null,
  schicht        text,
  station        text,
  status         text not null check (status in ('bestaetigt', 'war_da')),
  notiz          text,
  entschieden_von text,
  entschieden_am timestamptz not null default now(),
  unique (facility_name, shift_id, staff_name)
);

alter table public.nichterscheinen enable row level security;

create index if not exists nichterscheinen_facility_datum
  on public.nichterscheinen (facility_name, datum desc);
create index if not exists nichterscheinen_person
  on public.nichterscheinen (facility_name, staff_name, datum desc);

-- Prüfung: 1 Zeile mit "nichterscheinen" = Tabelle da.
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'nichterscheinen';
