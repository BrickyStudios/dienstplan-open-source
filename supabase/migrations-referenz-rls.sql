-- Supabase RLS policies for local Desktop App algorithm (v1.4.0)
-- Run once in Supabase Studio → SQL Editor
-- These allow the Electron desktop app to access data using the user's JWT
-- (no service role key needed — algorithm runs fully on the PC).

-- ── Security-definer helpers (bypass RLS on user_profiles subqueries) ─────────
CREATE OR REPLACE FUNCTION nurvo_my_facility()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT facility FROM user_profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION nurvo_is_leitung()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('leitung', 'demo')
  )
$$;

-- ── Enable RLS on required tables ─────────────────────────────────────────────
ALTER TABLE user_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_staff     ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_wishes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;

-- ── user_profiles ─────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "own_profile_read" ON user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "leitung_read_facility_profiles" ON user_profiles
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility = nurvo_my_facility());

-- ── shifts ────────────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_shifts" ON shifts
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── facility_staff ────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_facility_staff" ON facility_staff
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── staff_wishes ──────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_wishes" ON staff_wishes
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── time_entries ──────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_time_entries" ON time_entries
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility = nurvo_my_facility());

-- ── facility_settings ─────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_settings" ON facility_settings
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── staff_availability ────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_availability" ON staff_availability
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── shift_assignments ─────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_read_assignments" ON shift_assignments
  FOR SELECT TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

CREATE POLICY IF NOT EXISTS "leitung_delete_assignments" ON shift_assignments
  FOR DELETE TO authenticated
  USING (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

CREATE POLICY IF NOT EXISTS "leitung_insert_assignments" ON shift_assignments
  FOR INSERT TO authenticated
  WITH CHECK (nurvo_is_leitung() AND facility_name = nurvo_my_facility());

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE POLICY IF NOT EXISTS "leitung_insert_notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (nurvo_is_leitung() AND facility_name = nurvo_my_facility());
