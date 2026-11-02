-- ============================================================================
-- Personalakte, Ausbau (07.10.2026)
--
-- Anlass: Eine Prüfung der Website durch ChatGPT vermisste an der Personalakte
-- Arbeitszeugnisse, Ein- und Austrittsunterlagen und eine vollständige
-- Personalhistorie. Die ersten beiden gingen bisher nur über „Sonstiges", die
-- Historie gab es nicht: Das Protokoll hält fest, WER WANN WELCHES Feld geändert
-- hat, aber bewusst ohne Inhalt — es soll keine zweite Kopie der Akte sein.
--
-- 1. Drei neue Eintragsarten: 'zeugnis', 'eintritt', 'austritt'.
-- 2. personalakte_verlauf — jede tatsächliche Änderung eines Aktenfeldes mit
--    altem und neuem Wert. Steuer-ID und SV-Nummer stehen darin so verschlüsselt
--    wie in der Akte selbst (Spalte `verschluesselt`), nie im Klartext.
--
-- Der Verlauf ist Teil der Akte und für die Person genauso einsehbar wie der
-- Rest (§ 83 BetrVG, Art. 15 DSGVO). Gelöscht wird er mit der Akte.
--
-- Ohne diese Datei: Die drei neuen Arten werden beim Speichern abgelehnt
-- (Prüfregel der Spalte `art`), und der Reiter „Verlauf" bleibt leer. Alles
-- andere läuft weiter.
--
-- Idempotent.
-- ============================================================================

alter table personalakte_eintraege drop constraint if exists personalakte_eintraege_art_check;
alter table personalakte_eintraege add constraint personalakte_eintraege_art_check check (art in (
  'vertrag', 'vertragsaenderung', 'eintritt', 'gespraech', 'abmahnung',
  'fortbildung', 'bescheinigung', 'zeugnis', 'austritt', 'sonstiges'));

create table if not exists personalakte_verlauf (
  id              uuid primary key default gen_random_uuid(),
  facility_name   text not null,
  staff_id        uuid not null,
  feld            text not null,
  alt             text,
  neu             text,
  verschluesselt  boolean not null default false,
  wer             text not null,
  am              timestamptz not null default now()
);

create index if not exists personalakte_verlauf_person
  on personalakte_verlauf(facility_name, staff_id, am desc);

alter table personalakte_verlauf enable row level security;
revoke all on personalakte_verlauf from anon, authenticated;

notify pgrst, 'reload schema';

-- Kontrolle: 0 Zeilen = alles da.
select 'TABELLE FEHLT: personalakte_verlauf' as befund
where to_regclass('public.personalakte_verlauf') is null
union all
select 'RLS AUS: personalakte_verlauf'
from pg_class where relname = 'personalakte_verlauf' and not relrowsecurity
union all
select 'ART zeugnis FEHLT'
where not exists (
  select 1 from pg_constraint
  where conname = 'personalakte_eintraege_art_check'
    and pg_get_constraintdef(oid) like '%zeugnis%');
