import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveZeiterfassungUser, istLeitung } from "@/lib/zeiterfassung-auth";
import { evaluateShiftReports, persistShiftReports, VERSPAETUNG_TOLERANZ_MINUTEN, RUHEZEIT_SOLL_STUNDEN, } from "@/lib/shift-report";
const FENSTER_TAGE = 28;
export async function GET(req: NextRequest) {
    const ctx = await resolveZeiterfassungUser(req);
    if (!ctx)
        return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (!ctx.facility)
        return NextResponse.json({ error: "Keine Einrichtung zugeordnet" }, { status: 403 });
    const admin = createAdminClient();
    const leitung = istLeitung(ctx.role);
    let auswertung;
    try {
        auswertung = await evaluateShiftReports(admin, ctx.facility, {
            tage: FENSTER_TAGE,
            staffId: leitung ? undefined : ctx.user.id,
        });
    }
    catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Auswertung fehlgeschlagen" }, { status: 500 });
    }
    const gespeichert = await persistShiftReports(admin, ctx.facility, auswertung.reports);
    const berichte = auswertung.reports.map(r => ({
        ...r,
        name: auswertung.nameById.get(r.staffId) ?? "Unbekannt",
    }));
    const uebersicht = auswertung.punctuality.map(p => ({
        ...p,
        name: auswertung.nameById.get(p.staffId) ?? "Unbekannt",
        avgLateMinutes: p.lateCount > 0 ? Math.round(p.lateMinutesSum / p.lateCount) : 0,
    }));
    return NextResponse.json({
        role: leitung ? "leitung" : "mitarbeiter",
        eigeneStaffId: ctx.user.id,
        fensterTage: FENSTER_TAGE,
        toleranzMinuten: VERSPAETUNG_TOLERANZ_MINUTEN,
        ruhezeitSollStunden: RUHEZEIT_SOLL_STUNDEN,
        berichte,
        uebersicht,
        gespeichert,
    });
}
