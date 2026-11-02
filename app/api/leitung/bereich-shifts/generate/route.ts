import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { erzeugeBereichsplan } from "@/lib/scheduling/bereich-plan";
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    let von = typeof body.von === "string" ? body.von : "";
    let bis = typeof body.bis === "string" ? body.bis : "";
    if (!von || !bis) {
        const jahr = Number(body.jahr);
        const monat = Number(body.monat);
        if (!Number.isInteger(jahr) || !Number.isInteger(monat) || monat < 1 || monat > 12) {
            return NextResponse.json({ error: "von/bis oder jahr/monat erforderlich" }, { status: 400 });
        }
        const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
        von = `${jahr}-${String(monat).padStart(2, "0")}-01`;
        bis = `${jahr}-${String(monat).padStart(2, "0")}-${String(letzter).padStart(2, "0")}`;
    }
    if (!DATUM.test(von) || !DATUM.test(bis)) {
        return NextResponse.json({ error: "Datum im Format JJJJ-MM-TT angeben" }, { status: 400 });
    }
    if (bis < von)
        return NextResponse.json({ error: "Das Ende liegt vor dem Anfang" }, { status: 400 });
    if (Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`) > 366 * 86400000) {
        return NextResponse.json({ error: "Höchstens ein Jahr am Stück" }, { status: 400 });
    }
    const ergebnis = await erzeugeBereichsplan(admin(), { facilityName: ctx.facilityName, von, bis });
    return NextResponse.json({ ...ergebnis, von, bis });
}
