-- Add station columns to user_profiles.
-- These were referenced in code but never added via migration (only as TODO comments in
-- assign-station/route.ts). Without them every invite/redeem upsert fails silently
-- and newly registered users end up with no user_profiles row → 403 on all leitung APIs.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS station text DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS station_secondary text DEFAULT '';
