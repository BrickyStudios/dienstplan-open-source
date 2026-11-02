import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const bereichId = url.searchParams.get("bereich_id");
    const db = admin();
    let q = db.from("bereich_shifts").select("*").eq("facility_name", ctx.facilityName);
    if (from)
        q = q.gte("date", from);
    if (to)
        q = q.lte("date", to);
    if (bereichId)
        q = q.eq("bereich_id", bereichId);
    const { data: shifts, error } = await q.order("date").order("start_time");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ shifts: [], assignments: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const ids = (shifts ?? []).map(s => s.id);
    let assignments: unknown[] = [];
    if (ids.length > 0) {
        const { data } = await db.from("bereich_shift_assignments").select("*").in("shift_id", ids);
        assignments = data ?? [];
    }
    return NextResponse.json({ shifts: shifts ?? [], assignments });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { bereich_id, date, start_time, end_time, label, notes } = await req.json();
    if (!bereich_id || !date)
        return NextResponse.json({ error: "bereich_id und date erforderlich" }, { status: 400 });
    const db = admin();
    const { data: bereich } = await db
        .from("bereiche").select("id").eq("id", bereich_id).eq("facility_name", ctx.facilityName).single();
    if (!bereich)
        return NextResponse.json({ error: "Bereich nicht gefunden" }, { status: 404 });
    const { data, error } = await db.from("bereich_shifts").insert({
        facility_name: ctx.facilityName,
        bereich_id,
        date,
        start_time: start_time || null,
        end_time: end_time || null,
        label: label?.trim() || null,
        notes: notes?.trim() || null,
    }).select().single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'bereich_shifts' fehlt — SQL-Migration 20260608 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ shift: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("bereich_shifts").delete().eq("id", id).eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
