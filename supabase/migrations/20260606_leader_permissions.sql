-- Rechte für Stations-/Bereichsleitungen — die Leitung kann ernannten Leitungen
-- gezielt erlauben, Urlaubsanträge und Dienstwünsche IHRER Station/IHRES Bereichs zu
-- bearbeiten. Standardmäßig AUS (default false).
-- 20260606
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Ohne diese Spalten bleibt das Feature inert: die Routen werten eine fehlende Spalte
-- als „Recht NICHT erteilt" (= aus) und degradieren sauber — also exakt das gewünschte
-- Standard-Verhalten, nur eben nicht abschaltbar, bis die Migration läuft.
--
-- Code-Referenzen: lib/leader-permissions.ts, app/api/leitung/facility-settings/route.ts,
-- app/api/mein-station/route.ts (+/review), app/api/mein-bereich/route.ts (+/review),
-- app/(app)/einstellungen, app/(app)/bereiche.

alter table facility_settings
  add column if not exists leaders_manage_vacation boolean not null default false;
alter table facility_settings
  add column if not exists leaders_manage_wishes boolean not null default false;

notify pgrst, 'reload schema';
