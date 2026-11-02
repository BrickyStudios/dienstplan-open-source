import { admin } from "@/lib/admin-client";
import { verifyPhrase } from "@/lib/recovery-phrase";
import { checkRateLimit } from "@/lib/rate-limit";
import { passwordOk, PASSWORD_HINT } from "@/lib/password";
import { passwortGeleakt, leakHinweis } from "@/lib/password-breach";
import { NextRequest, NextResponse } from "next/server";
const GENERIC = "E-Mail oder Wiederherstellungs-Phrase ist nicht korrekt.";
async function findUserIdByEmail(db: ReturnType<typeof admin>, email: string): Promise<string | null> {
    const pattern = email.replace(/[\\%_]/g, m => `\\${m}`);
    const { data: profile } = await db
        .from("user_profiles")
        .select("id")
        .ilike("email", pattern)
        .maybeSingle();
    if (profile?.id)
        return profile.id as string;
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length)
            break;
        const match = data.users.find(u => u.email?.toLowerCase() === email);
        if (match)
            return match.id;
        if (data.users.length < 200)
            break;
    }
    return null;
}
export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, "recover", {
        limit: 5,
        windowMs: 15 * 60000,
        message: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
    });
    if (limited)
        return limited;
    let body: {
        email?: string;
        phrase?: string;
        newPassword?: string;
    };
    try {
        body = await req.json();
    }
    catch {
        return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
    }
    const email = body.email?.trim().toLowerCase();
    const phrase = body.phrase ?? "";
    const newPassword = body.newPassword ?? "";
    if (!email || !phrase.trim()) {
        return NextResponse.json({ error: "E-Mail und Wiederherstellungs-Phrase sind erforderlich." }, { status: 400 });
    }
    if (!passwordOk(newPassword)) {
        return NextResponse.json({ error: `Passwort zu schwach. ${PASSWORD_HINT}` }, { status: 400 });
    }
    const leak = await passwortGeleakt(newPassword);
    if (leak.geleakt) {
        return NextResponse.json({ error: leakHinweis(leak.anzahl), breached: true }, { status: 400 });
    }
    const db = admin();
    const userId = await findUserIdByEmail(db, email);
    if (!userId)
        return NextResponse.json({ error: GENERIC }, { status: 400 });
    const { data: profile } = await db
        .from("user_profiles")
        .select("recovery_phrase_hash")
        .eq("id", userId)
        .maybeSingle();
    if (!verifyPhrase(phrase, profile?.recovery_phrase_hash)) {
        return NextResponse.json({ error: GENERIC }, { status: 400 });
    }
    const { error: updateError } = await db.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateError) {
        return NextResponse.json({ error: "Passwort konnte nicht gesetzt werden. Bitte erneut versuchen." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
}
