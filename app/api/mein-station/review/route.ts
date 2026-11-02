import { NextRequest, NextResponse } from "next/server";
import { resolveStationStaff, leaderStations, stationAdmin } from "@/lib/mein-station-auth";
import { getLeaderPermissions, VACATION_DECISIONS, WISH_DECISIONS } from "@/lib/leader-permissions";
export async function PATCH(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const kind = body.kind === "wish" ? "wish" : body.kind === "vacation" ? "vacation" : null;
    const id = typeof body.id === "string" ? body.id : null;
    const status = typeof body.status === "string" ? body.status : null;
    if (!kind || !id || !status)
        return NextResponse.json({ error: "kind, id, status erforderlich" }, { status: 400 });
    const perms = await getLeaderPermissions(ctx.facility);
    if (kind === "vacation" && !perms.vacation)
        return NextResponse.json({ error: "Kein Recht, Urlaubsanträge zu bearbeiten" }, { status: 403 });
    if (kind === "wish" && !perms.wishes)
        return NextResponse.json({ error: "Kein Recht, Dienstwünsche zu bearbeiten" }, { status: 403 });
    if (kind === "vacation" && !(VACATION_DECISIONS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    if (kind === "wish" && !(WISH_DECISIONS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }
    const db = stationAdmin();
    let ledStations: string[];
    if (ctx.isDemo) {
        const { data } = await db.from("stations").select("name").eq("facility_name", ctx.facility);
        ledStations = (data ?? []).map((s: {
            name: string;
        }) => s.name);
    }
    else {
        ledStations = await leaderStations(ctx);
    }
    if (ledStations.length === 0)
        return NextResponse.json({ error: "Keine Stationsleitung" }, { status: 403 });
    const table = kind === "vacation" ? "vacation_requests" : "staff_wishes";
    const ownerCol = kind === "vacation" ? "staff_id" : "user_id";
    const { data: row } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (!row)
        return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
    const ownerId = (row as Record<string, unknown>)[ownerCol] as string;
    const { data: owner } = await db
        .from("user_profiles")
        .select("facility, station, station_secondary")
        .eq("id", ownerId)
        .maybeSingle();
    if (!owner || owner.facility !== ctx.facility) {
        return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });
    }
    const ownerStations = [owner.station, owner.station_secondary].filter(Boolean) as string[];
    if (!ownerStations.some(s => ledStations.includes(s))) {
        return NextResponse.json({ error: "Mitarbeiter gehört nicht zu deiner Station" }, { status: 403 });
    }
    const { error } = await db.from(table).update({ status }).eq("id", id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
