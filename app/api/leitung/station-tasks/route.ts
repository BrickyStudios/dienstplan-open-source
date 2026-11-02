import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { insertWithOptional, updateWithOptional, AUFGABEN_AKTIONEN, trimOrNull, aufgabenAenderung } from "@/lib/task-extras";
import { resolveTaskCategory, cleanChecklistInstance } from "@/lib/task-category";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
const ACTIONS = AUFGABEN_AKTIONEN;
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const stationName = req.nextUrl.searchParams.get("station_name");
    let q = admin().from("station_tasks").select("*").eq("facility_name", ctx.facilityName);
    if (stationName)
        q = q.eq("station_name", stationName);
    q = q.order("status").order("priority", { ascending: true }).order("created_at", { ascending: false });
    const { data, error } = await q;
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ tasks: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tasks: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const stationName = trimOrNull(body.station_name);
    const title = trimOrNull(body.title);
    if (!stationName)
        return NextResponse.json({ error: "station_name erforderlich" }, { status: 400 });
    if (!title)
        return NextResponse.json({ error: "Beschreibung erforderlich" }, { status: 400 });
    const priority = body.priority === "hoch" ? "hoch" : "normal";
    const cat = await resolveTaskCategory(admin(), ctx.facilityName, body.category_id);
    const action = ACTIONS.includes(cat?.action ?? body.action) ? (cat?.action ?? body.action) : "reinigen";
    const requiresSignature = (cat?.requires_signature ?? false) || body.requires_signature === true;
    const extra: Record<string, unknown> = { ...(cat?.extra ?? {}) };
    if (requiresSignature)
        extra.requires_signature = true;
    const { data, error } = await insertWithOptional(admin(), "station_tasks", {
        facility_name: ctx.facilityName,
        station_name: stationName,
        title,
        room: trimOrNull(body.room),
        building: trimOrNull(body.building),
        bed: trimOrNull(body.bed),
        action,
        priority,
        created_by_name: ctx.leitungName,
    }, extra);
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'station_tasks' fehlt — SQL-Migration 20260604 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ task: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json();
    const { id } = body;
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const aenderung = aufgabenAenderung(body, ctx.leitungName, false);
    if ("fehler" in aenderung)
        return NextResponse.json({ error: aenderung.fehler }, { status: 400 });
    const updates = aenderung.updates;
    const extra: Record<string, unknown> = {};
    if (body.requires_signature !== undefined)
        extra.requires_signature = body.requires_signature === true;
    if (body.checklist !== undefined) {
        const cl = cleanChecklistInstance(body.checklist);
        if (cl)
            extra.checklist = cl;
    }
    const { data, error } = await updateWithOptional(admin(), "station_tasks", updates, extra, { id, facility_name: ctx.facilityName });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ task: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json();
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("station_tasks")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
