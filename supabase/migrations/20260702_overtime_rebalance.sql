-- Überstunden-Ausgleich: Modus je Einrichtung (aus/Vorschlag/automatisch).
-- 'off'     = nichts tun
-- 'suggest' = System erkennt Über-Stunden + schlägt der Leitung Ausgleich vor (Bestätigung)
-- 'auto'    = System baut Über-Stunden beim Planen selbst ab
-- Defensiv → bis zur Ausführung Default 'off' (Bestandsverhalten, kein Eingriff).
alter table public.facility_settings
  add column if not exists overtime_rebalance_mode text not null default 'off';

comment on column public.facility_settings.overtime_rebalance_mode is
  'Überstunden-Ausgleich: off | suggest | auto. Steuert, ob/wie das System Schichten von überlasteten Mitarbeitern abbaut/tauscht.';
