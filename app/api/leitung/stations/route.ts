import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { NextRequest, NextResponse } from "next/server";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
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
        .from("stations")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .eq("archived", false)
        .order("sort_order")
        .order("name");
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ stations: [] });
        if (spalteFehlt(error) && error.message?.includes("facility_name")) {
            return NextResponse.json({ error: "DB-Migration erforderlich: ALTER TABLE stations ADD COLUMN IF NOT EXISTS facility_name text NOT NULL DEFAULT ''; NOTIFY pgrst, 'reload schema';" }, { status: 500 });
        }
        if (spalteFehlt(error) || error.message?.includes("color")) {
            const retry = await admin
                .from("stations")
                .select("id, facility_name, name, sort_order, archived, created_at")
                .eq("facility_name", ctx.facilityName)
                .eq("archived", false)
                .order("sort_order").order("name");
            if (retry.error)
                return NextResponse.json({ stations: [] });
            return NextResponse.json({ stations: (retry.data ?? []).map(s => ({ ...s, color: "#64748b" })) });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ stations: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { name, color, station_type } = await req.json();
    if (!name?.trim())
        return NextResponse.json({ error: "Name erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data: existing } = await admin
        .from("stations")
        .select("sort_order")
        .eq("facility_name", ctx.facilityName)
        .order("sort_order", { ascending: false })
        .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
    let { data, error } = await admin.from("stations").insert({
        facility_name: ctx.facilityName,
        name: name.trim(),
        color: color || "#64748b",
        station_type: station_type || "Pflegestation",
        sort_order: nextOrder,
    }).select().single();
    if (spalteFehlt(error) && error?.message?.includes("facility_name")) {
        return NextResponse.json({ error: "DB-Migration erforderlich: ALTER TABLE stations ADD COLUMN IF NOT EXISTS facility_name text NOT NULL DEFAULT ''; NOTIFY pgrst, 'reload schema';" }, { status: 500 });
    }
    if (spalteFehlt(error) || error?.message?.includes("color")) {
        const retry = await admin.from("stations").insert({
            facility_name: ctx.facilityName,
            name: name.trim(),
            sort_order: nextOrder,
        }).select().single();
        data = retry.data;
        error = retry.error;
    }
    if (error) {
        if (error.code === "23505")
            return NextResponse.json({ error: "Diese Station existiert bereits" }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ station: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveContext(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, name, color, archived, station_type, ppbv_exempt, shift_swap_enabled } = await req.json();
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data: oldStation } = await admin
        .from("stations")
        .select("name")
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .single();
    const oldName = (oldStation as {
        name?: string;
    } | null)?.name;
    const updates: Record<string, unknown> = {};
    if (name !== undefined)
        updates.name = name.trim();
    if (color !== undefined)
        updates.color = color;
    if (archived !== undefined)
        updates.archived = archived;
    if (station_type !== undefined)
        updates.station_type = station_type;
    if (ppbv_exempt !== undefined)
        updates.ppbv_exempt = Boolean(ppbv_exempt);
    if (shift_swap_enabled !== undefined) {
        updates.shift_swap_enabled = shift_swap_enabled === null ? null : Boolean(shift_swap_enabled);
    }
    let { data, error } = await admin
        .from("stations")
        .update(updates)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select()
        .single();
    if (spalteFehlt(error) || error?.message?.includes("color") || error?.message?.includes("ppbv_exempt")
        || error?.message?.includes("shift_swap_enabled")) {
        const safeUpdates = { ...updates };
        delete safeUpdates.color;
        delete safeUpdates.ppbv_exempt;
        delete safeUpdates.shift_swap_enabled;
        const retry = await admin.from("stations").update(safeUpdates)
            .eq("id", id).eq("facility_name", ctx.facilityName).select().single();
        data = retry.data;
        error = retry.error;
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (name !== undefined && oldName && name.trim() !== oldName) {
        await admin
            .from("shifts")
            .update({ station: name.trim() })
            .eq("facility_name", ctx.facilityName)
            .eq("station", oldName);
    }
    return NextResponse.json({ station: data });
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
        .from("stations")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
