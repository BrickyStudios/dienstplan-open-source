-- Auto-Anfrage an externe Personaldienstleister (Springer-Failover)
-- 20260531
--
-- Ohne diese Spalte speichert der Toggle "Externe Dienste automatisch anfragen"
-- scheinbar, schreibt aber nichts -> das Feature feuert nie.
-- Code-Referenzen: app/(app)/(leitung)/springer/page.tsx,
-- app/api/external-agencies/request/route.ts, app/api/cron/auto-schedule/route.ts,
-- lib/external-agencies.ts

alter table facility_settings
  add column if not exists auto_request_external_agencies boolean not null default false;
