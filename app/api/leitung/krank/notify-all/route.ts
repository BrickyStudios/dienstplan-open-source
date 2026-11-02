import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { date, shiftType, station, reason } = body as {
        date?: string;
        shiftType?: string | null;
        station?: string | null;
        reason?: string | null;
    };
    if (!date)
        return NextResponse.json({ error: "date erforderlich" }, { status: 400 });
    const missingNames: string[] = Array.isArray(body.missingNames)
        ? body.missingNames
        : body.missingNames ? [body.missingNames] : [];
    const admin = createAdminClient();
    let shiftQuery = admin.from("shifts")
        .select("id")
        .eq("facility_name", ctx.facilityName)
        .eq("date", date);
    if (shiftType)
        shiftQuery = shiftQuery.eq("shift_type", shiftType);
    if (station)
        shiftQuery = shiftQuery.eq("station", station);
    const { data: shifts, error: shiftErr } = await shiftQuery;
    if (shiftErr)
        return NextResponse.json({ error: shiftErr.message }, { status: 500 });
    const shiftIds = (shifts ?? []).map(s => s.id as string);
    if (shiftIds.length === 0)
        return NextResponse.json({ notified: 0, reason: "no_shifts" });
    const { data: assignments } = await admin.from("shift_assignments")
        .select("staff_name, status")
        .eq("facility_name", ctx.facilityName)
        .in("shift_id", shiftIds);
    const missingSet = new Set(missingNames);
    const onDutyNames = [...new Set((assignments ?? [])
            .filter(a => a.status !== "cancelled" && a.status !== "sick")
            .map(a => a.staff_name as string)
            .filter(Boolean))]
        .filter(n => !missingSet.has(n));
    if (onDutyNames.length === 0)
        return NextResponse.json({ notified: 0, reason: "nobody_on_duty" });
    const { data: profiles } = await admin.from("user_profiles")
        .select("id, full_name")
        .eq("facility", ctx.facilityName)
        .in("full_name", onDutyNames);
    if (!profiles?.length)
        return NextResponse.json({ notified: 0, reason: "no_accounts" });
    const count = missingSet.size || Number(body.missingCount) || 1;
    const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
    const shiftLabel = shiftType ? ` (${shiftType})` : "";
    const title = "Personal fehlt — Unterstützung gesucht";
    const missingPart = count === 1 ? "fehlt 1 Person" : `fehlen ${count} Personen`;
    const message = `Für ${dateLabel}${shiftLabel} ${missingPart} und es konnte keine Vertretung gefunden werden.` +
        (reason ? ` ${reason}` : "") +
        ` Falls du kurzfristig einspringen kannst, melde dich bitte bei der Leitung.`;
    const rows = profiles.map(p => ({
        user_id: p.id, facility_name: ctx.facilityName, title, message, read: false,
    }));
    const { error: insErr } = await admin.from("notifications").insert(rows);
    if (insErr)
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ notified: rows.length });
}
