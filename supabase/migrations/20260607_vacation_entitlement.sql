-- Urlaubsanspruch pro Mitarbeiter: einstellbarer Jahresanspruch + nachträglich von der
-- Leitung freigeschalteter Zusatz-Urlaub. Vorher war der Anspruch hart auf 30 Tage.
-- 20260607
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Ohne diese Spalten gilt für alle weiterhin 30 Tage / 0 Zusatz (Routen lesen defensiv,
-- fallen auf 30/0 zurück); Speichern eines Anspruchs/Zusatzes meldet „Migration erforderlich".
--
-- Code-Referenzen: app/api/mitarbeiter/vacation-requests, app/api/leitung/vacation-balances,
-- app/(app)/urlaub, app/(app)/(leitung)/urlaubsantraege.

alter table user_profiles add column if not exists vacation_days integer not null default 30;
alter table user_profiles add column if not exists vacation_bonus_days integer not null default 0;

notify pgrst, 'reload schema';
