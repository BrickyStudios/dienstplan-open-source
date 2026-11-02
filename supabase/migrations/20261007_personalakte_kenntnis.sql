-- ============================================================================
-- Personalakte: Kenntnisnahme durch die Person (07.10.2026)
--
-- Anlass: Ein Interessent fragte nach „digitalen Unterschriften" in der Akte.
-- Eine qualifizierte elektronische Signatur (QES) bietet Nurvo nicht — und sie
-- ersetzt sie auch nicht, wo das Gesetz Schriftform verlangt (Kündigung, § 623
-- BGB). Was Nurvo bietet, ist der Alltagsfall: Die Leitung fordert bei einem
-- Eintrag (Abmahnung, Vertragsänderung, Gesprächsnotiz) eine Bestätigung an, und
-- die Person bestätigt in „Meine Personalakte", dass sie ihn gelesen hat — mit
-- Zeitpunkt und Namen, im Zugriffsprotokoll vermerkt.
--
-- Ohne diese Datei: Der Haken „Kenntnisnahme anfordern" wird ignoriert, alles
-- andere läuft weiter.
--
-- Idempotent.
-- ============================================================================

alter table personalakte_eintraege add column if not exists kenntnis_angefordert boolean not null default false;
alter table personalakte_eintraege add column if not exists kenntnis_am timestamptz;
alter table personalakte_eintraege add column if not exists kenntnis_von text;

notify pgrst, 'reload schema';

-- Kontrolle: 0 Zeilen = alles da.
select 'SPALTE FEHLT: ' || s as befund
from unnest(array['kenntnis_angefordert', 'kenntnis_am', 'kenntnis_von']) as s
where not exists (
  select 1 from information_schema.columns
  where table_name = 'personalakte_eintraege' and column_name = s);
