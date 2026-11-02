import { admin } from "@/lib/admin-client";
import { generateRecoveryPhrase, hashPhrase } from "@/lib/recovery-phrase";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { NextRequest, NextResponse } from "next/server";
import { spalteFehlt } from "@/lib/db-fehler";
async function getUserId(req: NextRequest): Promise<string | null> {
    const user = await resolveRequestUser(req);
    return user?.id ?? null;
}
export async function GET(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { data, error } = await admin()
        .from("user_profiles")
        .select("recovery_phrase_hash")
        .eq("id", userId)
        .maybeSingle();
    if (error)
        return NextResponse.json({ hasPhrase: true, unavailable: true });
    return NextResponse.json({ hasPhrase: !!data?.recovery_phrase_hash });
}
export async function POST(req: NextRequest) {
    const userId = await getUserId(req);
    if (!userId)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const phrase = generateRecoveryPhrase();
    const { error } = await admin()
        .from("user_profiles")
        .update({
        recovery_phrase_hash: hashPhrase(phrase),
        recovery_phrase_set_at: new Date().toISOString(),
        recovery_phrase_updated_by: "self",
    })
        .eq("id", userId);
    if (error) {
        if (spalteFehlt(error)) {
            return NextResponse.json({ error: "Spalte fehlt — SQL-Migration 20260701 erforderlich" }, { status: 500 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, recovery_phrase: phrase });
}
