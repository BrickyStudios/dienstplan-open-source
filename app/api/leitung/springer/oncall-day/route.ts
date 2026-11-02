import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO } from "@/lib/date";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const date = new URL(req.url).searchParams.get("date") ?? berlinTodayISO();
    const admin = createAdminClient();
    const { data, error } = await admin.from("facility_oncall_days")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .eq("oncall_date", date)
        .maybeSingle();
    if (tabelleFehlt(error))
        return NextResponse.json({ active: false, tableMissing: true });
    return NextResponse.json({ active: !!data, day: data ?? null });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { date, note } = await req.json().catch(() => ({}));
    const oncallDate = date ?? berlinTodayISO();
    const admin = createAdminClient();
    const { data, error } = await admin.from("facility_oncall_days").upsert({
        facility_name: ctx.facilityName,
        oncall_date: oncallDate,
        enabled_by: ctx.userId,
        note: note ?? null,
    }, { onConflict: "facility_name,oncall_date" }).select().single();
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Migration erforderlich" }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ day: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { date } = await req.json().catch(() => ({}));
    const oncallDate = date ?? berlinTodayISO();
    const admin = createAdminClient();
    await admin.from("facility_oncall_days")
        .delete()
        .eq("facility_name", ctx.facilityName)
        .eq("oncall_date", oncallDate);
    return NextResponse.json({ success: true });
}
