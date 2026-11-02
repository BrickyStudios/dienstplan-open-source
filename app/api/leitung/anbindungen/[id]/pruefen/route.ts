import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { anbindungLaden, letzteLaeufe } from "@/lib/anbindungen/lauf";
import { fhirPruefen } from "@/lib/anbindungen/fhir";
import { siteUrl } from "@/lib/site-url";
type Ctx = {
    params: Promise<{
        id: string;
    }>;
};
export async function POST(req: NextRequest, { params }: Ctx) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await params;
    const admin = createAdminClient();
    let anbindung;
    try {
        anbindung = await anbindungLaden(admin, id, ctx.facilityName);
    }
    catch (e) {
        return NextResponse.json({ ok: false, meldung: e instanceof Error ? e.message : "Fehler" });
    }
    if (!anbindung)
        return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const laeufe = await letzteLaeufe(admin, id, ctx.facilityName, 5);
    switch (anbindung.weg) {
        case "fhir": {
            if (!anbindung.konfig.basis) {
                return NextResponse.json({ ok: false, meldung: "Es ist keine Serveradresse hinterlegt.", laeufe });
            }
            const ergebnis = await fhirPruefen({
                basis: anbindung.konfig.basis,
                auth: anbindung.konfig.auth ?? "keine",
                benutzer: anbindung.zugang?.benutzer,
                geheimnis: anbindung.zugang?.geheimnis,
            });
            return NextResponse.json({ ...ergebnis, laeufe });
        }
        case "hl7": {
            const { count } = await admin
                .from("anbindung_belegung")
                .select("*", { count: "exact", head: true })
                .eq("facility_name", ctx.facilityName)
                .eq("anbindung_id", id);
            const angekommen = (count ?? 0) > 0;
            return NextResponse.json({
                ok: angekommen,
                meldung: angekommen
                    ? `Es sind Nachrichten angekommen — ${count} Fälle stehen in der Belegung.`
                    : "Noch keine Nachricht angekommen. Nurvo wartet; senden muss Ihr KIS. Die " +
                        "Adresse und der Schlüssel dafür stehen oben.",
                ziel: `${siteUrl()}/api/anbindungen/hl7`,
                laeufe,
            });
        }
        case "ics":
            return NextResponse.json({
                ok: true,
                meldung: "Das Kalenderabo läuft ohne Gegenstelle. Prüfen lässt es sich nur, indem man " +
                    "die Adresse im Kalenderprogramm einträgt.",
                laeufe,
            });
        case "vermittler":
            return NextResponse.json({
                ok: true,
                meldung: "Anfragen gehen per E-Mail an den hinterlegten Dienst. Ob die Adresse stimmt, " +
                    "zeigt erst die erste Anfrage — ein Testversand würde beim Dienstleister als " +
                    "echte Personalanfrage ankommen und wird deshalb nicht angeboten.",
                laeufe,
            });
        default:
            return NextResponse.json({
                ok: true,
                meldung: "Für diesen Weg gibt es nichts zu prüfen — er läuft über eine Datei.",
                laeufe,
            });
    }
}
