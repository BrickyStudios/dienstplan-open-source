import { selbstGesperrt } from "@/lib/rechte";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveSwapActor } from "@/lib/swap-auth";
import { resolveSwapScope } from "@/lib/swap-scope";
import { starteAbgabe, beantworteAngebot, ziehZurueck, verarbeiteFaelligeVorgaenge, istMigrationsLuecke, beschreibeDiagnose, type ReleaseRow, type OfferRow, } from "@/lib/shift-release";
export async function GET(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!actor.facility)
        return NextResponse.json({ error: "Keine Einrichtung zugeordnet" }, { status: 400 });
    const admin = createAdminClient();
    await verarbeiteFaelligeVorgaenge(admin, actor.facility);
    const [eigeneRes, angeboteRes] = await Promise.all([
        admin.from("shift_release_requests").select("*")
            .eq("facility_name", actor.facility).eq("staff_id", actor.staffId)
            .order("created_at", { ascending: false }).limit(50),
        admin.from("shift_release_offers").select("*")
            .eq("facility_name", actor.facility).eq("staff_id", actor.staffId).eq("status", "offen"),
    ]);
    if (istMigrationsLuecke(eigeneRes.error?.code) || istMigrationsLuecke(angeboteRes.error?.code)) {
        return NextResponse.json({ migrationFehlt: true, eigene: [], anfragen: [], scope: null });
    }
    if (eigeneRes.error || angeboteRes.error) {
        return NextResponse.json({ error: (eigeneRes.error ?? angeboteRes.error)!.message }, { status: 500 });
    }
    const eigene = (eigeneRes.data ?? []) as ReleaseRow[];
    const offeneAngebote = (angeboteRes.data ?? []) as OfferRow[];
    let vorgaengeZuAnfragen: ReleaseRow[] = [];
    if (offeneAngebote.length > 0) {
        const { data } = await admin.from("shift_release_requests").select("*")
            .in("id", [...new Set(offeneAngebote.map(a => a.release_id))]);
        vorgaengeZuAnfragen = (data ?? []) as ReleaseRow[];
    }
    const vorgangById = new Map(vorgaengeZuAnfragen.map(v => [v.id, v]));
    const scope = await resolveSwapScope(admin, actor.facility, null, actor.userId);
    return NextResponse.json({
        migrationFehlt: false,
        scope,
        eigene: eigene.map(v => ({ ...v, diagnoseText: beschreibeDiagnose(v.diagnose) })),
        anfragen: offeneAngebote
            .map(a => ({ angebot: a, vorgang: vorgangById.get(a.release_id) ?? null }))
            .filter(x => x.vorgang !== null),
    });
}
export async function POST(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!actor.facility)
        return NextResponse.json({ error: "Keine Einrichtung zugeordnet" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const shiftId = typeof body.shift_id === "string" ? body.shift_id : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!shiftId)
        return NextResponse.json({ error: "Schicht fehlt" }, { status: 400 });
    if (!reason)
        return NextResponse.json({ error: "Bitte einen Grund angeben" }, { status: 400 });
    const admin = createAdminClient();
    const gesperrt = await selbstGesperrt(admin, actor.userId, "abgabe");
    if (gesperrt)
        return NextResponse.json({ error: gesperrt, gesperrt: true }, { status: 403 });
    const { data: schicht } = await admin.from("shifts")
        .select("station").eq("facility_name", actor.facility).eq("id", shiftId).maybeSingle();
    const scope = await resolveSwapScope(admin, actor.facility, (schicht as {
        station?: string;
    } | null)?.station, actor.userId);
    if (!scope.staffMayInitiate) {
        return NextResponse.json({ error: scope.reason || "Schichtabgabe ist hier nicht freigegeben." }, { status: 403 });
    }
    const res = await starteAbgabe(admin, actor.facility, {
        staffId: actor.staffId, staffName: actor.fullName,
        shiftId, reason, modus: scope.mode === "automatic" ? "automatic" : "manual",
    });
    if (!res.ok)
        return NextResponse.json({ error: res.grund }, { status: res.code ?? 400 });
    return NextResponse.json({ releaseId: res.releaseId, ...res.ergebnis });
}
export async function PATCH(req: NextRequest) {
    const actor = await resolveSwapActor(req);
    if (!actor)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!actor.facility)
        return NextResponse.json({ error: "Keine Einrichtung zugeordnet" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const admin = createAdminClient();
    if (typeof body.offer_id === "string" && body.offer_id) {
        const antwort = body.antwort === "annehmen" ? "annehmen" : body.antwort === "ablehnen" ? "ablehnen" : null;
        if (!antwort)
            return NextResponse.json({ error: "Antwort fehlt" }, { status: 400 });
        const res = await beantworteAngebot(admin, actor.facility, body.offer_id, actor.staffId, antwort);
        return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }
    if (typeof body.release_id === "string" && body.release_id) {
        const res = await ziehZurueck(admin, actor.facility, body.release_id, actor.staffId);
        return NextResponse.json(res, { status: res.ok ? 200 : (res.code ?? 409) });
    }
    return NextResponse.json({ error: "Weder eine Anfrage noch ein Vorgang angegeben" }, { status: 400 });
}
