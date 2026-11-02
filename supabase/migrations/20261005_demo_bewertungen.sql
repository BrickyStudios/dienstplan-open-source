-- Bewertungen aus der Demo (05.10.2026).
--
-- Wer die Demo beendet, landet seit diesem Tag auf /demo-bewertung statt in der
-- Abschluss-Umfrage. Am Ende steht eine Bewertung: Sterne, Überschrift, Text und — nur
-- wenn die Person es ausdrücklich wählt — Name, Funktion und Einrichtung.
--
-- Getrennt von feedback_answers, weil die Zusage dort „anonym" lautet. Eine Bewertung
-- ist das Gegenteil: Sie soll zuordenbar sein, damit sie veröffentlicht werden kann.
--
-- veroeffentlichung:
--   'nein'    — nur für uns, nie öffentlich
--   'anonym'  — öffentlich ohne Namen, nur mit Funktion und Einrichtungstyp
--   'name'    — öffentlich mit Name, Funktion und Einrichtung
-- status: 'neu' → 'freigegeben' | 'abgelehnt' (Admin-Bereich, Reiter Feedback).
-- Veröffentlicht wird nur, was die Person erlaubt UND ein Admin freigegeben hat.

create table if not exists demo_bewertungen (
  id                 uuid primary key default gen_random_uuid(),
  sterne             integer not null check (sterne between 1 and 5),
  titel              text not null default '',
  text               text not null default '',
  name               text not null default '',
  funktion           text not null default '',
  einrichtung        text not null default '',
  einrichtungstyp    text not null default '',      -- klinik | pflege | praxis | andere
  veroeffentlichung  text not null default 'nein' check (veroeffentlichung in ('nein', 'anonym', 'name')),
  email              text not null default '',
  -- Was angeklickt wurde, damit sich die Bewertung später gegen die Antworten lesen lässt.
  antworten          jsonb not null default '{}'::jsonb,
  status             text not null default 'neu' check (status in ('neu', 'freigegeben', 'abgelehnt')),
  user_id            uuid,
  created_at         timestamptz not null default now()
);

create index if not exists demo_bewertungen_created on demo_bewertungen(created_at desc);

alter table demo_bewertungen enable row level security;
revoke insert, update, delete, truncate on demo_bewertungen from anon, authenticated;

notify pgrst, 'reload schema';

select 'TABELLE FEHLT: demo_bewertungen' as befund
where to_regclass('public.demo_bewertungen') is null
union all
select 'RLS AUS: demo_bewertungen'
from pg_class
where relname = 'demo_bewertungen' and not relrowsecurity;
