import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { NextRequest, NextResponse } from "next/server";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("bereiche")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .order("sort_order")
        .order("name");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ bereiche: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ bereiche: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { name, color } = await req.json();
    if (!name?.trim())
        return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data: existing } = await admin
        .from("bereiche")
        .select("sort_order")
        .eq("facility_name", ctx.facilityName)
        .order("sort_order", { ascending: false })
        .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { data, error } = await admin.from("bereiche").insert({
        facility_name: ctx.facilityName,
        name: name.trim(),
        color: color || "#64748b",
        sort_order: nextOrder,
    }).select().single();
    if (error) {
        if (error.code === "23505")
            return NextResponse.json({ error: "Dieser Bereich existiert bereits" }, { status: 409 });
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle 'bereiche' fehlt — SQL-Migration erforderlich" }, { status: 500 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ bereich: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, name, color, shift_swap_enabled } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (name !== undefined)
        updates.name = name.trim();
    if (color !== undefined)
        updates.color = color;
    if (shift_swap_enabled !== undefined) {
        updates.shift_swap_enabled = shift_swap_enabled === null ? null : Boolean(shift_swap_enabled);
    }
    let { data, error } = await admin
        .from("bereiche")
        .update(updates)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select()
        .single();
    if (spalteFehlt(error) && "shift_swap_enabled" in updates) {
        const ohne = { ...updates };
        delete ohne.shift_swap_enabled;
        if (Object.keys(ohne).length === 0) {
            return NextResponse.json({ error: "DB-Migration erforderlich: bereiche.shift_swap_enabled fehlt (supabase/migrations/20260911_schichtabgabe.sql)." }, { status: 500 });
        }
        const erneut = await admin.from("bereiche").update(ohne)
            .eq("id", id).eq("facility_name", ctx.facilityName).select().single();
        data = erneut.data;
        error = erneut.error;
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bereich: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin
        .from("bereiche")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
