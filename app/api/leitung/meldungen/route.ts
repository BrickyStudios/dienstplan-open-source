import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { spalteFehlt } from "@/lib/db-fehler";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { data, error } = await createAdminClient().from("facility_settings")
        .select("employee_late_reporting_enabled").eq("facility_name", ctx.facilityName).maybeSingle();
    if (spalteFehlt(error))
        return NextResponse.json({ verspaetung: true, migrationFehlt: true });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ verspaetung: (data as {
            employee_late_reporting_enabled?: boolean | null;
        } | null)?.employee_late_reporting_enabled !== false });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => null)) as {
        verspaetung?: unknown;
    } | null;
    if (typeof body?.verspaetung !== "boolean")
        return NextResponse.json({ error: "verspaetung (true/false) fehlt" }, { status: 400 });
    const { error } = await createAdminClient().from("facility_settings").upsert({ facility_name: ctx.facilityName, employee_late_reporting_enabled: body.verspaetung }, { onConflict: "facility_name" });
    if (spalteFehlt(error))
        return NextResponse.json({ error: "Migration fehlt: supabase/migrations/20261010_verspaetung_und_rueckmeldung.sql" }, { status: 500 });
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
