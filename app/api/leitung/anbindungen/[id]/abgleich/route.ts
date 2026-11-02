import { randomUUID } from "crypto";
import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { anbindungLaden, laufProtokollieren, type GeladeneAnbindung } from "@/lib/anbindungen/lauf";
import { fhirAbgleich, type AbgleichErgebnis } from "@/lib/anbindungen/fhir";
import { fallBeenden, fallSetzen, offeneAbschnitte } from "@/lib/anbindungen/belegung";
import { fallSchluessel } from "@/lib/anbindungen/hl7";
import type { Datenart, LaufStatus } from "@/lib/anbindungen/typen";
type Ctx = {
    params: Promise<{
        id: string;
    }>;
};
type Admin = ReturnType<typeof createAdminClient> & any;
function schluesselName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ");
}
export async function POST(req: NextRequest, { params }: Ctx) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const probelauf = body.probelauf !== false;
    const admin = createAdminClient() as Admin;
    let anbindung: GeladeneAnbindung | null;
    try {
        anbindung = await anbindungLaden(admin, id, ctx.facilityName);
    }
    catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
    }
    if (!anbindung)
        return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    if (anbindung.weg !== "fhir") {
        return NextResponse.json({
            error: anbindung.weg === "hl7"
                ? "Bei HL7 schickt das KIS von sich aus — es gibt nichts abzuholen."
                : "Dieser Weg holt keine Daten ab.",
        }, { status: 400 });
    }
    if (!anbindung.konfig.basis) {
        return NextResponse.json({ error: "Es ist keine Serveradresse hinterlegt." }, { status: 400 });
    }
    const uebernehmen: Datenart[] = anbindung.konfig.uebernehmen?.length
        ? anbindung.konfig.uebernehmen
        : ["einheiten", "belegung"];
    const begonnen = Date.now();
    let ergebnis: AbgleichErgebnis;
    try {
        ergebnis = await fhirAbgleich({
            basis: anbindung.konfig.basis,
            auth: anbindung.konfig.auth ?? "keine",
            benutzer: anbindung.zugang?.benutzer,
            geheimnis: anbindung.zugang?.geheimnis,
        }, uebernehmen);
    }
    catch (e) {
        const meldung = e instanceof Error ? e.message : "Unbekannter Fehler";
        await laufProtokollieren(admin, anbindung, {
            status: "fehler",
            saetze: 0,
            meldung,
            dauerMs: Date.now() - begonnen,
        });
        return NextResponse.json({ error: meldung }, { status: 502 });
    }
    const gefunden = {
        personal: ergebnis.personal.length,
        stationen: ergebnis.stationen.length,
        belegung: ergebnis.belegung.reduce((s, b) => s + b.anzahl, 0),
    };
    if (probelauf) {
        return NextResponse.json({
            probelauf: true,
            gefunden,
            personal: ergebnis.personal.slice(0, 25),
            stationen: ergebnis.stationen.slice(0, 50),
            belegung: ergebnis.belegung,
            hinweise: ergebnis.hinweise,
            dauerMs: Date.now() - begonnen,
        });
    }
    const hinweise = [...ergebnis.hinweise];
    let geschrieben = 0;
    if (uebernehmen.includes("einheiten") && ergebnis.stationen.length > 0) {
        geschrieben += await stationenUebernehmen(admin, ctx.facilityName, ergebnis, hinweise, anbindung);
    }
    if (uebernehmen.includes("personal") && ergebnis.personal.length > 0) {
        geschrieben += await personalUebernehmen(admin, ctx.facilityName, ergebnis, hinweise, anbindung);
    }
    if (uebernehmen.includes("belegung")) {
        geschrieben += await belegungUebernehmen(admin, ctx.facilityName, ergebnis, hinweise, anbindung);
    }
    const status: LaufStatus = hinweise.length > 0 ? "teilweise" : "ok";
    const meldung = hinweise.length > 0 ? hinweise.join(" · ") : `${geschrieben} Sätze übernommen.`;
    await laufProtokollieren(admin, anbindung, {
        status,
        saetze: geschrieben,
        meldung,
        dauerMs: Date.now() - begonnen,
    });
    return NextResponse.json({
        probelauf: false,
        gefunden,
        geschrieben,
        status,
        hinweise,
        dauerMs: Date.now() - begonnen,
    });
}
function nurvoName(fremd: string, anbindung: GeladeneAnbindung): string {
    return anbindung.konfig.einheitenZuordnung?.[fremd] ?? fremd;
}
function durchFilter(fremd: string, anbindung: GeladeneAnbindung): boolean {
    const filter = anbindung.konfig.einheitenFilter;
    if (!filter || filter.length === 0)
        return true;
    return filter.includes(fremd);
}
async function stationenUebernehmen(admin: Admin, facility: string, ergebnis: AbgleichErgebnis, hinweise: string[], anbindung: GeladeneAnbindung): Promise<number> {
    const { data: vorhanden } = await admin
        .from("stations")
        .select("name")
        .eq("facility_name", facility);
    const bekannt = new Set(((vorhanden ?? []) as {
        name: string;
    }[]).map((s) => schluesselName(s.name)));
    const neu = ergebnis.stationen
        .filter((s) => durchFilter(s.name, anbindung))
        .map((s) => nurvoName(s.name, anbindung))
        .filter((name) => name && !bekannt.has(schluesselName(name)));
    const eindeutig = [...new Set(neu.map((n) => n.trim()))];
    if (eindeutig.length === 0)
        return 0;
    const { error } = await admin.from("stations").insert(eindeutig.map((name, i) => ({ facility_name: facility, name, sort_order: 1000 + i })));
    if (error) {
        hinweise.push(`Stationen nicht übernommen: ${error.message}`);
        return 0;
    }
    return eindeutig.length;
}
async function personalUebernehmen(admin: Admin, facility: string, ergebnis: AbgleichErgebnis, hinweise: string[], anbindung: GeladeneAnbindung): Promise<number> {
    const { data: vorhanden } = await admin
        .from("facility_staff")
        .select("full_name")
        .eq("facility_name", facility);
    const bekannt = new Set(((vorhanden ?? []) as {
        full_name: string;
    }[]).map((s) => schluesselName(s.full_name)));
    const neu = ergebnis.personal.filter((p) => p.name && !bekannt.has(schluesselName(p.name)));
    if (neu.length === 0)
        return 0;
    const zeilen = neu.map((p) => ({
        id: randomUUID(),
        facility_name: facility,
        full_name: p.name.trim(),
        role: p.rolle?.slice(0, 100) || "Pflegekraft",
        job_type: "Vollzeit",
        max_hours_per_week: 40,
    }));
    const { error } = await admin.from("facility_staff").insert(zeilen);
    if (error) {
        hinweise.push(`Personal nicht übernommen: ${error.message}`);
        return 0;
    }
    await admin
        .from("user_profiles")
        .insert(zeilen.map((z, i) => ({
        id: z.id,
        full_name: z.full_name,
        role: "mitarbeiter",
        facility,
        station: neu[i].station ? nurvoName(neu[i].station!, anbindung) : "",
    })))
        .then(() => { }, () => {
        hinweise.push("Personal angelegt, aber der Spiegel in den Profilen ist unvollständig — " +
            "die Stationszuordnung bitte prüfen.");
    });
    hinweise.push(`${zeilen.length} Personen aus dem KIS übernommen. Beschäftigungsart und ` +
        "Wochenstunden stehen auf Vollzeit/40 h und sind zu prüfen — das KIS kennt sie nicht.");
    return zeilen.length;
}
async function belegungUebernehmen(admin: Admin, facility: string, ergebnis: AbgleichErgebnis, hinweise: string[], anbindung: GeladeneAnbindung): Promise<number> {
    if (!anbindung.fall_salz) {
        hinweise.push("Belegung nicht übernommen: Dieser Anbindung fehlt das Salz für die Fall-Pseudonyme. " +
            "Ohne Salz würde Nurvo eine rückrechenbare Kennung speichern.");
        return 0;
    }
    const jetzt = new Date().toISOString();
    const ctx = { facility, anbindungId: anbindung.id, quelle: "fhir" as const };
    const faelle = ergebnis.belegungsFaelle
        .filter((f) => durchFilter(f.station, anbindung))
        .map((f) => ({
        station: nurvoName(f.station, anbindung),
        fallSchluessel: fallSchluessel(`encounter:${f.quellId}`, anbindung.fall_salz!),
    }));
    const offen = await offeneAbschnitte(admin, facility, anbindung.id);
    let bewegt = 0;
    for (const f of faelle) {
        const wirkung = await fallSetzen(admin, ctx, { fallSchluessel: f.fallSchluessel, station: f.station, zeitpunkt: jetzt }, offen);
        if (wirkung !== "unveraendert")
            bewegt++;
    }
    const nochDa = new Set(faelle.map((f) => f.fallSchluessel));
    const beendet = offen.filter((o) => !nochDa.has(o.fall_schluessel));
    for (const o of beendet) {
        await fallBeenden(admin, ctx, o.fall_schluessel, jetzt, offen);
        bewegt++;
    }
    return bewegt;
}
