-- Globaler Plattform-Schalter: Web-App (Vercel) an/aus.
-- Betrifft NUR das gehostete Web-Deployment (process.env.VERCEL gesetzt).
-- Die Desktop-App läuft auf ihrem eigenen lokalen Server (127.0.0.1) OHNE VERCEL-Env
-- und ist davon NIE betroffen. Marketing-/Public-Seiten bleiben ebenfalls online.
-- 20260608
--
-- WICHTIG: nicht automatisch eingespielt. Einmal im Supabase SQL-Editor ausführen.
-- Ohne diese Tabelle liest der Proxy defensiv (fail-open) → Web-App bleibt erreichbar.

create table if not exists platform_settings (
  id boolean primary key default true,
  web_app_enabled boolean not null default true,
  updated_at timestamptz default now(),
  updated_by text,
  constraint platform_settings_singleton check (id)
);

insert into platform_settings (id, web_app_enabled)
values (true, true)
on conflict (id) do nothing;

alter table platform_settings enable row level security;

-- Der Proxy/Middleware liest mit dem anon-Key → public read erlaubt.
drop policy if exists "platform_settings read" on platform_settings;
create policy "platform_settings read" on platform_settings for select using (true);

-- Schreiben ausschließlich über service_role (Admin-API umgeht RLS) — keine write-Policy nötig.

notify pgrst, 'reload schema';
