-- Fachkraft oder nicht: ein Feld statt einer Zeichenkettensuche.
--
-- DER BEFUND. `lib/swap-ppbv.ts` entschied bis zum 21.09.2026 so, ob jemand examinierte
-- Pflegefachkraft ist:
--
--     r.includes("fachkraft") || r.includes("stationsleitung") || r.includes("examiniert")
--
-- `role` ist ein Freitextfeld. Wer „Pflegefachfrau“, „PFK“, „Gesundheits- und
-- Krankenpflegerin“ oder „exam. Altenpflegerin“ einträgt, zählt damit NICHT zur Quote.
-- Wer „Pflegehilfskraft in Ausbildung zur Fachkraft“ einträgt, zählt mit.
--
-- Das ist mehr als eine Unsauberkeit: Die Fachkraftquote ist der Kern des
-- landesrechtlichen Nachweises in der Pflegeeinrichtung (verbreitet 50 %), und die PpUGV
-- verlangt die Trennung Pflegefachkraft / Pflegehilfskraft in jeder Quartalsmeldung. Ein
-- Nachweis, der an einer Schreibweise hängt, hält keiner Prüfung stand — und er fällt
-- still falsch aus, nicht laut.
--
-- DIE STUFEN kommen aus § 113c SGB XI, nicht aus dem Bauch. Das Verfahren teilt das
-- Personal genau so auf:
--
--     fachkraft        Pflegefachkraft mit dreijähriger Ausbildung (examiniert)
--     hilfskraft_1j    Pflegehilfskraft mit ein- oder zweijähriger Ausbildung
--     hilfskraft_ohne  Pflegehilfskraft ohne pflegerische Ausbildung
--     sonstige         zählt nicht zur Pflege (Verwaltung, Hauswirtschaft, Ärztlicher Dienst)
--
-- WARUM ZWEI SPALTEN UND NICHT EINE. `qualifikation` ist beim Anlegen NULL. Der Code
-- leitet dann aus dem Freitext ab, was er kann — aber er merkt sich in
-- `qualifikation_bestaetigt`, dass das eine Vermutung ist. Ohne diese zweite Spalte
-- stünde die alte Unsicherheit nur in einem neuen Feld, und niemand wüsste mehr, welche
-- Zeile geprüft ist und welche geraten. Erst die Bestätigung durch die Leitung macht die
-- Angabe belastbar; bis dahin sagt der Nachweis, wie viele Zeilen noch ungeprüft sind.
--
-- NICHTS WIRD UMGESCHRIEBEN. `role` bleibt, wie es ist — es steht in Listen und Filtern.
-- Diese Migration legt nur an; die Ableitung passiert im Code (lib/qualifikation.ts).

alter table public.facility_staff
  add column if not exists qualifikation text
  check (qualifikation is null or qualifikation in ('fachkraft', 'hilfskraft_1j', 'hilfskraft_ohne', 'sonstige'));

alter table public.facility_staff
  add column if not exists qualifikation_bestaetigt boolean not null default false;

comment on column public.facility_staff.qualifikation is
  'Qualifikationsstufe nach § 113c SGB XI: fachkraft | hilfskraft_1j | hilfskraft_ohne | sonstige. NULL = noch nicht gesetzt, dann leitet der Code aus role ab.';

comment on column public.facility_staff.qualifikation_bestaetigt is
  'true = von der Leitung bestaetigt. false = aus dem Freitextfeld role abgeleitet und damit eine Vermutung.';

-- Der Nachweis fragt „wie viele Fachkraefte in dieser Schicht“ — also je Einrichtung und
-- Stufe. Ein Index darauf kostet nichts und spart den Tabellendurchlauf.
create index if not exists facility_staff_qualifikation
  on public.facility_staff (facility_name, qualifikation);
