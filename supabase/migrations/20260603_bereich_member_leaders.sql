-- Bereichs-Leiter: die Leitung kann zugewiesene Mitarbeiter zu Leitern eines
-- Bereichs ernennen (mehrere möglich). Leiter sehen ihre Bereiche in der
-- Mitarbeiter-Ansicht und dürfen dort zusätzlich Aufgaben anlegen.
-- 20260603
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Ohne diese Spalte funktioniert die Leiter-Ernennung nicht (kein Aufgaben-Hinzufügen
-- in der Mitarbeiter-Ansicht). Die Routen lesen bereich_members mit select("*"),
-- d.h. solange die Spalte fehlt gilt einfach: niemand ist Leiter (kein Hard-Fail).

alter table bereich_members
  add column if not exists is_leader boolean not null default false;
