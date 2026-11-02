-- Add expires_at to invite_codes so new codes automatically expire after 7 days
alter table invite_codes add column if not exists expires_at timestamptz;
