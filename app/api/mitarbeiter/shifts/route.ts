import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
import { istMeine, zuordnungenFuer } from "@/lib/meine-schichten";
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles")
        .select("facility, full_name").eq("id", user.id).single();
    if (!profile?.facility)
        return NextResponse.json({ shifts: [], staffName: profile?.full_name ?? "" });
    const facility = profile.facility as string;
    const staffName = (profile.full_name ?? "") as string;
    const today = berlinTodayISO();
    const to = addDaysISO(today, 30);
    const shiftsRes = await admin.from("shifts")
        .select("id, station, date, shift_type, start_time, end_time, notes")
        .eq("facility_name", facility)
        .gte("date", today).lte("date", to)
        .order("date").order("start_time");
    const allShifts = shiftsRes.data ?? [];
    const assignments = await zuordnungenFuer(admin, facility, allShifts.map((s) => s.id));
    const mineIds = new Set(assignments.filter((a) => istMeine(a, user.id, staffName)).map((a) => a.shift_id));
    const shifts = allShifts.filter((s) => mineIds.has(s.id));
    return NextResponse.json({
        shifts,
        staffName,
        keineZuordnung: mineIds.size === 0,
    });
}
