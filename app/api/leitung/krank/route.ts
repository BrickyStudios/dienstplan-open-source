import { NextRequest, NextResponse, after } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { resolveSickGap } from "@/lib/sick-resolution";
import { notifyLeitungSickLogged } from "@/lib/sick-report-notify";
import { admin } from "@/lib/admin-client";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { berlinTagISO } from "@/lib/date";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? berlinTagISO(-7);
    const to = searchParams.get("to") ?? berlinTagISO(14);
    const db = admin();
    const { data: reports, error } = await db.from("sick_reports")
        .select("*, springer_contacts(*)")
        .eq("facility_name", ctx.facilityName)
        .gte("sick_date", from)
        .lte("sick_date", to)
        .order("sick_date", { ascending: false });
    if (tabelleFehlt(error))
        return NextResponse.json({ reports: [], tableMissing: true });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: settings } = await db.from("facility_settings")
        .select("employee_sick_reporting_enabled")
        .eq("facility_name", ctx.facilityName)
        .maybeSingle();
    return NextResponse.json({
        reports: reports ?? [],
        employeeSelfReportingEnabled: settings?.employee_sick_reporting_enabled ?? true,
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { sickStaffName, sickUserId, station, sickDate, shiftType, note, requestReplacement } = await req.json().catch(() => ({}));
    if (!sickStaffName || !sickDate)
        return NextResponse.json({ error: "sickStaffName + sickDate erforderlich" }, { status: 400 });
    const replacement = typeof requestReplacement === "boolean" ? requestReplacement : null;
    const db = admin();
    const payload: Record<string, unknown> = {
        reporter_user_id: ctx.userId,
        sick_user_id: sickUserId ?? ctx.userId,
        sick_staff_name: sickStaffName,
        facility_name: ctx.facilityName,
        station: station ?? null,
        sick_date: sickDate,
        shift_type: shiftType ?? null,
        note: note ?? null,
        reported_by_leitung: true,
        request_replacement: replacement,
    };
    let { data, error } = await db.from("sick_reports").insert(payload).select().single();
    if (error && spalteFehlt(error)) {
        delete payload.request_replacement;
        ({ data, error } = await db.from("sick_reports").insert(payload).select().single());
    }
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.id)
        after(() => resolveSickGap(db, ctx.facilityName, data.id as string, { requestReplacement: replacement, excludeUserId: ctx.userId }));
    if (data)
        after(() => notifyLeitungSickLogged(db, ctx.facilityName, data, { excludeUserId: ctx.userId }));
    return NextResponse.json({ report: data });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id, status } = await req.json().catch(() => ({}));
    if (!id || !status)
        return NextResponse.json({ error: "id + status erforderlich" }, { status: 400 });
    const db = admin();
    const { data, error } = await db.from("sick_reports")
        .update({ status })
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select().single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ report: data });
}
