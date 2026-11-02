import { admin } from "@/lib/admin-client";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
import { generateRecoveryPhrase, hashPhrase } from "@/lib/recovery-phrase";
import { createNotification } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";
import { spalteFehlt } from "@/lib/db-fehler";
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id)
        return NextResponse.json({ error: "user_id erforderlich" }, { status: 400 });
    const db = admin();
    const { data: target } = await db
        .from("user_profiles")
        .select("id, full_name, facility")
        .eq("id", user_id)
        .maybeSingle();
    if (!target || !sameFacility(target.facility, ctx.facilityName)) {
        return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
    }
    const phrase = generateRecoveryPhrase();
    const { error } = await db
        .from("user_profiles")
        .update({
        recovery_phrase_hash: hashPhrase(phrase),
        recovery_phrase_set_at: new Date().toISOString(),
        recovery_phrase_updated_by: `leitung:${ctx.name}`,
    })
        .eq("id", user_id);
    if (error) {
        if (spalteFehlt(error)) {
            return NextResponse.json({ error: "Spalte fehlt — SQL-Migration 20260701 erforderlich" }, { status: 500 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await createNotification(db, {
        userId: user_id,
        facility: ctx.facilityName,
        title: "Zugang zurückgesetzt",
        message: "Deine Leitung hat dir eine neue Wiederherstellungs-Phrase erstellt. Setze damit über die Funktion Passwort vergessen ein neues Passwort.",
    }).catch(() => { });
    return NextResponse.json({ ok: true, recovery_phrase: phrase });
}
