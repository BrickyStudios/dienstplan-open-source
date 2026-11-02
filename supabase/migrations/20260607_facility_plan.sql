-- Praxis-Tarif: Tarif-/Produkttyp pro Einrichtung.
-- 'station'  = bisheriges Modell (Krankenhaus/Heim, PPBV, pro Station abgerechnet) — DEFAULT, damit Bestandskunden unverändert bleiben.
-- 'praxis'   = Arztpraxis (MFA, kein PPBV, eine Einheit, pro Mitarbeiter abgerechnet).
alter table public.facility_settings
  add column if not exists plan text not null default 'station';

-- Check separat (idempotent), damit ein erneutes Ausführen nicht an einem bestehenden Constraint scheitert.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'facility_settings_plan_check'
  ) then
    alter table public.facility_settings
      add constraint facility_settings_plan_check check (plan in ('station', 'praxis'));
  end if;
end $$;
