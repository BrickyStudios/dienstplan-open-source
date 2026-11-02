-- Überstunden-Ausgleich: konkrete Vorschläge (Modus 'suggest') bzw. Protokoll
-- automatisch ausgeführter Ausgleiche (Modus 'auto'). Je Vorschlag wird EINE
-- künftige Schicht des überlasteten Mitarbeiters entweder frei (remove) oder
-- an eine unterausgelastete Ersatzperson übergeben (swap) — Besetzung fällt
-- dabei nie unter planned_staff (siehe lib/overtime-rebalance.ts).
create table if not exists overtime_rebalance_suggestions (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  staff_id uuid,
  staff_name text not null,
  shift_id uuid not null,
  shift_date date not null,
  action text not null check (action in ('remove', 'swap')),
  replacement_staff_id uuid,
  replacement_staff_name text,
  reason text,
  overtime_hours numeric,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'auto_applied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_overtime_rebalance_suggestions_facility_status
  on overtime_rebalance_suggestions(facility_name, status);

-- Verhindert doppelte offene Vorschläge für dieselbe (Mitarbeiter, Schicht)-Kombination
-- bei wiederholten Erkennungsläufen (Cron täglich + manuelles Neuladen).
create unique index if not exists idx_overtime_rebalance_suggestions_unique_pending
  on overtime_rebalance_suggestions(facility_name, staff_id, shift_id)
  where status = 'pending';

comment on table overtime_rebalance_suggestions is
  'Vorschläge/Protokoll des Überstunden-Ausgleichs (facility_settings.overtime_rebalance_mode = suggest|auto).';
