-- Einsatz auf anderen Stationen (09.10.2026)
--
-- Bis hierher plante Nurvo jede Person ausschließlich auf ihrer eigenen Station
-- (user_profiles.station). Fiel auf Station B jemand aus, kam niemand von Station A in
-- Frage — auch nicht, wenn die Person dort schon oft ausgeholfen hat.
--
-- Diese Spalte hält fest, auf welchen WEITEREN Stationen eine Person einspringen darf. Die
-- Leitung setzt sie unter Mitarbeiter → Station. Genutzt wird sie von:
--   · der Planerzeugung (lib/scheduling/generate-plan-core.ts): erst wenn eine Schicht mit
--     dem eigenen Personal der Station nicht voll wird, kommen Befähigte anderer Stationen
--     dazu — als Springer eingeteilt (shift_assignments.is_springer);
--   · der Ausfallsuche bei Krankmeldung (rankReplacementCandidates), mit Abschlag hinter
--     dem Personal der Station selbst.
--
-- Leeres Feld = nur die eigene Station, wie bisher. Ohne diese Datei läuft alles weiter wie
-- vorher; nur die Auswahl „Darf außerdem einspringen auf" lässt sich nicht speichern.

alter table public.facility_staff
  add column if not exists einsatz_stationen text[] not null default '{}';

-- Prüfung: 1 Zeile "einsatz_stationen" = Spalte da.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'facility_staff' and column_name = 'einsatz_stationen';
