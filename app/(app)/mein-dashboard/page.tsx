import { cookies } from "next/headers";
import { createClient, getServerUser } from "@/lib/supabase/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { adminAccessFacility } from "@/lib/access-facility";
import MitarbeiterDashboard from "@/components/MitarbeiterDashboard";
import { berlinTodayISO, zeitumstellungMinuten } from "@/lib/date";
import { meldungenErlaubt } from "@/lib/meldungen-erlaubt";
import { meineSchichten, monatsRahmen, zuordnungenFuer } from "@/lib/meine-schichten";
const SHIFT_DEFAULT_HOURS: Record<string, number> = { frueh: 8, spaet: 8, nacht: 10 };
export default async function MeinDashboardPage() {
    const user = await getServerUser();
    const supabase = await createClient();
    const cookieStore = await cookies();
    const accessFacility = await adminAccessFacility(user, cookieStore.get("nurvo_access_facility")?.value);
    const demoStaffId = cookieStore.get("nurvo_demo_staff_id")?.value;
    const demoStaffName = cookieStore.get("nurvo_demo_staff_name")?.value;
    let facility = "";
    let userName = "";
    let userRole = "mitarbeiter";
    if (user) {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("facility, full_name, role")
            .eq("id", user.id)
            .maybeSingle();
        facility = accessFacility || (profile?.facility ?? "");
        userName = profile?.full_name ?? "";
        userRole = profile?.role ?? "mitarbeiter";
    }
    const canUseDemoOverride = userRole === "leitung" || userRole === "demo" || !!accessFacility;
    const isDemoStaff = canUseDemoOverride && !!(demoStaffId && demoStaffName);
    if (isDemoStaff)
        userName = demoStaffName!;
    const targetStaffId = isDemoStaff ? demoStaffId! : (user?.id ?? "");
    const db: any = process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAdminClient()
        : supabase;
    let totalDays = 30;
    let bonus = 0;
    let usedDays = 0;
    let pendingRequests = 0;
    if (targetStaffId) {
        const prof = await db
            .from("user_profiles")
            .select("vacation_days, vacation_bonus_days")
            .eq("id", targetStaffId)
            .maybeSingle();
        const p = prof.data as {
            vacation_days?: number | null;
            vacation_bonus_days?: number | null;
        } | null;
        if (!prof.error && p) {
            const base = Number.isFinite(Number(p.vacation_days)) ? Number(p.vacation_days) : 30;
            bonus = Number.isFinite(Number(p.vacation_bonus_days)) ? Number(p.vacation_bonus_days) : 0;
            totalDays = base + bonus;
        }
        const { data: reqs } = await db
            .from("vacation_requests")
            .select("days, status")
            .eq("staff_id", targetStaffId);
        for (const r of (reqs ?? []) as {
            days: number;
            status: string;
        }[]) {
            if (r.status === "approved")
                usedDays += Number(r.days) || 0;
            else if (r.status === "pending")
                pendingRequests += 1;
        }
    }
    const remainingDays = totalDays - usedDays;
    const todayStr = berlinTodayISO();
    const { von: from, bis: to, monatIndex } = monatsRahmen(todayStr);
    const demoEmails = [process.env.DEMO_LEITUNG_EMAIL, process.env.DEMO_MITARBEITER_EMAIL].filter(Boolean);
    const isDemoEmailAccount = !!user?.email && demoEmails.includes(user.email);
    let isStationLeader = false;
    if (!isDemoEmailAccount && !canUseDemoOverride && user && facility) {
        try {
            const leaderRes = await db
                .from("station_leaders")
                .select("id")
                .eq("facility_name", facility)
                .eq("user_id", user.id)
                .limit(1);
            if (!leaderRes.error && leaderRes.data?.length > 0)
                isStationLeader = true;
        }
        catch { }
    }
    const showAusfallButton = canUseDemoOverride || isDemoEmailAccount || isStationLeader;
    let shiftsThisMonth = 0;
    let totalHours = 0;
    let nextShift: {
        date: string;
        station: string;
        shift_type: string;
    } | null = null;
    if (facility && user) {
        const shiftQ = db
            .from("shifts")
            .select("id, station, date, shift_type, start_time, end_time")
            .eq("facility_name", facility)
            .gte("date", from)
            .lte("date", to)
            .order("date")
            .order("start_time");
        const shiftsRes = await shiftQ;
        const shifts = (shiftsRes.data ?? []) as {
            id: string;
            station: string;
            date: string;
            shift_type: string;
            start_time: string | null;
            end_time: string | null;
        }[];
        const assignments = await zuordnungenFuer(db, facility, shifts.map(s => s.id));
        const myShifts = meineSchichten(shifts, assignments, userName, targetStaffId);
        shiftsThisMonth = myShifts.length;
        totalHours = myShifts.reduce((sum, s) => {
            if (s.start_time && s.end_time) {
                const [sh, sm] = s.start_time.split(":").map(Number);
                const [eh, em] = s.end_time.split(":").map(Number);
                return sum + Math.round(((((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440) + zeitumstellungMinuten(s.date, s.start_time, s.end_time)) / 60 * 10) / 10;
            }
            return sum + (SHIFT_DEFAULT_HOURS[s.shift_type] ?? 8);
        }, 0);
        const upcoming = myShifts.filter(s => s.date >= todayStr);
        if (upcoming.length > 0) {
            const n = upcoming[0];
            nextShift = { date: n.date, station: n.station, shift_type: n.shift_type };
        }
    }
    const erlaubt = facility ? await meldungenErlaubt(facility) : { krank: true, verspaetung: true };
    return (<MitarbeiterDashboard userName={userName} totalDays={totalDays} bonus={bonus} usedDays={usedDays} remainingDays={remainingDays} pendingRequests={pendingRequests} shiftsThisMonth={shiftsThisMonth} totalHours={Math.round(totalHours)} nextShift={nextShift} currentMonth={monatIndex} showAusfallButton={showAusfallButton} heute={todayStr} krankErlaubt={erlaubt.krank} verspaetungErlaubt={erlaubt.verspaetung}/>);
}
