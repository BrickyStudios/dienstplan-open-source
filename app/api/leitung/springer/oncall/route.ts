import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { berlinTodayISO, berlinTagISO } from "@/lib/date";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? berlinTodayISO();
    const to = searchParams.get("to") ?? berlinTagISO(30);
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("springer_oncall")
        .select("*")
        .eq("facility_name", ctx.facilityName)
        .gte("oncall_date", from)
        .lte("oncall_date", to)
        .order("oncall_date");
    if (tabelleFehlt(error))
        return NextResponse.json({ entries: [], tableMissing: true });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { staffName, staffUserId, oncallDate, shiftType } = await req.json();
    if (!staffName || !oncallDate)
        return NextResponse.json({ error: "staffName + oncallDate erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("springer_oncall")
        .upsert({
        facility_name: ctx.facilityName,
        staff_name: staffName,
        staff_user_id: staffUserId ?? null,
        oncall_date: oncallDate,
        shift_type: shiftType ?? null,
    }, { onConflict: "facility_name,staff_name,oncall_date,shift_type" })
        .select()
        .single();
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json();
    if (!id)
        return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin
        .from("springer_oncall")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
