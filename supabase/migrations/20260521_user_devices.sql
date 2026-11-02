create table if not exists user_devices (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  device_id    text        not null,
  device_name  text,
  first_seen   timestamptz default now(),
  last_seen    timestamptz default now(),
  unique(user_id, device_id)
);

create index if not exists user_devices_user_id on user_devices(user_id);

alter table user_devices enable row level security;
