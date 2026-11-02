-- Add secondary station preset to invite codes
alter table invite_codes add column if not exists preset_station_secondary text;
