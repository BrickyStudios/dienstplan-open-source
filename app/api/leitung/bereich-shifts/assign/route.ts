import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { tabelleFehlt } from "@/lib/db-fehler";
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { shift_id, staff_name, user_id } = await req.json();
    if (!shift_id || !staff_name?.trim())
        return NextResponse.json({ error: "shift_id und staff_name erforderlich" }, { status: 400 });
    const db = admin();
    const { data: shift } = await db
        .from("bereich_shifts").select("id").eq("id", shift_id).eq("facility_name", ctx.facilityName).single();
    if (!shift)
        return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
    const { data, error } = await db
        .from("bereich_shift_assignments")
        .upsert({ facility_name: ctx.facilityName, shift_id, staff_name: staff_name.trim(), user_id: user_id || null }, { onConflict: "shift_id,staff_name" })
        .select().single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'bereich_shift_assignments' fehlt — SQL-Migration 20260608 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ assignment: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { shift_id, staff_name } = await req.json();
    if (!shift_id || !staff_name)
        return NextResponse.json({ error: "shift_id und staff_name erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("bereich_shift_assignments")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("shift_id", shift_id)
        .eq("staff_name", staff_name);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
