-- Recovery-Phrase basierter Passwort-Reset (ersetzt E-Mail-Reset).
-- Defensiv (IF NOT EXISTS): bis zur Ausführung bleiben alle neuen Code-Pfade inert,
-- der Hash wird best-effort geschrieben (blockiert Registrierung nicht).
alter table public.user_profiles
  add column if not exists recovery_phrase_hash text,
  add column if not exists recovery_phrase_set_at timestamptz,
  add column if not exists recovery_phrase_updated_by text; -- 'self' | 'leitung:<name>'

comment on column public.user_profiles.recovery_phrase_hash is
  'scrypt$<saltHex>$<hashHex> der Recovery-Phrase. Nie im Klartext gespeichert.';
comment on column public.user_profiles.recovery_phrase_updated_by is
  'Wer die Phrase zuletzt gesetzt hat: "self" oder "leitung:<Name>".';
