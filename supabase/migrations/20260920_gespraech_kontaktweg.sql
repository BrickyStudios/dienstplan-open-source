-- Gesprächstermine: auf welchem Weg gesprochen wird.
--
-- Telefon, Microsoft Teams oder Zoom. Bei Telefon ist die Rufnummer Pflicht — das
-- erzwingt die Route, nicht die Datenbank: Eine Bedingung über zwei Spalten würde auch
-- die Zeilen von vor dieser Migration treffen, und die haben beides nicht.
--
-- NULL heißt "vor dem 20.09.2026 gebucht, damals gab es die Wahl nicht". Deshalb kein
-- DEFAULT: Ein aufgesetztes 'telefon' auf alten Zeilen wäre eine Behauptung über etwas,
-- das niemand gesagt hat, und die Bestätigungsmail würde sie weitertragen.

alter table public.gespraechs_termine
  add column if not exists kontaktweg text
  check (kontaktweg is null or kontaktweg in ('telefon', 'teams', 'zoom'));

comment on column public.gespraechs_termine.kontaktweg is
  'Wie das Gespräch stattfindet: telefon | teams | zoom. NULL = vor dem 20.09.2026 gebucht.';
