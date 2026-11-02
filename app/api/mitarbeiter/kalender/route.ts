import { NextRequest, NextResponse } from "next/server";
import { admin as createAdminClient } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { tokenHash } from "@/lib/anbindungen/geheimnis";
import { tabelleFehlt } from "@/lib/db-fehler";
import { aboAdressen, neuerKalenderToken } from "@/lib/mitarbeiter-kalender";
const NICHT_EINGERICHTET = "Das Kalenderabo ist in dieser Installation noch nicht eingerichtet (Migration 20261010_mitarbeiter_kalender).";
async function person(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return null;
    const { data: profil } = await createAdminClient()
        .from("user_profiles").select("facility").eq("id", user.id).maybeSingle();
    if (!profil?.facility)
        return null;
    return { userId: user.id, facilityName: profil.facility as string };
}
export async function GET(req: NextRequest) {
    const p = await person(req);
    if (!p)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { data, error } = await createAdminClient()
        .from("mitarbeiter_kalender").select("erstellt_am, letzter_abruf").eq("user_id", p.userId).maybeSingle();
    if (tabelleFehlt(error))
        return NextResponse.json({ eingerichtet: false, verfuegbar: false });
    return NextResponse.json({ eingerichtet: !!data, verfuegbar: true, erstelltAm: data?.erstellt_am ?? null, letzterAbruf: data?.letzter_abruf ?? null });
}
export async function POST(req: NextRequest) {
    const p = await person(req);
    if (!p)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const token = neuerKalenderToken();
    const { error } = await createAdminClient().from("mitarbeiter_kalender").upsert({ user_id: p.userId, facility_name: p.facilityName, token_hash: tokenHash(token), erstellt_am: new Date().toISOString(), letzter_abruf: null }, { onConflict: "user_id" });
    if (tabelleFehlt(error))
        return NextResponse.json({ error: NICHT_EINGERICHTET }, { status: 503 });
    if (error)
        return NextResponse.json({ error: "Das Abo konnte nicht angelegt werden." }, { status: 500 });
    return NextResponse.json({ adressen: aboAdressen(req.nextUrl.origin, token) });
}
export async function DELETE(req: NextRequest) {
    const p = await person(req);
    if (!p)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { error } = await createAdminClient().from("mitarbeiter_kalender").delete().eq("user_id", p.userId);
    if (error && !tabelleFehlt(error))
        return NextResponse.json({ error: "Das Abo konnte nicht getrennt werden." }, { status: 500 });
    return NextResponse.json({ ok: true });
}
