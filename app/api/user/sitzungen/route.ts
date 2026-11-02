import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/admin-client";
import { resolveRequestUser } from "@/lib/resolveRequestUser";
import { resolveLeitung, sameFacility } from "@/lib/leitung-auth";
export type Sitzungszeile = {
    id: string;
    erstellt: string;
    zuletzt: string;
    aal: string;
    geraet: string | null;
    ip: string | null;
    aktuell?: boolean;
};
const FEHLT = "Die Sitzungsübersicht braucht die Migration 20260918_sitzungen_und_2fa.sql — " +
    "sie läuft nicht mit dem Deploy mit und gehört von Hand in den Supabase-SQL-Editor.";
function sitzungsIdAus(req: NextRequest): string | null {
    const authz = req.headers.get("authorization") ?? "";
    let token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (!token) {
        const teile = req.cookies
            .getAll()
            .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => c.value)
            .join("");
        const roh = teile.startsWith("base64-") ? teile.slice(7) : teile;
        try {
            const json = JSON.parse(teile.startsWith("base64-") ? Buffer.from(roh, "base64").toString("utf8") : roh) as {
                access_token?: string;
            };
            token = json.access_token ?? "";
        }
        catch {
            return null;
        }
    }
    const teil = token.split(".")[1];
    if (!teil)
        return null;
    try {
        const nutz = JSON.parse(Buffer.from(teil, "base64url").toString("utf8")) as {
            session_id?: string;
        };
        return nutz.session_id ?? null;
    }
    catch {
        return null;
    }
}
export async function GET(req: NextRequest) {
    const user = await resolveRequestUser(req);
    if (!user)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    const { data, error } = await admin().rpc("nurvo_sitzungen", { ziel: user.id });
    if (error) {
        if (error.code === "42883" || /function .* does not exist/i.test(error.message)) {
            return NextResponse.json({ sessions: [], migrationNeeded: true, hinweis: FEHLT });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const aktuelleId = sitzungsIdAus(req);
    const sessions = ((data ?? []) as Sitzungszeile[]).map((z) => ({
        ...z,
        aktuell: !!aktuelleId && z.id === aktuelleId,
    }));
    return NextResponse.json({ sessions });
}
export async function DELETE(req: NextRequest) {
    const body = (await req.json().catch(() => ({}))) as {
        user_id?: string;
    };
    const ziel = body.user_id?.trim();
    if (!ziel) {
        const user = await resolveRequestUser(req);
        if (!user)
            return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
        return beenden(user.id, sitzungsIdAus(req));
    }
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const db = admin();
    const { data: person } = await db
        .from("user_profiles")
        .select("facility, full_name")
        .eq("id", ziel)
        .maybeSingle();
    if (!person || !sameFacility(person.facility, ctx.facilityName)) {
        return NextResponse.json({ error: "Person nicht gefunden" }, { status: 404 });
    }
    const antwort = await beenden(ziel, null);
    db.from("admin_access_log")
        .insert({
        admin_email: ctx.name,
        facility_name: ctx.facilityName,
        reason: `Sitzungen von ${person.full_name ?? ziel} beendet (Zugang entzogen)`,
    })
        .then(() => { });
    return antwort;
}
async function beenden(ziel: string, ausser: string | null) {
    const { data, error } = await admin().rpc("nurvo_sitzungen_beenden", { ziel, ausser });
    if (error) {
        if (error.code === "42883" || /function .* does not exist/i.test(error.message)) {
            return NextResponse.json({ error: FEHLT, migrationNeeded: true }, { status: 501 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, beendet: Number(data ?? 0) });
}
