import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { loadStaffDirectory } from "@/lib/staff-identity";
import { entscheideAlsLeitung, verarbeiteFaelligeVorgaenge, beschreibeDiagnose, istMigrationsLuecke, type ReleaseRow, type OfferRow, } from "@/lib/shift-release";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    await verarbeiteFaelligeVorgaenge(admin, ctx.facilityName);
    const { data, error } = await admin.from("shift_release_requests").select("*")
        .eq("facility_name", ctx.facilityName)
        .order("created_at", { ascending: false }).limit(200);
    if (istMigrationsLuecke(error?.code)) {
        return NextResponse.json({ migrationFehlt: true, vorgaenge: [] });
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    const vorgaenge = (data ?? []) as ReleaseRow[];
    const dir = await loadStaffDirectory(admin, ctx.facilityName);
    let angebote: OfferRow[] = [];
    if (vorgaenge.length > 0) {
        const { data: o } = await admin.from("shift_release_offers").select("*")
            .in("release_id", vorgaenge.map(v => v.id)).order("rang");
        angebote = (o ?? []) as OfferRow[];
    }
    const angeboteZuVorgang = new Map<string, OfferRow[]>();
    for (const a of angebote) {
        const liste = angeboteZuVorgang.get(a.release_id);
        if (liste)
            liste.push(a);
        else
            angeboteZuVorgang.set(a.release_id, [a]);
    }
    return NextResponse.json({
        migrationFehlt: false,
        vorgaenge: vorgaenge.map(v => ({
            ...v,
            staffName: dir.nameById.get(v.staff_id) ?? "Unbekannt",
            uebernommenVonName: v.uebernommen_von ? (dir.nameById.get(v.uebernommen_von) ?? null) : null,
            diagnoseText: beschreibeDiagnose(v.diagnose),
            verlauf: (angeboteZuVorgang.get(v.id) ?? []).map(a => ({
                rang: a.rang, status: a.status, frist: a.frist, decided_at: a.decided_at,
                name: dir.nameById.get(a.staff_id) ?? "Unbekannt",
            })),
        })),
    });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const releaseId = typeof body.release_id === "string" ? body.release_id : "";
    const entscheidung = body.entscheidung === "freigeben" ? "freigeben"
        : body.entscheidung === "ablehnen" ? "ablehnen" : null;
    const hinweis = typeof body.hinweis === "string" ? body.hinweis.trim() : "";
    if (!releaseId || !entscheidung) {
        return NextResponse.json({ error: "Vorgang oder Entscheidung fehlt" }, { status: 400 });
    }
    const admin = createAdminClient();
    const res = await entscheideAlsLeitung(admin, ctx.facilityName, releaseId, entscheidung, hinweis || undefined);
    return NextResponse.json(res, { status: res.ok ? 200 : (res.code ?? 400) });
}
