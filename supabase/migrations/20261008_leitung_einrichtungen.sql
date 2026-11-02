-- Mehrere Einrichtungen je Leitung (08.10.2026)
--
-- Bisher hing jedes Leitungskonto an GENAU einer Einrichtung: user_profiles.facility.
-- Wer zwei Praxen führt, brauchte zwei Konten. Diese Tabelle hält fest, welche
-- Einrichtungen ein Konto leiten darf. user_profiles.facility bleibt die AKTIVE
-- Einrichtung — rund hundert Stellen lesen sie, und keine davon muss sich ändern.
-- Der Wechsel (lib/einrichtungen.ts) prüft die Mitgliedschaft hier und schreibt dann
-- user_profiles.facility um.
--
-- onboarding_completed_at steht je Einrichtung hier, weil user_profiles nur eine
-- Spalte dafür hat: Ohne die Kopie würde ein Wechsel zurück in eine eingerichtete
-- Einrichtung den Einrichtungs-Assistenten auslösen — und der räumt Stationen und
-- Vorlagen der Einrichtung ab, bevor er neu anlegt.
--
-- Nur der Server (service_role) liest und schreibt. RLS an, keine Policy: Wer sich
-- selbst eine Zeile einträgt, hätte Zugriff auf eine fremde Einrichtung.

create table if not exists public.leitung_einrichtungen (
  user_id uuid not null references auth.users(id) on delete cascade,
  facility_name text not null check (length(trim(facility_name)) > 0),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, facility_name)
);

alter table public.leitung_einrichtungen enable row level security;

-- Bestand: jede Leitung leitet die Einrichtung, an der sie heute hängt.
insert into public.leitung_einrichtungen (user_id, facility_name, onboarding_completed_at)
select id, facility, onboarding_completed_at
from public.user_profiles
where role = 'leitung' and coalesce(trim(facility), '') <> ''
on conflict (user_id, facility_name) do nothing;

-- Prüfung: 0 Zeilen = jede Leitung mit Einrichtung hat ihre Mitgliedschaft.
select p.id, p.facility
from public.user_profiles p
left join public.leitung_einrichtungen l on l.user_id = p.id and l.facility_name = p.facility
where p.role = 'leitung' and coalesce(trim(p.facility), '') <> '' and l.user_id is null;
