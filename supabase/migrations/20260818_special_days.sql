-- Standort-Pflichtfeld + Sondertage-Konfiguration (Karneval, Silvester, regionale Ereignisse
-- wie Oktoberfest). Docs: docs/SYSTEM.md Kapitel 5 (Onboarding), 6.6 (Bedarf), 7/8 (Planer).
--
-- bundesland/ort: Standort der Einrichtung. bundesland ist NICHT `not null` — Bestandskunden
-- hätten sonst eine kaputte Zeile. Stattdessen erzwingt das Onboarding es für NEUE
-- Einrichtungen in der Anwendungsschicht (app/api/onboarding/complete/route.ts), und
-- app/(app)/einstellungen/page.tsx zeigt Bestandskunden einen nicht blockierenden Hinweis,
-- solange bundesland fehlt. Werte sind die 16 deutschen Bundesländer als Klartext, konsistent
-- geschrieben (z.B. "Bayern", nicht "bayern"/"BY") — Validierung dafür in der UI
-- (lib/scheduling/special-days.ts: GERMAN_STATES), kein DB-Constraint (einfacher zu erweitern/
-- migrieren, gleiche Wahl wie plan/understaffing_mode in diesem Projekt).
--
-- special_days: Sondertage, die den Personalbedarf erhöhen. Format siehe
-- lib/scheduling/special-days.ts (SpecialDay-Typ) — von dort aus geteilt zwischen
-- generate-shifts, resync-shift-demand UND der (separat gebauten) KI-Anpassungsschicht.
-- Default '[]' (nicht null), damit Konsumenten nie auf null prüfen müssen.
--
-- special_days_learned_month: Gate für den monatlichen statistischen Lern-Lauf
-- (lib/scheduling/special-day-learning.ts, Aufgabe 4) — verhindert, dass derselbe Monat
-- mehrfach analysiert wird und doppelte "pending"-Vorschläge erzeugt. Analog zum Muster
-- von ki_plan_recommendations (analyzed_year/analyzed_month), hier als einzelnes
-- "YYYY-MM"-Textfeld auf facility_settings statt eigener Tabelle, weil es nur einen
-- Zeitstempel braucht, keine Historie.
--
-- Defensiv (IF NOT EXISTS) → bis zur Ausführung fällt das Onboarding beim Speichern von
-- bundesland/ort/special_days still auf "nicht gespeichert" zurück (PGRST204-Fallback in
-- den jeweiligen Routen), bricht aber nicht ab.
alter table public.facility_settings
  add column if not exists bundesland text;

alter table public.facility_settings
  add column if not exists ort text;

alter table public.facility_settings
  add column if not exists special_days jsonb not null default '[]'::jsonb;

alter table public.facility_settings
  add column if not exists special_days_learned_month text;

comment on column public.facility_settings.bundesland is
  'Bundesland der Einrichtung, eines der 16 deutschen Bundesländer als Klartext (z.B. "Bayern"). Pflichtfeld für NEUE Einrichtungen (Onboarding-Schritt "Standort"), bei Bestandskunden ggf. NULL — siehe nicht-blockierenden Hinweis in den Einstellungen.';

comment on column public.facility_settings.ort is
  'Ort/Stadt der Einrichtung, Freitext, optional (z.B. "München"). Rein informativ, aktuell ohne Auswirkung auf die Bedarfsrechnung.';

comment on column public.facility_settings.special_days is
  'Sondertage, die den Personalbedarf erhöhen (Karneval, Silvester, regionale Ereignisse wie Oktoberfest). Array von SpecialDay-Objekten, Schema in lib/scheduling/special-days.ts. kind: "fixed" (Monat/Tag) | "computed" (Ostern-relativ) | "regional" (an facility_settings.bundesland gekoppelt) | "learned" (statistisch erkannt, siehe special_days_learned_month, muss von der Leitung bestätigt werden: status wechselt erst durch UI-Bestätigung von "pending" auf "active"). Wird von lib/scheduling/shift-demand.ts (applySpecialDayDemand) in generate-shifts UND resync-shift-demand angewendet.';

comment on column public.facility_settings.special_days_learned_month is
  'Letzter Monat ("YYYY-MM"), für den der statistische Sondertage-Lernlauf (lib/scheduling/special-day-learning.ts) bereits gelaufen ist — verhindert doppelte "pending"-Vorschläge bei mehrfachem Cron-Lauf im selben Monat. Analog zum ki_plan_recommendations-Gate für die KI-Monatsanalyse.';

notify pgrst, 'reload schema';
