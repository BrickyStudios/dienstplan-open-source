-- Fachkraftquote je Einrichtung — Mindestanteil examinierter Pflegefachkräfte pro Schicht.
-- Default 0.5 = § 113 SGB XI (stationäre Pflege: mind. 50 % Fachkräfte). Kliniken/PpUGV können
-- in den Einstellungen abweichend setzen. Wird vom Schichttausch-PPBV-Schutz (lib/swap-ppbv.ts)
-- ausgewertet: ein Tausch, der eine Schicht unter diese Quote drücken würde, wird im Automatik-/
-- Kollegen-Pfad blockiert; im manuellen Pfad sieht die Leitung eine Warnung und kann überstimmen.
--
-- Einmalig im Supabase SQL-Editor ausführen (deployt NICHT automatisch mit).

alter table facility_settings
  add column if not exists fachkraft_quote numeric not null default 0.5
  check (fachkraft_quote >= 0 and fachkraft_quote <= 1);
