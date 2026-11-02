import { NextRequest, NextResponse } from "next/server";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { viewerStatus } from "@/lib/demo-auth";
import { tabelleFehlt } from "@/lib/db-fehler";
import { GEWAEHLT_COOKIE, meineEinrichtungen, nameBelegt, pruefeEinrichtungsname, wechsleEinrichtung } from "@/lib/einrichtungen";
const HOECHSTENS = 20;
export async function POST(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const status = await viewerStatus(user);
    if (status.admin || status.demo)
        return NextResponse.json({ error: "Für dieses Konto nicht verfügbar" }, { status: 403 });
    const admin = createAdmin();
    const { data: profil } = await admin
        .from("user_profiles").select("role, facility, demo_expires_at").eq("id", user.id).maybeSingle();
    if (profil?.role !== "leitung")
        return NextResponse.json({ error: "Nur Leitungen können Einrichtungen eröffnen" }, { status: 403 });
    if (profil.demo_expires_at)
        return NextResponse.json({ error: "Im Demo-Zugang nicht verfügbar" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const geprueft = pruefeEinrichtungsname(body?.name);
    if (!geprueft.ok)
        return NextResponse.json({ error: geprueft.fehler }, { status: 400 });
    const name = geprueft.name;
    const bisher = await meineEinrichtungen(admin, user.id, profil.facility ?? "");
    if (bisher === null)
        return NextResponse.json({ error: "Funktion noch nicht freigeschaltet (Migration 20261008_leitung_einrichtungen)" }, { status: 503 });
    if (bisher.length >= HOECHSTENS)
        return NextResponse.json({ error: `Höchstens ${HOECHSTENS} Einrichtungen je Konto` }, { status: 400 });
    if (await nameBelegt(admin, name)) {
        return NextResponse.json({ error: "Diesen Namen gibt es schon. Bitte einen eindeutigen wählen, z. B. mit Ort." }, { status: 409 });
    }
    const { error: insErr } = await admin.from("leitung_einrichtungen")
        .insert({ user_id: user.id, facility_name: name, onboarding_completed_at: null });
    if (insErr) {
        return NextResponse.json({ error: tabelleFehlt(insErr) ? "Funktion noch nicht freigeschaltet" : insErr.message }, { status: 500 });
    }
    const ergebnis = await wechsleEinrichtung(admin, user.id, name);
    if (!ergebnis.ok)
        return NextResponse.json({ error: ergebnis.fehler }, { status: ergebnis.status });
    const res = NextResponse.json({ ok: true, ziel: "/onboarding" });
    res.cookies.set(GEWAEHLT_COOKIE, "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    res.cookies.delete(`nurvo_onboarding_done_${user.id}`);
    return res;
}
