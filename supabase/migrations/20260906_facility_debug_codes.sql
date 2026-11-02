-- Konsolen-Debug-Codes je Einrichtung freischaltbar machen.
--
-- Hintergrund: Die Debug-Werkzeuge unter /debug bleiben ein reines Entwicklerwerkzeug
-- (lib/debug-auth.ts). Ein Pilotkunde steht aber vor demselben Problem wie wir — ohne
-- Personal im System laesst sich kein Dienstplan erzeugen. Mit diesem Flag kann ein
-- Nurvo-Admin einer EINZELNEN Einrichtung erlauben, Testdaten selbst anzulegen; die
-- Einrichtung gibt den Code dann in der Browser-Konsole ein (lib/debug-codes.ts).
--
-- Standard ist false: Ohne ausdrueckliche Freischaltung aendert diese Migration nichts.
-- Die Anwendung ist bis zur Ausfuehrung inert — fehlt die Spalte, gilt ueberall
-- "nicht freigeschaltet" (fail-closed), und der Schalter im Admin-Bereich zeigt statt
-- eines wirkungslosen Knopfes den Hinweis auf diese Datei.

alter table facility_settings
  add column if not exists debug_codes_enabled boolean default false;

-- Wer hat wann freigeschaltet. Nicht fuer die Anwendung noetig, sondern damit sich im
-- Nachhinein beantworten laesst, warum in einer Kundeneinrichtung "Mitarbeiter 1..N"
-- steht.
alter table facility_settings
  add column if not exists debug_codes_granted_at timestamptz;

alter table facility_settings
  add column if not exists debug_codes_granted_by text;

comment on column facility_settings.debug_codes_enabled is
  'Darf diese Einrichtung Debug-Codes in der Browser-Konsole ausfuehren? Nur ueber den Admin-Bereich setzbar.';
