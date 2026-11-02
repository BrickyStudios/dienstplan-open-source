-- Feedback-/Abschluss-Umfrage.
-- Zwei getrennte Tabellen, um die Datenschutz-Zusage einzuhalten:
--   feedback_answers   = ANONYME Klick-/Freitext-Antworten (keine E-Mail, kein User) → nur aggregiert ausgewertet.
--   feedback_interests = nicht-anonym: Schlussfrage „Was würde Sie interessieren?" + E-Mail, damit wir antworten können.

create table if not exists feedback_answers (
  id uuid primary key default gen_random_uuid(),
  context text not null default 'app',     -- 'demo' | 'app'
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists feedback_answers_created on feedback_answers(created_at desc);

create table if not exists feedback_interests (
  id uuid primary key default gen_random_uuid(),
  context text not null default 'app',     -- 'demo' | 'app'
  email text not null default '',
  message text not null default '',
  facility text default '',
  handled boolean not null default false,  -- Admin „erledigt/skip"
  created_at timestamptz default now()
);
create index if not exists feedback_interests_created on feedback_interests(created_at desc);

-- RLS an, ohne Client-Policy: Zugriff ausschließlich über den service_role-Key
-- (Insert via /api/feedback, Auswertung via /api/admin/feedback). Normale Clients
-- können weder lesen noch schreiben → Anonymität & Schutz gewahrt.
alter table feedback_answers   enable row level security;
alter table feedback_interests enable row level security;
