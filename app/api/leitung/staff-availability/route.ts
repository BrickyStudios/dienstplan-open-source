import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const staffId = new URL(req.url).searchParams.get("staff_id");
    if (!staffId)
        return NextResponse.json({ error: "staff_id erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staff_availability")
        .select("day_of_week, available, from_time, to_time")
        .eq("staff_id", staffId)
        .eq("facility_name", ctx.facilityName)
        .order("day_of_week");
    if (tabelleFehlt(error))
        return NextResponse.json({ availability: [] });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ availability: data ?? [] });
}
export async function PUT(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { staff_id, rows } = await req.json();
    if (!staff_id || !Array.isArray(rows))
        return NextResponse.json({ error: "staff_id und rows erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    await admin.from("staff_availability").delete().eq("staff_id", staff_id).eq("facility_name", ctx.facilityName);
    if (rows.length > 0) {
        const inserts = rows.map((r: {
            day_of_week: number;
            available: boolean;
            from_time?: string;
            to_time?: string;
        }) => ({
            staff_id,
            facility_name: ctx.facilityName,
            day_of_week: r.day_of_week,
            available: r.available,
            from_time: r.from_time || null,
            to_time: r.to_time || null,
        }));
        const { error } = await admin.from("staff_availability").insert(inserts);
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "DB-Migration erforderlich: staff_availability Tabelle fehlt" }, { status: 500 });
        if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
