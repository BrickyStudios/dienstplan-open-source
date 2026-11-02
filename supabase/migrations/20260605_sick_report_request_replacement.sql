-- Pro Krankmeldung festhalten, ob die App automatisch Ersatz (externe Dienste)
-- anfragen soll. NULL = Standardverhalten der Einrichtung. false = ausdrücklich KEINE
-- automatische Anfrage. Die Endpunkte fügen die Spalte defensiv ein (Fallback ohne
-- sie), d.h. Krankmeldungen funktionieren auch vor dieser Migration weiter.
-- 20260605

alter table sick_reports
  add column if not exists request_replacement boolean;
