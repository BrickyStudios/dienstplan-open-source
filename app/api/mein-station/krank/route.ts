import { NextRequest, NextResponse, after } from "next/server";
import { resolveStationStaff, leaderStations, stationAdmin } from "@/lib/mein-station-auth";
import { maybeAutoRequestExternal } from "@/lib/external-agencies";
import { notifyLeitungOfSickReport, notifyLeitungSickLogged } from "@/lib/sick-report-notify";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function POST(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const stationName = typeof body.station_name === "string" ? body.station_name.trim() : "";
    const sickDate = body.sick_date;
    if (!stationName || !sickDate)
        return NextResponse.json({ error: "station_name + sick_date erforderlich" }, { status: 400 });
    const leaders = await leaderStations(ctx);
    if (!leaders.includes(stationName)) {
        return NextResponse.json({ error: "Keine Leitung dieser Station" }, { status: 403 });
    }
    const db = stationAdmin();
    let q = db.from("user_profiles")
        .select("id, full_name, station, station_secondary")
        .eq("facility", ctx.facility).eq("role", "mitarbeiter");
    if (body.sick_user_id)
        q = q.eq("id", body.sick_user_id);
    else if (typeof body.sick_staff_name === "string" && body.sick_staff_name.trim())
        q = q.eq("full_name", body.sick_staff_name.trim());
    else
        return NextResponse.json({ error: "Mitarbeiter erforderlich" }, { status: 400 });
    const { data: target } = await q.limit(1).maybeSingle();
    if (!target)
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    if (target.station !== stationName && target.station_secondary !== stationName) {
        return NextResponse.json({ error: "Mitarbeiter gehört nicht zu dieser Station" }, { status: 403 });
    }
    const replacement = typeof body.request_replacement === "boolean" ? body.request_replacement : null;
    const payload: Record<string, unknown> = {
        reporter_user_id: ctx.userId,
        sick_user_id: target.id,
        sick_staff_name: target.full_name,
        facility_name: ctx.facility,
        station: stationName,
        sick_date: sickDate,
        shift_type: body.shift_type ?? null,
        note: body.note ?? null,
        reported_by_leitung: false,
        request_replacement: replacement,
    };
    let { data, error } = await db.from("sick_reports").insert(payload).select().single();
    if (error && spalteFehlt(error)) {
        delete payload.request_replacement;
        ({ data, error } = await db.from("sick_reports").insert(payload).select().single());
    }
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.id)
        after(() => maybeAutoRequestExternal(db, ctx.facility, data.id as string, replacement));
    if (data?.id)
        after(() => notifyLeitungOfSickReport(db, ctx.facility, data));
    if (data)
        after(() => notifyLeitungSickLogged(db, ctx.facility, data, { excludeUserId: ctx.userId }));
    return NextResponse.json({ report: data });
}
