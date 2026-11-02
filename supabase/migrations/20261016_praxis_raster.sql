-- Dienstplanraster der Praxis (16.10.2026): Wochentage und Mindestbesetzung.
--
-- Warum: Die Planung kannte keine Wochentage. Für jede Einheit entstand an JEDEM Tag jede
-- Schicht — auch samstags, sonntags und am Mittwochnachmittag, an dem die Praxis zu hat.
-- Und die Ausfall-Kaskade suchte bei jeder Lücke unter Soll Ersatz, auch wenn die Praxis
-- sagt: „Mit vier statt fünf läuft der Vormittag."
--
-- Beide Werte setzt das Onboarding (KI-Schritt „Ihre Praxis" oder von Hand im Schritt
-- „Schichtzeiten"). Logik: lib/scheduling/praxis-raster.ts.
--
--   closed_slots     {"0": ["frueh","spaet"], "3": ["spaet"]}   0 = Sonntag … 6 = Samstag:
--                    diese Schichtarten finden an diesem Wochentag NICHT statt.
--   replacement_min  {"<Einheit>": {"frueh": 4, "spaet": 3}}    erst UNTER diesem Wert sucht
--                    Nurvo bei Krankmeldung oder Schichtabgabe Ersatz. Fehlt er: der Soll.
--
-- Ohne diese Datei läuft alles wie bisher: Der Code liest die Spalten tolerant, das
-- Onboarding meldet sie als „nicht gespeichert", und es wird an jedem Tag geplant.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.

alter table public.facility_settings
  add column if not exists closed_slots jsonb;

alter table public.facility_settings
  add column if not exists replacement_min jsonb;

comment on column public.facility_settings.closed_slots is
  'Wochentag (0=So..6=Sa) -> Schichtarten, die an diesem Tag nicht stattfinden. lib/scheduling/praxis-raster.ts';
comment on column public.facility_settings.replacement_min is
  'Einheit -> Schichtart -> Mindestbesetzung; erst darunter wird Ersatz gesucht. lib/scheduling/praxis-raster.ts';

-- PostgREST kennt neue Spalten erst nach dem Neuladen des Schemas.
notify pgrst, 'reload schema';

-- ── Prüfabfrage: muss zwei Zeilen zeigen ────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'facility_settings'
   and column_name in ('closed_slots', 'replacement_min');
