import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { data, error } = await admin()
        .from("station_leaders")
        .select("id, station_name, user_id, staff_name")
        .eq("facility_name", ctx.facilityName);
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ leaders: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ leaders: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { station_name, user_id } = await req.json();
    if (!station_name || !user_id)
        return NextResponse.json({ error: "station_name und user_id erforderlich" }, { status: 400 });
    const db = admin();
    const { data: target } = await db
        .from("user_profiles")
        .select("full_name, facility, role")
        .eq("id", user_id)
        .single();
    if (!target || !sameFacility(target.facility, ctx.facilityName) || target.role !== "mitarbeiter") {
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }
    const { data, error } = await db
        .from("station_leaders")
        .upsert({ facility_name: ctx.facilityName, station_name, user_id, staff_name: target.full_name ?? "" }, { onConflict: "station_name,user_id,facility_name" })
        .select()
        .single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'station_leaders' fehlt — SQL-Migration 20260604 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ leader: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { station_name, user_id } = await req.json();
    if (!station_name || !user_id)
        return NextResponse.json({ error: "station_name und user_id erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("station_leaders")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("station_name", station_name)
        .eq("user_id", user_id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
