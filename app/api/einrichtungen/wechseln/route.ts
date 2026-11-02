import { NextRequest, NextResponse } from "next/server";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { viewerStatus } from "@/lib/demo-auth";
import { GEWAEHLT_COOKIE, wechsleEinrichtung } from "@/lib/einrichtungen";
export async function POST(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const status = await viewerStatus(user);
    if (status.admin || status.demo)
        return NextResponse.json({ error: "Für dieses Konto nicht verfügbar" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const ziel = typeof body?.facility === "string" ? body.facility : "";
    if (!ziel)
        return NextResponse.json({ error: "Einrichtung fehlt" }, { status: 400 });
    const admin = createAdmin();
    const ergebnis = await wechsleEinrichtung(admin, user.id, ziel);
    if (!ergebnis.ok)
        return NextResponse.json({ error: ergebnis.fehler }, { status: ergebnis.status });
    const { data: profil } = await admin
        .from("user_profiles").select("onboarding_completed_at").eq("id", user.id).maybeSingle();
    const eingerichtet = !!profil?.onboarding_completed_at;
    const res = NextResponse.json({ ok: true, ziel: eingerichtet ? "/dashboard" : "/onboarding" });
    res.cookies.set(GEWAEHLT_COOKIE, "1", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    if (!eingerichtet)
        res.cookies.delete(`nurvo_onboarding_done_${user.id}`);
    return res;
}
