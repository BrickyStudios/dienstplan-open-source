-- Beruf beim Einladen mitgeben (09.10.2026)
--
-- Die Leitung wählt beim Anlegen jetzt den Beruf (Pflegefachkraft, Oberärztin, Reinigungskraft …,
-- Katalog in lib/berufe.ts). Bis zum Einlösen des Codes gibt es die Person in facility_staff noch
-- nicht — der Beruf reist deshalb wie Station und Stundenzahl als Vorbelegung im Code mit und
-- wird beim Einlösen nach facility_staff.role übernommen. Danach wird er geleert
-- (lib/invite-presets.ts), wie alle anderen preset_*-Spalten.
--
-- OHNE DIESE DATEI: Anlegen funktioniert weiter, aber der gewählte Beruf geht beim Einladen
-- verloren — die Person kommt als „Pflegekraft“ an und muss in der Mitarbeiterliste von Hand
-- umgestellt werden. Der Planer würde eine Ärztin dann wie eine Pflegekraft einplanen.

alter table invite_codes add column if not exists preset_role text;

-- Prüfen: 1 Zeile = da.
select column_name from information_schema.columns
 where table_name = 'invite_codes' and column_name = 'preset_role';
