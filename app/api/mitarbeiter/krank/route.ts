import { admin as createAdminClient } from "@/lib/admin-client";
import { ladePraxisSelbst, selbstbedienungFuer } from "@/lib/rechte";
import { NextRequest, NextResponse, after } from "next/server";
import { resolveSickGap } from "@/lib/sick-resolution";
import { notifyLeitungSickLogged } from "@/lib/sick-report-notify";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { tabelleFehlt } from "@/lib/db-fehler";
async function resolveUser(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("user_profiles")
        .select("role, facility, full_name").eq("id", user.id).single();
    if (!profile)
        return null;
    return { userId: user.id, facilityName: profile.facility ?? "", name: profile.full_name ?? "", role: profile.role };
}
export async function GET(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const selfReportingEnabled = ctx.role === "mitarbeiter"
        ? (await selbstbedienungFuer(createAdminClient(), ctx.facilityName, ctx.userId)).krank
        : (await ladePraxisSelbst(createAdminClient(), ctx.facilityName)).krank ?? true;
    return NextResponse.json({
        selfReportingEnabled,
        selfReportingDisabled: !selfReportingEnabled,
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const admin = createAdminClient();
    const selfReportingEnabled = ctx.role === "mitarbeiter"
        ? (await selbstbedienungFuer(admin, ctx.facilityName, ctx.userId)).krank
        : (await ladePraxisSelbst(admin, ctx.facilityName)).krank ?? true;
    if (!selfReportingEnabled) {
        return NextResponse.json({
            error: "Selbstmeldung deaktiviert — bitte rufen Sie die Praxisleitung an",
            selfReportingDisabled: true,
        }, { status: 403 });
    }
    const { sickDate, shiftType, station, note } = await req.json().catch(() => ({}));
    if (!sickDate)
        return NextResponse.json({ error: "sickDate erforderlich" }, { status: 400 });
    const { data, error } = await admin.from("sick_reports").insert({
        reporter_user_id: ctx.userId,
        sick_user_id: ctx.userId,
        sick_staff_name: ctx.name,
        facility_name: ctx.facilityName,
        station: station ?? null,
        sick_date: sickDate,
        shift_type: shiftType ?? null,
        note: note ?? null,
        reported_by_leitung: false,
    }).select().single();
    if (tabelleFehlt(error))
        return NextResponse.json({ error: "Tabelle fehlt — SQL ausführen", tableMissing: true }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.id)
        after(() => resolveSickGap(admin, ctx.facilityName, data.id as string));
    if (data)
        after(() => notifyLeitungSickLogged(admin, ctx.facilityName, data));
    return NextResponse.json({ report: data });
}
