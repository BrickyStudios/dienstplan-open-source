import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { data, error } = await admin()
        .from("bereich_members")
        .select("*")
        .eq("facility_name", ctx.facilityName);
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ members: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ members: data ?? [] });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { bereich_id, user_id, is_leader } = await req.json();
    if (!bereich_id || !user_id)
        return NextResponse.json({ error: "bereich_id und user_id erforderlich" }, { status: 400 });
    const { data, error } = await admin()
        .from("bereich_members")
        .update({ is_leader: !!is_leader })
        .eq("facility_name", ctx.facilityName)
        .eq("bereich_id", bereich_id)
        .eq("user_id", user_id)
        .select()
        .single();
    if (error) {
        if (spalteFehlt(error))
            return NextResponse.json({ error: "Spalte 'is_leader' fehlt — SQL-Migration 20260603 erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ member: data });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { bereich_id, user_id } = await req.json();
    if (!bereich_id || !user_id)
        return NextResponse.json({ error: "bereich_id und user_id erforderlich" }, { status: 400 });
    const db = admin();
    const { data: target } = await db
        .from("user_profiles")
        .select("full_name, facility, role")
        .eq("id", user_id)
        .single();
    if (!target || !sameFacility(target.facility, ctx.facilityName) || target.role !== "mitarbeiter") {
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }
    const { data: bereich } = await db
        .from("bereiche")
        .select("id")
        .eq("id", bereich_id)
        .eq("facility_name", ctx.facilityName)
        .single();
    if (!bereich)
        return NextResponse.json({ error: "Bereich nicht gefunden" }, { status: 404 });
    const { data, error } = await db
        .from("bereich_members")
        .upsert({ facility_name: ctx.facilityName, bereich_id, user_id, staff_name: target.full_name ?? "" }, { onConflict: "bereich_id,user_id" })
        .select()
        .single();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'bereich_members' fehlt — SQL-Migration erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ member: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { bereich_id, user_id } = await req.json();
    if (!bereich_id || !user_id)
        return NextResponse.json({ error: "bereich_id und user_id erforderlich" }, { status: 400 });
    const { error } = await admin()
        .from("bereich_members")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("bereich_id", bereich_id)
        .eq("user_id", user_id);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
