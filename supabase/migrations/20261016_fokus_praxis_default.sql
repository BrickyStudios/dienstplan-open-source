-- Fokus Praxis (Gründerbeschluss 15.10.2026): Eine neue Einrichtung entsteht als Praxis.
--
-- Warum: Der Spalten-Default von facility_settings.plan war 'station', und lib/plan.ts
-- liest 'station' als 'klinik'. Zwei Stellen legen eine Zeile ohne Typ an (Meldungen-
-- Route und der letzte Notnagel im Onboarding, der optionale Spalten weglässt) — sie
-- bekamen damit still das Klinik-Verhalten. Der Code schreibt seit diesem Commit den
-- aktiven Typ ausdrücklich (lib/plan.ts AKTIVE_PLAENE); der Default ist das Netz darunter.
--
-- Klinik und Pflege ruhen, sie werden nicht gelöscht (docs/strategie/FOKUS-PRAXIS.md):
--   • Der Check-Constraint bleibt — 'klinik', 'pflege', 'station' bleiben erlaubt.
--   • Bestehende Einrichtungen werden NICHT verändert und behalten ihren Typ.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.

-- ── 1) Neue Zeilen ohne Typ → Praxis ────────────────────────────────────────────
alter table public.facility_settings
  alter column plan set default 'praxis';

-- ── 2) Offene Demo-Codes ohne oder mit ruhendem Typ → Praxis ────────────────────
-- Nur unbenutzte Codes. Ein bereits eingelöster Code hat seine Einrichtung schon angelegt;
-- ihn zu ändern, änderte nichts an ihr und verfälschte nur die Historie.
update public.invite_codes
   set plan = 'praxis'
 where role = 'demo'
   and coalesce(used, false) = false
   and (plan is null or plan in ('klinik', 'station', 'pflege'));

-- ── Prüfabfrage: muss 'praxis' zeigen ───────────────────────────────────────────
select column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'facility_settings' and column_name = 'plan';
