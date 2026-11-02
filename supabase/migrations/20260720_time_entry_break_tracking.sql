-- Pausen-Compliance je Zeiteintrag: beim Auschecken serverseitig festgehalten, damit die
-- Leitung nachvollziehen kann, ob die gesetzliche Mindestpause (ArbZG §4) eingehalten wurde.
-- Basis ist die tatsächlich gearbeitete Netto-Zeit (duration_minutes, Pausen bereits abgezogen):
--   > 9 h Arbeitszeit → 45 min · > 6 h → 30 min · sonst keine Pflicht.
-- break_compliant = (genommene Pause >= required_break_minutes). NULL = noch kein Checkout /
-- vor dieser Migration erfasst.
alter table time_entries add column if not exists required_break_minutes integer;
alter table time_entries add column if not exists break_compliant boolean;

comment on column time_entries.required_break_minutes is
  'Gesetzlich vorgeschriebene Mindestpause (ArbZG §4) auf Basis der Netto-Arbeitszeit, beim Checkout berechnet.';
comment on column time_entries.break_compliant is
  'true = genommene Pause >= required_break_minutes; false = zu früh/ohne Pflichtpause beendet; NULL = unbekannt.';
