import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
const STATUS = ["offen", "in_arbeit", "erledigt", "verworfen"] as const;
type Status = (typeof STATUS)[number];
const COLS = "id, station, shift_type, headcount, avg_gap, understaffed_ratio, sample_count, status, note, created_at, updated_at";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staffing_needs")
        .select(COLS)
        .eq("facility_name", ctx.facilityName)
        .order("created_at", { ascending: false });
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ needs: [], tableMissing: true });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ needs: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const station = typeof body?.station === "string" ? body.station.trim() : "";
    const shiftType = typeof body?.shift_type === "string" ? body.shift_type.trim() : "";
    if (!station || !shiftType) {
        return NextResponse.json({ error: "Station und Schichtart sind erforderlich." }, { status: 400 });
    }
    const headcount = Math.max(1, Math.min(99, Math.round(Number(body?.headcount) || 1)));
    const admin = createAdminClient();
    const { data: vorhanden } = await admin
        .from("staffing_needs")
        .select("id, status")
        .eq("facility_name", ctx.facilityName)
        .eq("station", station)
        .eq("shift_type", shiftType)
        .maybeSingle();
    const felder = {
        facility_name: ctx.facilityName,
        station,
        shift_type: shiftType,
        headcount,
        avg_gap: Number.isFinite(Number(body?.avg_gap)) ? Number(body.avg_gap) : null,
        understaffed_ratio: Number.isFinite(Number(body?.understaffed_ratio)) ? Number(body.understaffed_ratio) : null,
        sample_count: Number.isFinite(Number(body?.sample_count)) ? Math.round(Number(body.sample_count)) : null,
        decided_by: ctx.userId ?? null,
        updated_at: new Date().toISOString(),
        ...(vorhanden ? {} : { status: "offen" as Status }),
    };
    const { data, error } = await admin
        .from("staffing_needs")
        .upsert(felder, { onConflict: "facility_name,station,shift_type" })
        .select(COLS)
        .single();
    if (error) {
        if (tabelleFehlt(error)) {
            return NextResponse.json({
                error: "Personalbedarf kann noch nicht gespeichert werden — die Migration supabase/migrations/20260909_staffing_needs.sql muss im Supabase SQL-Editor ausgeführt werden.",
                tableMissing: true,
            }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ need: data, wasExisting: Boolean(vorhanden) });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id)
        return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const felder: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body?.status === "string" && (STATUS as readonly string[]).includes(body.status)) {
        felder.status = body.status;
    }
    if (body?.headcount != null) {
        felder.headcount = Math.max(1, Math.min(99, Math.round(Number(body.headcount) || 1)));
    }
    if (typeof body?.note === "string")
        felder.note = body.note.trim().slice(0, 500) || null;
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staffing_needs")
        .update(felder)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select(COLS)
        .maybeSingle();
    if (error) {
        if (tabelleFehlt(error))
            return NextResponse.json({ error: "Tabelle fehlt — Migration ausstehend.", tableMissing: true }, { status: 409 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data)
        return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    return NextResponse.json({ need: data });
}
