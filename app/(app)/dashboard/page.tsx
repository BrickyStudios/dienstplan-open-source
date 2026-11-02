import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getServerUser } from "@/lib/supabase/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { adminAccessFacility } from "@/lib/access-facility";
import DashboardContent from "@/components/DashboardContent";
import { getPlanCapabilities, planAusZeile } from "@/lib/plan";
import { berlinTagISO, berlinTodayISO } from "@/lib/date";
export default async function DashboardPage() {
    const user = await getServerUser();
    const supabase = await createClient();
    const cookieStore = await cookies();
    const accessFacility = await adminAccessFacility(user, cookieStore.get("nurvo_access_facility")?.value);
    let facility: string;
    let db: any;
    let role = "leitung";
    if (accessFacility && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        db = createAdminClient();
        facility = accessFacility;
    }
    else {
        db = supabase;
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("facility, role")
            .eq("id", user?.id ?? "")
            .maybeSingle();
        facility = profile?.facility ?? "";
        role = profile?.role ?? user?.user_metadata?.role ?? "mitarbeiter";
        if (role === "mitarbeiter")
            redirect("/mein-dashboard");
    }
    const planDb = process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient()
        : db;
    const { data: planRow } = await planDb
        .from("facility_settings")
        .select("plan")
        .eq("facility_name", facility)
        .maybeSingle();
    const caps = getPlanCapabilities(planAusZeile(planRow));
    const { count: staffCount } = await db
        .from("user_profiles")
        .select("*", { count: "exact", head: true })
        .eq("facility", facility)
        .eq("role", "mitarbeiter");
    let pendingCount = 0;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const vacDb = createAdminClient();
        const { data: facilityStaff } = await vacDb
            .from("user_profiles")
            .select("id")
            .eq("facility", facility)
            .in("role", ["mitarbeiter", "demo"]);
        const facilityStaffIds = (facilityStaff ?? []).map((p: {
            id: string;
        }) => p.id);
        if (facilityStaffIds.length > 0) {
            const { data: pendingVacations } = await vacDb
                .from("vacation_requests")
                .select("id")
                .eq("status", "pending")
                .in("staff_id", facilityStaffIds);
            pendingCount = pendingVacations?.length ?? 0;
        }
    }
    const fromDate = berlinTagISO(-30);
    const toDate = berlinTodayISO();
    const { data: recentShifts } = await db
        .from("shifts")
        .select("planned_staff, actual_staff, date, station, shift_type")
        .eq("facility_name", facility)
        .gte("date", fromDate)
        .lte("date", toDate)
        .order("date", { ascending: false });
    const shifts = (recentShifts ?? []) as {
        planned_staff: number;
        actual_staff: number;
        date: string;
        station: string;
        shift_type: string;
    }[];
    const ppbvExemptStations = new Set<string>();
    const { data: exemptRows } = await db
        .from("stations")
        .select("name, ppbv_exempt")
        .eq("facility_name", facility);
    for (const r of (exemptRows ?? []) as {
        name: string;
        ppbv_exempt?: boolean;
    }[]) {
        if (r.ppbv_exempt)
            ppbvExemptStations.add(r.name);
    }
    let complianceRate = 0;
    let totalPlanned = 0;
    let totalActual = 0;
    let understaffedShifts = 0;
    const stationStats: Record<string, {
        planned: number;
        actual: number;
    }> = {};
    for (const s of shifts) {
        if (ppbvExemptStations.has(s.station))
            continue;
        if (s.planned_staff > 0) {
            totalPlanned += s.planned_staff;
            totalActual += s.actual_staff;
            if (s.actual_staff < s.planned_staff)
                understaffedShifts++;
            if (!stationStats[s.station])
                stationStats[s.station] = { planned: 0, actual: 0 };
            stationStats[s.station].planned += s.planned_staff;
            stationStats[s.station].actual += s.actual_staff;
        }
    }
    if (totalPlanned > 0) {
        complianceRate = Math.round((totalActual / totalPlanned) * 100);
    }
    const stationRanking = Object.entries(stationStats)
        .map(([name, s]) => ({ name, compliance: Math.round((s.actual / s.planned) * 100) }))
        .sort((a, b) => b.compliance - a.compliance)
        .slice(0, 3);
    return (<DashboardContent staffCount={staffCount ?? 0} pendingCount={pendingCount} complianceRate={complianceRate} totalShifts={shifts.length} understaffedShifts={understaffedShifts} stationRanking={stationRanking} hasShiftData={shifts.length > 0} showPpbv={caps.ppbv} complianceBasis={caps.compliance.legalBasis}/>);
}
