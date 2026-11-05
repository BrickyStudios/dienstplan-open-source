import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { NextRequest, NextResponse } from "next/server";
import { errMsg } from "@/lib/db-fehler";
import { deriveShiftType } from "@/lib/scheduling/shift-demand";
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const { searchParams } = new URL(req.url);
        const facility = ctx.facilityName;
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const adminClient = createAdminClient();
        let query = adminClient.from("shifts").select("*").eq("facility_name", facility).order("date", { ascending: true }).order("shift_type");
        if (from)
            query = query.gte("date", from);
        if (to)
            query = query.lte("date", to);
        const { data, error } = await query;
        if (error)
            throw error;
        return NextResponse.json({ shifts: data ?? [] });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const body = await req.json();
        const { station, date, shift_type, start_time, end_time, planned_staff, actual_staff, notes } = body;
        if (!date)
            return NextResponse.json({ error: "Datum erforderlich" }, { status: 400 });
        const adminClient = createAdminClient();
        const derivedType = shift_type || deriveShiftType(start_time, end_time);
        const { data, error } = await adminClient.from("shifts").insert({
            facility_name: ctx.facilityName,
            station: station || "Station 1",
            date,
            shift_type: derivedType,
            start_time: start_time || null,
            end_time: end_time || null,
            planned_staff: parseInt(planned_staff) || 0,
            actual_staff: parseInt(actual_staff) || 0,
            notes: notes || "",
        }).select().single();
        if (error)
            throw error;
        return NextResponse.json({ shift: data });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function PATCH(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const body = await req.json();
        const { id, station, shift_type, start_time, end_time, planned_staff, actual_staff, notes } = body;
        if (!id)
            return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
        const adminClient = createAdminClient();
        const updates: Record<string, unknown> = {};
        if (station !== undefined)
            updates.station = station;
        if (start_time !== undefined) {
            updates.start_time = start_time;
            updates.shift_type = deriveShiftType(start_time, end_time ?? null);
        }
        if (end_time !== undefined)
            updates.end_time = end_time;
        if (shift_type !== undefined && start_time === undefined)
            updates.shift_type = shift_type;
        if (planned_staff !== undefined)
            updates.planned_staff = parseInt(planned_staff) || 0;
        if (actual_staff !== undefined)
            updates.actual_staff = parseInt(actual_staff) || 0;
        if (notes !== undefined)
            updates.notes = notes;
        const { data, error } = await adminClient
            .from("shifts").update(updates).eq("id", id).eq("facility_name", ctx.facilityName).select().single();
        if (error)
            throw error;
        return NextResponse.json({ shift: data });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
export async function DELETE(req: NextRequest) {
    try {
        const ctx = await resolveLeitung(req);
        if (!ctx)
            return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        const { id } = await req.json();
        if (!id)
            return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
        const adminClient = createAdminClient();
        const { error } = await adminClient.from("shifts").delete().eq("id", id).eq("facility_name", ctx.facilityName);
        if (error)
            throw error;
        return NextResponse.json({ ok: true });
    }
    catch (err) {
        return NextResponse.json({ error: errMsg(err) }, { status: 500 });
    }
}
