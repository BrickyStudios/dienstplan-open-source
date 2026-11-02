import { cookies } from "next/headers";
import { createClient, getServerUser } from "@/lib/supabase/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { adminAccessFacility } from "@/lib/access-facility";
import MeinPlanContent from "@/components/MeinPlanContent";
import { berlinTodayISO, berlinMonatsBereich, zeitumstellungMinuten } from "@/lib/date";
import { istMeine, zuordnungenFuer } from "@/lib/meine-schichten";
type Shift = {
    id: string;
    station: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    planned_staff: number;
    notes: string;
};
type TimeEntry = {
    id: string;
    check_in: string;
    check_out: string | null;
    duration_minutes: number | null;
};
type Assignment = {
    shift_id: string;
    staff_name: string;
    staff_id: string | null;
};
type OnCall = {
    on_call_date: string;
    staff_name: string;
    user_id: string | null;
    shift_type: string | null;
};
const SHIFT_DEFAULT_HOURS: Record<string, number> = { frueh: 8, spaet: 8, nacht: 10 };
function calcHours(date: string, start: string | null, end: string | null, type: string): number {
    if (start && end) {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const diff = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440 + zeitumstellungMinuten(date, start, end);
        return Math.round((diff / 60) * 10) / 10;
    }
    return SHIFT_DEFAULT_HOURS[type] ?? 8;
}
function monatsVersatz(monat: string | undefined, heute: string): number | null {
    if (!monat || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monat))
        return null;
    const v = (Number(monat.slice(0, 4)) - Number(heute.slice(0, 4))) * 12 + Number(monat.slice(5, 7)) - Number(heute.slice(5, 7));
    return Math.abs(v) <= 12 ? v : null;
}
export default async function MeinPlanPage({ searchParams }: {
    searchParams: Promise<{
        monat?: string;
    }>;
}) {
    const gewaehlt = monatsVersatz((await searchParams)?.monat, berlinTodayISO());
    const user = await getServerUser();
    const supabase = await createClient();
    const cookieStore = await cookies();
    const accessFacility = await adminAccessFacility(user, cookieStore.get("nurvo_access_facility")?.value);
    const demoStaffId = cookieStore.get("nurvo_demo_staff_id")?.value;
    const demoStaffNameCookie = cookieStore.get("nurvo_demo_staff_name")?.value;
    let facility = "";
    let userStation = "";
    let userName = "";
    let userRole = "mitarbeiter";
    if (user) {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("facility, station, full_name, role")
            .eq("id", user.id)
            .maybeSingle();
        facility = accessFacility || (profile?.facility ?? "");
        userStation = accessFacility ? "" : (profile?.station ?? "");
        userName = profile?.full_name ?? "";
        userRole = profile?.role ?? "mitarbeiter";
    }
    const canUseDemoOverride = userRole === "leitung" || userRole === "demo" || !!accessFacility;
    const isDemoStaff = canUseDemoOverride && !!(demoStaffId && demoStaffNameCookie);
    if (isDemoStaff) {
        userName = demoStaffNameCookie!;
    }
    let shifts: Shift[] = [];
    let timeEntries: TimeEntry[] = [];
    let assignments: Assignment[] = [];
    let onCall: OnCall[] = [];
    let canExportStation = false;
    let swapMode: "manual" | "automatic" | "leitung_only" = "manual";
    let versatz = gewaehlt ?? 0;
    if (facility && user) {
        const db: any = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient()
            : supabase;
        const effectiveId = isDemoStaff ? demoStaffId : user.id;
        if (gewaehlt === null) {
            const heute = berlinTodayISO();
            const naechster = berlinMonatsBereich(new Date(), 1);
            const { data: kommende } = await db.from("shifts").select("id, date")
                .eq("facility_name", facility).gte("date", heute).lte("date", naechster.to);
            const kommendeIds = ((kommende ?? []) as {
                id: string;
                date: string;
            }[]);
            const meine = (await zuordnungenFuer<Assignment>(db, facility, kommendeIds.map(k => k.id)))
                .filter(a => istMeine(a, effectiveId, userName))
                .map(a => kommendeIds.find(k => k.id === a.shift_id)?.date ?? "")
                .filter(Boolean);
            if (meine.length && !meine.some(d => d <= berlinMonatsBereich().to))
                versatz = 1;
        }
        const { from, to } = berlinMonatsBereich(new Date(), versatz);
        const q = db
            .from("shifts")
            .select("id, station, date, shift_type, start_time, end_time, planned_staff, notes")
            .eq("facility_name", facility)
            .gte("date", from)
            .lte("date", to)
            .order("date")
            .order("start_time");
        const [shiftsRes, entriesRes, leadersRes, onCallRes, swapSettingsRes] = await Promise.all([
            q,
            db.from("time_entries")
                .select("id, check_in, check_out, duration_minutes")
                .eq("user_id", user.id)
                .gte("check_in", `${from}T00:00:00`)
                .lte("check_in", `${to}T23:59:59`)
                .order("check_in"),
            db.from("station_leaders")
                .select("user_id, staff_name")
                .eq("facility_name", facility)
                .then((r: unknown) => r),
            db.from("on_call_entries")
                .select("on_call_date, staff_name, user_id, shift_type")
                .eq("facility_name", facility)
                .gte("on_call_date", from)
                .lte("on_call_date", to)
                .then((r: unknown) => r),
            db.from("facility_settings")
                .select("shift_swap_mode")
                .eq("facility_name", facility)
                .maybeSingle()
                .then((r: unknown) => r, () => ({ data: null })),
        ]);
        shifts = shiftsRes.data ?? [];
        timeEntries = entriesRes.data ?? [];
        assignments = await zuordnungenFuer<Assignment>(db, facility, shifts.map(s => s.id));
        onCall = ((onCallRes as {
            data?: OnCall[];
        })?.data ?? []) as OnCall[];
        const swapModeRaw = (swapSettingsRes as {
            data?: {
                shift_swap_mode?: string;
            } | null;
        })?.data?.shift_swap_mode;
        if (swapModeRaw === "automatic" || swapModeRaw === "leitung_only")
            swapMode = swapModeRaw;
        const leaders = (leadersRes as {
            data?: {
                user_id: string | null;
                staff_name: string | null;
            }[];
        })?.data ?? [];
        canExportStation =
            !!accessFacility ||
                leaders.some(l => l.user_id === user.id || (!!userName && l.staff_name === userName));
    }
    const today = berlinTodayISO();
    const effectiveStaffId = isDemoStaff ? demoStaffId : user?.id;
    const myShiftIds = new Set(assignments
        .filter(a => istMeine(a, effectiveStaffId, userName))
        .map(a => a.shift_id));
    const myShifts = shifts.filter(s => myShiftIds.has(s.id));
    const springerByDate: Record<string, string | null> = {};
    for (const e of onCall) {
        const mine = istMeine({ staff_id: e.user_id, staff_name: e.staff_name }, effectiveStaffId, userName);
        if (!mine)
            continue;
        if (!(e.on_call_date in springerByDate) || e.shift_type === "nacht") {
            springerByDate[e.on_call_date] = e.shift_type ?? null;
        }
    }
    const nightShifts = myShifts.filter(s => s.shift_type === "nacht").length;
    const totalHours = myShifts.reduce((sum, s) => sum + calcHours(s.date, s.start_time, s.end_time, s.shift_type), 0);
    const byDate = myShifts.reduce<Record<string, Shift[]>>((acc, s) => {
        (acc[s.date] ??= []).push(s);
        return acc;
    }, {});
    const staffStation = isDemoStaff
        ? (myShifts[0]?.station ?? null)
        : (userStation || myShifts[0]?.station || null);
    const stationShifts = staffStation ? shifts.filter(s => s.station === staffStation) : shifts;
    const assignmentsByShift = assignments.reduce<Record<string, string[]>>((acc, a) => {
        (acc[a.shift_id] ??= []).push(a.staff_name);
        return acc;
    }, {});
    const stationByDate = stationShifts.reduce<Record<string, Shift[]>>((acc, s) => {
        (acc[s.date] ??= []).push(s);
        return acc;
    }, {});
    const entriesByDate = timeEntries.reduce<Record<string, TimeEntry[]>>((acc, e) => {
        const date = e.check_in.slice(0, 10);
        (acc[date] ??= []).push(e);
        return acc;
    }, {});
    return (<MeinPlanContent shifts={myShifts} allStationShifts={stationShifts} today={today} totalHours={totalHours} nightShifts={nightShifts} byDate={byDate} stationByDate={stationByDate} assignmentsByShift={assignmentsByShift} entriesByDate={entriesByDate} springerByDate={springerByDate} userName={userName} canExportStation={canExportStation} swapMode={swapMode} monat={berlinMonatsBereich(new Date(), versatz).from.slice(0, 7)} monatVersatz={versatz}/>);
}
