-- Personalakte: Krankschreibungen und weitere Fehlzeiten mit Zeitraum (09.10.2026)
--
-- Bis hierher kannte die Akte unter „Fehlzeiten" nur, was der Dienstplan von selbst
-- liefert: Krankmeldungen je Dienst und bestätigtes Nichterscheinen. Eine Krankschreibung
-- (AU-Bescheinigung) über zwei Wochen, ein Arbeitsunfall, „Kind krank", Sonderurlaub,
-- Mutterschutz oder Elternzeit ließ sich nirgends festhalten — höchstens als „Sonstiges"
-- mit einem Datum, ohne Ende, ohne dass der Dienstplan davon wusste.
--
-- Neu:
--   · Eintragsarten 'krankschreibung' und 'fehlzeit'
--   · datum_bis — letzter Tag des Zeitraums (datum ist der erste)
--   · grund     — bei 'fehlzeit' die Art der Abwesenheit (Liste in lib/personalakte/fehlzeiten.ts)
--
-- Der Dienstplan behandelt diese Zeiträume als Abwesenheit (lib/scheduling/plan-context.ts):
-- Wer krankgeschrieben ist, wird nicht eingeplant. Ausnahme: „unentschuldigt" — das ist ein
-- Vorfall, keine geplante Abwesenheit.
--
-- OHNE DIESE DATEI lehnt die Datenbank die beiden neuen Eintragsarten ab (die Seite sagt
-- das). Alles andere an der Akte läuft weiter.
--
-- Idempotent.

alter table personalakte_eintraege add column if not exists datum_bis date;
alter table personalakte_eintraege add column if not exists grund text;

alter table personalakte_eintraege drop constraint if exists personalakte_eintraege_art_check;
alter table personalakte_eintraege add constraint personalakte_eintraege_art_check check (art in (
  'vertrag', 'vertragsaenderung', 'eintritt', 'gespraech', 'abmahnung',
  'fortbildung', 'bescheinigung', 'zeugnis', 'austritt', 'sonstiges',
  'krankschreibung', 'fehlzeit'));

alter table personalakte_eintraege drop constraint if exists personalakte_eintraege_zeitraum_check;
alter table personalakte_eintraege add constraint personalakte_eintraege_zeitraum_check
  check (datum_bis is null or datum_bis >= datum);

-- Der Dienstplan fragt je Zeitraum: Wer ist zwischen von und bis abwesend?
create index if not exists personalakte_eintraege_abwesenheit
  on personalakte_eintraege (facility_name, art, datum, datum_bis)
  where art in ('krankschreibung', 'fehlzeit');

-- Prüfung: 2 Zeilen (datum_bis, grund) = Spalten da.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'personalakte_eintraege'
  and column_name in ('datum_bis', 'grund');
