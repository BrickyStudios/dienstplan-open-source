-- RLS: Multi-tenant isolation for Nurvo
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/<projekt-ref>/sql
--
-- All production API routes use the service_role key (bypasses RLS).
-- These policies are defense-in-depth: they prevent cross-tenant leaks
-- if any future route accidentally uses the anon/user client.

-- ── Helper: get the authenticated user's facility ──────────────────────────
-- SECURITY DEFINER so it can read user_profiles without circular RLS.
CREATE OR REPLACE FUNCTION public.get_my_facility()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT facility FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ── facility_staff ─────────────────────────────────────────────────────────
ALTER TABLE public.facility_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.facility_staff;
CREATE POLICY "tenant_isolation"
  ON public.facility_staff
  USING (facility_name = public.get_my_facility());

-- ── shifts ─────────────────────────────────────────────────────────────────
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.shifts;
CREATE POLICY "tenant_isolation"
  ON public.shifts
  USING (facility_name = public.get_my_facility());

-- ── stations ───────────────────────────────────────────────────────────────
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.stations;
CREATE POLICY "tenant_isolation"
  ON public.stations
  USING (facility_name = public.get_my_facility());

-- ── staff_wishes ───────────────────────────────────────────────────────────
ALTER TABLE public.staff_wishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.staff_wishes;
CREATE POLICY "tenant_isolation"
  ON public.staff_wishes
  USING (facility_name = public.get_my_facility());

-- ── facility_settings ──────────────────────────────────────────────────────
ALTER TABLE public.facility_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.facility_settings;
CREATE POLICY "tenant_isolation"
  ON public.facility_settings
  USING (facility_name = public.get_my_facility());

-- ── user_profiles ──────────────────────────────────────────────────────────
-- Allow reading all profiles in own facility; always allow reading own row.
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_facility" ON public.user_profiles;
CREATE POLICY "read_own_facility"
  ON public.user_profiles FOR SELECT
  USING (facility = public.get_my_facility() OR id = auth.uid());

DROP POLICY IF EXISTS "write_own_row" ON public.user_profiles;
CREATE POLICY "write_own_row"
  ON public.user_profiles FOR ALL
  USING (id = auth.uid());

-- ── time_entries ───────────────────────────────────────────────────────────
-- Note: column is "facility" not "facility_name".
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.time_entries;
CREATE POLICY "tenant_isolation"
  ON public.time_entries
  USING (facility = public.get_my_facility());

-- ── vacation_requests ──────────────────────────────────────────────────────
-- No direct facility column; restrict to own requests. Leitung uses service_role.
ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_requests" ON public.vacation_requests;
CREATE POLICY "own_requests"
  ON public.vacation_requests
  USING (staff_id = auth.uid());

-- ── sick_reports ───────────────────────────────────────────────────────────
ALTER TABLE public.sick_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.sick_reports;
CREATE POLICY "tenant_isolation"
  ON public.sick_reports
  USING (facility_name = public.get_my_facility());

-- ── invite_codes ───────────────────────────────────────────────────────────
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.invite_codes;
CREATE POLICY "tenant_isolation"
  ON public.invite_codes
  USING (facility_name = public.get_my_facility());

-- ── support_messages ───────────────────────────────────────────────────────
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_messages" ON public.support_messages;
CREATE POLICY "own_messages"
  ON public.support_messages
  USING (user_id = auth.uid());

-- ── nurvo_admins ───────────────────────────────────────────────────────────
-- Admins table: readable only by the admin themselves (no cross-admin reads via anon).
ALTER TABLE public.nurvo_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_row" ON public.nurvo_admins;
CREATE POLICY "own_row"
  ON public.nurvo_admins
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
