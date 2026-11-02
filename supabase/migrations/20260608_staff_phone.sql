-- Telefonnummer der Mitarbeiter (optional). ANDERS als die Bankverbindung wird
-- die Telefonnummer bewusst SERVERSEITIG gespeichert, damit Leitung/Stations-/
-- Bereichsleitung sie beim "als fehlend markieren"-Popup sehen und anrufen können.
--
-- Additiv & optional; Code liest/schreibt defensiv (Registrierung bleibt auch
-- vor dieser Migration funktionsfähig).

alter table invite_codes  add column if not exists preset_phone text;
alter table user_profiles add column if not exists phone text;
alter table facility_staff add column if not exists phone text;
