-- Ergaenzung zu 20260723_ppbv_records.sql: zwei Spalten, damit ein festgeschriebener
-- PPBV-Nachweis sich selbst erklaert.
--
-- Warum ueberhaupt noetig: Ein Nachweis belegt, wie es WAR. Ab jetzt gibt es drei Wege,
-- auf denen eine Zeile entsteht — der taegliche Cron schreibt den Vormonat automatisch
-- fest, die Leitung holt einen zurueckliegenden Monat von Hand nach, oder sie ersetzt
-- einen bestehenden Beleg bewusst durch eine Korrektur. Wer den Beleg spaeter prueft,
-- muss diese drei auseinanderhalten koennen; sonst steht da nur ein Zeitstempel ohne
-- Aussage darueber, wie er zustande kam.
--
-- generated_by_user_id statt eines Namens: Datenschutz-Vorgabe des Betreibers — neue
-- Spalten tragen keine Klarnamen. Der Name wird, falls er ueberhaupt gezeigt wird, beim
-- Anzeigen ueber user_profiles dazugeholt. Die aeltere Spalte generated_by (text) bleibt
-- unangetastet, wird von der Anwendung aber nicht mehr befuellt.
--
-- Defensiv in zwei Richtungen:
--   * Laeuft 20260723 noch nicht, tut diese Datei nichts (statt mit "relation does not
--     exist" abzubrechen) — beide Dateien koennen in beliebiger Reihenfolge im
--     SQL-Editor landen.
--   * Fehlen die Spalten, laeuft die Anwendung trotzdem: lib/ppbv-archive.ts faellt bei
--     42703/PGRST204 auf das Einfuegen ohne diese beiden Spalten zurueck. Dann fehlt nur
--     die Herkunftsangabe, nicht der Nachweis.

do $$
begin
  if to_regclass('public.ppbv_records') is null then
    raise notice 'Tabelle public.ppbv_records fehlt — bitte zuerst 20260723_ppbv_records.sql ausfuehren. Diese Migration hat nichts geaendert.';
    return;
  end if;

  alter table public.ppbv_records
    add column if not exists source text not null default 'manuell';

  alter table public.ppbv_records
    add column if not exists generated_by_user_id uuid;

  comment on column public.ppbv_records.source is
    'Wie der Nachweis entstanden ist: automatisch (taeglicher Cron, Vormonat) | manuell (Leitung hat nachgeholt) | korrektur (bestehender Beleg bewusst ersetzt).';

  comment on column public.ppbv_records.generated_by_user_id is
    'Ausloesender Mensch als uuid (auth.users.id). NULL beim automatischen Lauf. Bewusst keine Klarnamen in dieser Tabelle.';
end $$;

notify pgrst, 'reload schema';
