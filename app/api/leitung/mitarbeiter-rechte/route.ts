import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { tabelleFehlt, spalteFehlt } from "@/lib/db-fehler";
import { ALLE_RECHTE, ladePraxisSelbst, leseRechte, leseSelbst, type Recht } from "@/lib/rechte";
const MIGRATION = "Die Tabelle für Rechte fehlt noch — Migration 20261022_mitarbeiter_rechte.sql im Supabase-SQL-Editor ausführen.";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const [{ data, error }, praxis] = await Promise.all([
        admin.from("mitarbeiter_rechte").select("user_id, rechte, selbstbedienung").eq("facility_name", ctx.facilityName),
        ladePraxisSelbst(admin, ctx.facilityName),
    ]);
    if (error && tabelleFehlt(error)) {
        return NextResponse.json({ eintraege: [], praxis, vergebbar: ctx.delegiert ? ctx.rechte ?? [] : ALLE_RECHTE, tabelleFehlt: true });
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
        eintraege: (data ?? []).map((r: {
            user_id: string;
            rechte: unknown;
            selbstbedienung: unknown;
        }) => ({
            userId: r.user_id, rechte: leseRechte(r.rechte), selbstbedienung: leseSelbst(r.selbstbedienung),
        })),
        praxis,
        vergebbar: ctx.delegiert ? ctx.rechte ?? [] : ALLE_RECHTE,
    });
}
export async function PUT(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => null)) as {
        userId?: unknown;
        rechte?: unknown;
        selbstbedienung?: unknown;
    } | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId))
        return NextResponse.json({ error: "Person fehlt." }, { status: 400 });
    const admin = createAdminClient();
    const [{ data: staff }, { data: profil }] = await Promise.all([
        admin.from("facility_staff").select("id").eq("id", userId).eq("facility_name", ctx.facilityName).maybeSingle(),
        admin.from("user_profiles").select("role, facility").eq("id", userId).maybeSingle(),
    ]);
    if (!staff && profil?.facility !== ctx.facilityName)
        return NextResponse.json({ error: "Person nicht gefunden." }, { status: 404 });
    if (profil?.role === "leitung" || profil?.role === "demo") {
        return NextResponse.json({ error: "Eine Leitung hat bereits alle Rechte." }, { status: 400 });
    }
    const { data: alt, error: altErr } = await admin.from("mitarbeiter_rechte")
        .select("rechte, selbstbedienung").eq("facility_name", ctx.facilityName).eq("user_id", userId).maybeSingle();
    if (altErr && tabelleFehlt(altErr))
        return NextResponse.json({ error: MIGRATION }, { status: 503 });
    const eigene: Recht[] = ctx.delegiert ? ctx.rechte ?? [] : ALLE_RECHTE;
    const gewuenscht = leseRechte(body?.rechte);
    const bisher = leseRechte(alt?.rechte);
    const rechte = [...new Set([...bisher.filter(r => !eigene.includes(r)), ...gewuenscht.filter(r => eigene.includes(r))])];
    const selbstbedienung = body?.selbstbedienung === undefined ? leseSelbst(alt?.selbstbedienung) : leseSelbst(body.selbstbedienung);
    const { error } = await admin.from("mitarbeiter_rechte").upsert({
        facility_name: ctx.facilityName, user_id: userId, rechte, selbstbedienung,
        updated_at: new Date().toISOString(), updated_by: ctx.createdBy,
    }, { onConflict: "facility_name,user_id" });
    if (error)
        return NextResponse.json({ error: tabelleFehlt(error) ? MIGRATION : error.message }, { status: tabelleFehlt(error) ? 503 : 500 });
    return NextResponse.json({ ok: true, rechte, selbstbedienung });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => null)) as {
        selbstbedienung?: unknown;
    } | null;
    const werte = leseSelbst(body?.selbstbedienung);
    const admin = createAdminClient();
    const { krank, ...rest } = werte;
    if (typeof krank === "boolean") {
        const { error } = await admin.from("facility_settings").update({ employee_sick_reporting_enabled: krank }).eq("facility_name", ctx.facilityName);
        if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (Object.keys(rest).length) {
        const { data: s } = await admin.from("facility_settings").select("selbstbedienung").eq("facility_name", ctx.facilityName).maybeSingle();
        const { error } = await admin.from("facility_settings")
            .update({ selbstbedienung: { ...leseSelbst(s?.selbstbedienung), ...rest } }).eq("facility_name", ctx.facilityName);
        if (error)
            return NextResponse.json({ error: spalteFehlt(error) ? MIGRATION : error.message }, { status: spalteFehlt(error) ? 503 : 500 });
    }
    return NextResponse.json({ ok: true, praxis: await ladePraxisSelbst(admin, ctx.facilityName) });
}
