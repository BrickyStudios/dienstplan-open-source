import { admin as createAdminClient } from "@/lib/admin-client";
import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { planAusZeile } from "@/lib/plan";
import { tabelleFehlt } from "@/lib/db-fehler";
import { siteUrl } from "@/lib/site-url";
import { katalogEintrag, katalogFuerPlan } from "@/lib/anbindungen/katalog";
import { salzErzeugen, schluesselVorhanden, tokenErzeugen, tokenHash, verschluesseln, SCHLUESSEL_FEHLT_TEXT, } from "@/lib/anbindungen/geheimnis";
import type { AnbindungsKonfig, AnbindungsWeg, Datenart } from "@/lib/anbindungen/typen";
const OFFENE_SPALTEN = "id, katalog_id, name, weg, aktiv, konfig, letzter_lauf, letzter_status, letzte_meldung, erstellt_am, erstellt_von";
const WEGE: AnbindungsWeg[] = ["fhir", "hl7", "ics", "vermittler", "datei"];
const DATENARTEN: Datenart[] = [
    "personal",
    "einheiten",
    "belegung",
    "abwesenheiten",
    "dienstplan",
    "anfragen",
];
type Rohzeile = Record<string, unknown>;
function mitMerkmalen(zeile: Rohzeile) {
    const { geheimnis, hl7_token_hash, kalender_token_hash, fall_salz, ...offen } = zeile;
    return {
        ...offen,
        hatZugangsdaten: Boolean(geheimnis),
        hatHl7Token: Boolean(hl7_token_hash),
        hatKalenderToken: Boolean(kalender_token_hash),
        hatSalz: Boolean(fall_salz),
    };
}
async function planDerEinrichtung(admin: ReturnType<typeof createAdminClient>, facility: string) {
    const { data } = await admin
        .from("facility_settings")
        .select("plan")
        .eq("facility_name", facility)
        .maybeSingle();
    return planAusZeile(data as {
        plan?: unknown;
    } | null);
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const admin = createAdminClient();
    const plan = await planDerEinrichtung(admin, ctx.facilityName);
    const { data, error } = await admin
        .from("anbindungen")
        .select(OFFENE_SPALTEN + ", geheimnis, hl7_token_hash, kalender_token_hash, fall_salz")
        .eq("facility_name", ctx.facilityName)
        .order("erstellt_am", { ascending: true });
    if (tabelleFehlt(error)) {
        return NextResponse.json({
            anbindungen: [],
            katalog: katalogFuerPlan(plan),
            plan,
            schluesselVorhanden: schluesselVorhanden(),
            basis: siteUrl(),
            tableMissing: true,
        });
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
        anbindungen: (data ?? []).map((z) => mitMerkmalen(z as unknown as Rohzeile)),
        katalog: katalogFuerPlan(plan),
        plan,
        schluesselVorhanden: schluesselVorhanden(),
        basis: siteUrl(),
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const katalogId = String(body.katalog_id ?? "").trim();
    const eintrag = katalogEintrag(katalogId);
    if (!eintrag)
        return NextResponse.json({ error: "Unbekanntes System" }, { status: 400 });
    const weg = String(body.weg ?? eintrag.wege[0]) as AnbindungsWeg;
    if (!eintrag.wege.includes(weg)) {
        return NextResponse.json({ error: `${eintrag.name} kennt diesen Weg nicht.` }, { status: 400 });
    }
    const konfig = konfigPruefen(body.konfig);
    const fehler = konfigVollstaendig(weg, konfig);
    if (fehler)
        return NextResponse.json({ error: fehler }, { status: 400 });
    const zeile: Record<string, unknown> = {
        facility_name: ctx.facilityName,
        katalog_id: katalogId,
        name: String(body.name ?? "").trim() || eintrag.name,
        weg,
        konfig,
        erstellt_von: ctx.createdBy,
    };
    const zugang = zugangsdatenAus(body);
    if (zugang) {
        if (!schluesselVorhanden())
            return NextResponse.json({ error: SCHLUESSEL_FEHLT_TEXT }, { status: 503 });
        zeile.geheimnis = verschluesseln(JSON.stringify(zugang));
    }
    if (weg === "hl7" || weg === "fhir")
        zeile.fall_salz = salzErzeugen();
    let token: string | null = null;
    if (weg === "hl7") {
        token = tokenErzeugen();
        zeile.hl7_token_hash = tokenHash(token);
    }
    else if (weg === "ics") {
        token = tokenErzeugen();
        zeile.kalender_token_hash = tokenHash(token);
    }
    const admin = createAdminClient();
    const { data, error } = await admin.from("anbindungen").insert(zeile).select(OFFENE_SPALTEN).single();
    if (tabelleFehlt(error)) {
        return NextResponse.json({ error: "DB-Migration erforderlich: supabase/migrations/20260920_anbindungen.sql im Supabase-SQL-Editor ausführen." }, { status: 500 });
    }
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
        anbindung: data,
        token,
        tokenHinweis: token
            ? weg === "hl7"
                ? "Diesen Schlüssel bekommt Ihre IT für die HL7-Strecke. Er wird nur jetzt angezeigt."
                : "Diese Kalenderadresse wird nur jetzt angezeigt. Danach ist sie nicht mehr abrufbar, nur ersetzbar."
            : null,
    });
}
export async function PATCH(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id)
        return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const admin = createAdminClient();
    const { data: vorhanden, error: leseFehler } = await admin
        .from("anbindungen")
        .select("id, weg, konfig")
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .maybeSingle();
    if (leseFehler)
        return NextResponse.json({ error: leseFehler.message }, { status: 500 });
    if (!vorhanden)
        return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    const aenderung: Record<string, unknown> = {};
    if (body.name !== undefined)
        aenderung.name = String(body.name).trim();
    if (body.aktiv !== undefined)
        aenderung.aktiv = Boolean(body.aktiv);
    if (body.konfig !== undefined) {
        const konfig = { ...(vorhanden.konfig as AnbindungsKonfig), ...konfigPruefen(body.konfig) };
        const fehler = konfigVollstaendig(vorhanden.weg as AnbindungsWeg, konfig);
        if (fehler)
            return NextResponse.json({ error: fehler }, { status: 400 });
        aenderung.konfig = konfig;
    }
    const zugang = zugangsdatenAus(body);
    if (zugang) {
        if (!schluesselVorhanden())
            return NextResponse.json({ error: SCHLUESSEL_FEHLT_TEXT }, { status: 503 });
        aenderung.geheimnis = verschluesseln(JSON.stringify(zugang));
    }
    let token: string | null = null;
    if (body.tokenErneuern === true) {
        token = tokenErzeugen();
        if (vorhanden.weg === "hl7")
            aenderung.hl7_token_hash = tokenHash(token);
        else if (vorhanden.weg === "ics")
            aenderung.kalender_token_hash = tokenHash(token);
        else
            token = null;
    }
    if (Object.keys(aenderung).length === 0) {
        return NextResponse.json({ error: "Nichts zu ändern" }, { status: 400 });
    }
    const { data, error } = await admin
        .from("anbindungen")
        .update(aenderung)
        .eq("id", id)
        .eq("facility_name", ctx.facilityName)
        .select(OFFENE_SPALTEN)
        .single();
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ anbindung: data, token });
}
export async function DELETE(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const { id } = await req.json().catch(() => ({}));
    if (!id)
        return NextResponse.json({ error: "id fehlt" }, { status: 400 });
    const admin = createAdminClient();
    const { error } = await admin
        .from("anbindungen")
        .delete()
        .eq("id", id)
        .eq("facility_name", ctx.facilityName);
    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
function konfigPruefen(roh: unknown): AnbindungsKonfig {
    const q = (roh ?? {}) as Record<string, unknown>;
    const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
    const konfig: AnbindungsKonfig = {};
    if (q.basis !== undefined)
        konfig.basis = text(q.basis, 500)?.replace(/\/+$/, "");
    if (q.auth !== undefined && ["keine", "basic", "token"].includes(String(q.auth))) {
        konfig.auth = q.auth as AnbindungsKonfig["auth"];
    }
    if (Array.isArray(q.einheitenFilter)) {
        konfig.einheitenFilter = q.einheitenFilter
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().slice(0, 120))
            .filter(Boolean)
            .slice(0, 200);
    }
    if (q.einheitenZuordnung && typeof q.einheitenZuordnung === "object") {
        const paare = Object.entries(q.einheitenZuordnung as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .slice(0, 200)
            .map(([k, v]) => [k.slice(0, 120), String(v).trim().slice(0, 120)]);
        konfig.einheitenZuordnung = Object.fromEntries(paare);
    }
    if (Array.isArray(q.uebernehmen)) {
        konfig.uebernehmen = q.uebernehmen.filter((d): d is Datenart => typeof d === "string" && DATENARTEN.includes(d as Datenart));
    }
    if (q.station !== undefined)
        konfig.station = text(q.station, 120);
    if (q.agenturId !== undefined)
        konfig.agenturId = text(q.agenturId, 64);
    if (q.notiz !== undefined)
        konfig.notiz = text(q.notiz, 1000);
    return konfig;
}
function konfigVollstaendig(weg: AnbindungsWeg, konfig: AnbindungsKonfig): string | null {
    if (!WEGE.includes(weg))
        return "Unbekannter Weg.";
    if (weg === "fhir" && !konfig.basis) {
        return "Für FHIR fehlt die Adresse des Servers (z. B. https://kis.haus.example/fhir).";
    }
    if (weg === "vermittler" && !konfig.agenturId) {
        return "Für einen Personaldienstleister fehlt der Eintrag unter „Externe Dienste“.";
    }
    return null;
}
function zugangsdatenAus(body: Record<string, unknown>): {
    benutzer?: string;
    geheimnis: string;
} | null {
    const geheimnis = typeof body.geheimnis === "string" ? body.geheimnis : "";
    if (!geheimnis.trim())
        return null;
    const benutzer = typeof body.benutzer === "string" ? body.benutzer.trim().slice(0, 200) : "";
    return { benutzer: benutzer || undefined, geheimnis: geheimnis.slice(0, 4000) };
}
