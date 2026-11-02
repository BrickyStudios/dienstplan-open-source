import { NextRequest, NextResponse } from "next/server";
import { admin as createAdmin } from "@/lib/admin-client";
import { resolveLeitung } from "@/lib/leitung-auth";
import { berlinTodayISO } from "@/lib/date";
import { entscheide, ladeVerdachtsfaelle } from "@/lib/nichterscheinen";
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const lage = await ladeVerdachtsfaelle(createAdmin(), ctx.facilityName, berlinTodayISO());
    return NextResponse.json(lage);
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const { shiftId, staffName, status, notiz } = body ?? {};
    if (typeof shiftId !== "string" || typeof staffName !== "string" || !shiftId || !staffName) {
        return NextResponse.json({ error: "Dienst und Person fehlen" }, { status: 400 });
    }
    if (status !== "bestaetigt" && status !== "war_da")
        return NextResponse.json({ error: "Unbekannte Entscheidung" }, { status: 400 });
    const r = await entscheide(createAdmin(), ctx.facilityName, {
        shiftId, staffName, status, notiz: typeof notiz === "string" ? notiz : null, von: ctx.leitungName,
    });
    if (!r.ok)
        return NextResponse.json({ error: r.fehler }, { status: r.status });
    return NextResponse.json({ ok: true });
}
