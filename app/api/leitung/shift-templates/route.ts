import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { NextRequest, NextResponse } from "next/server";
import { tabelleFehlt } from "@/lib/db-fehler";
async function resolveContext(req: NextRequest): Promise<{
    facilityName: string;
} | null> {
    const ctx = await resolveLeitung(req);
    return ctx ? { facilityName: ctx.facilityName } : null;
}
export async function GET(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("shift_templates")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .order("sort_order")
        .order("name");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ templates: [] });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { name, start_time, end_time, color } = await req.json();
    if (!name?.trim() || !start_time || !end_time) {
        return NextResponse.json({ error: "Name und Zeiten erforderlich" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: existing } = await admin
        .from("shift_templates")
        .select("sort_order")
        .eq("facility_name", ctx.facilityName)
        .order("sort_order", { ascending: false })
        .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    const { data, error } = await admin.from("shift_templates").insert({
        facility_name: ctx.facilityName,
        name: name.trim(),
        start_time,
        end_time,
        color: color || "#3b82f6",
        sort_order: nextOrder,
    }).select().single();
    if (error) {
        if (error.code === "23505")
            return NextResponse.json({ error: "Diese Vorlage existiert bereits" }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, name, start_time, end_time, color } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const updates: Record<string, unknown> = {};
    if (name !== undefined)
        updates.name = name.trim();
    if (start_time !== undefined)
        updates.start_time = start_time;
    if (end_time !== undefined)
        updates.end_time = end_time;
    if (color !== undefined)
        updates.color = color;
    const { data, error } = await admin
        .from("shift_templates")
        .update(updates)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select()
        .single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ template: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin
        .from("shift_templates")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
