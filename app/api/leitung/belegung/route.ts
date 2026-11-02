import { NextRequest, NextResponse } from "next/server";
import { resolveLeitung } from "@/lib/leitung-auth";
import { admin } from "@/lib/admin-client";
import { resolveCapabilities } from "@/lib/plan";
import { berlinTodayISO, addDaysISO, isISODate, utcTagISO } from "@/lib/date";
import { naechsteTermine, pflichtenOhneTermin } from "@/lib/meldepflichten";
import { belegungLaden } from "@/lib/schicht-belegung-laden";
import { eingabeAus, zaehlen } from "@/lib/schicht-belegung-schreiben";
import { spalteFehlt } from "@/lib/db-fehler";
import { monateDesQuartals } from "@/lib/ppug";
async function framework(db: ReturnType<typeof admin>, facility: string) {
    const { data } = await db.from("facility_settings").select("plan").eq("facility_name", facility).maybeSingle();
    return resolveCapabilities(data?.plan ?? null).compliance.framework;
}
export async function GET(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const db = admin();
    const fw = await framework(db, ctx.facilityName);
    const heute = berlinTodayISO();
    const jRoh = Number(req.nextUrl.searchParams.get("year"));
    const qRoh = Number(req.nextUrl.searchParams.get("quartal"));
    const jahr = Number.isInteger(jRoh) && jRoh >= 2000 && jRoh <= 2100 ? jRoh : Number(heute.slice(0, 4));
    const quartal = Number.isInteger(qRoh) && qRoh >= 1 && qRoh <= 4 ? qRoh : Math.floor((Number(heute.slice(5, 7)) - 1) / 3) + 1;
    const monate = monateDesQuartals(quartal);
    const von = `${jahr}-${String(monate[0]).padStart(2, "0")}-01`;
    const letzter = utcTagISO(Date.UTC(jahr, monate[2]!, 0));
    const bis = letzter < heute ? letzter : heute;
    const termine = naechsteTermine(heute, fw).map((t) => ({
        id: t.pflicht.id,
        titel: t.pflicht.titel,
        vorschrift: t.pflicht.vorschrift,
        empfaenger: t.pflicht.empfaenger,
        takt: t.pflicht.takt,
        nurvoLiefert: t.pflicht.nurvoLiefert,
        hinweis: t.pflicht.hinweis ?? null,
        datum: t.datum,
        zeitraum: t.zeitraum,
        export: t.export ?? null,
        tageBis: t.tageBis,
    }));
    const ohneTermin = pflichtenOhneTermin(fw).map((p) => ({
        id: p.id, titel: p.titel, vorschrift: p.vorschrift, empfaenger: p.empfaenger,
        takt: p.takt, nurvoLiefert: p.nurvoLiefert, hinweis: p.hinweis ?? null,
    }));
    if (fw !== "ppbv") {
        return NextResponse.json({ framework: fw, heute, termine, ohneTermin, jahr, quartal, auswertung: [], stationen: [], migrationFehlt: false, kisAngebunden: false });
    }
    const { auswertung, stationen, migrationFehlt, kisAngebunden } = von <= bis
        ? await belegungLaden(db, ctx.facilityName, von, bis)
        : { auswertung: [], stationen: [], migrationFehlt: false, kisAngebunden: false };
    return NextResponse.json({ framework: fw, heute, termine, ohneTermin, jahr, quartal, von, bis, auswertung, stationen, migrationFehlt, kisAngebunden });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const station = typeof body.station === "string" ? body.station.trim() : "";
    const datum = body.datum;
    const schicht = body.schicht === "nacht" ? "nacht" : body.schicht === "tag" ? "tag" : null;
    const eingabe = eingabeAus(body);
    const heute = berlinTodayISO();
    if (!station || !isISODate(datum) || !schicht || !eingabe) {
        return NextResponse.json({ error: "Station, Datum, Schicht und Zahl angeben." }, { status: 400 });
    }
    if (datum > heute || datum < addDaysISO(heute, -400)) {
        return NextResponse.json({ error: "Nur vergangene Schichten der letzten 400 Tage." }, { status: 400 });
    }
    const db = admin();
    if ((await framework(db, ctx.facilityName)) !== "ppbv") {
        return NextResponse.json({ error: "Die Belegungszählung gibt es nur im Krankenhaus." }, { status: 400 });
    }
    const { data: st } = await db.from("stations").select("id")
        .eq("facility_name", ctx.facilityName).eq("name", station).maybeSingle();
    if (!st)
        return NextResponse.json({ error: "Station unbekannt." }, { status: 404 });
    const erg = await zaehlen(db, {
        facility: ctx.facilityName, station, datum, schicht, eingabe,
        userId: ctx.userId, name: ctx.name, quelle: "leitung",
    });
    if (erg.ok)
        return NextResponse.json({ ok: true, stand: erg.stand });
    if (erg.grund === "migration")
        return NextResponse.json({ error: "Migration 20261006_schicht_belegung fehlt." }, { status: 503 });
    if (erg.grund === "ungueltig")
        return NextResponse.json({ error: "Die Zahl muss zwischen 0 und 500 liegen." }, { status: 400 });
    return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: erg.grund === "konflikt" ? 409 : 500 });
}
export async function PUT(req: NextRequest) {
    const ctx = await resolveLeitung(req);
    if (!ctx || !ctx.facilityName)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id)
        return NextResponse.json({ error: "ID erforderlich" }, { status: 400 });
    const zahl = (v: unknown, ganz: boolean): number | null | undefined => {
        if (v === undefined)
            return undefined;
        if (v === null || v === "")
            return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0 || n > 1000)
            return undefined;
        return ganz ? Math.round(n) : Math.round(n * 100) / 100;
    };
    const updates: Record<string, unknown> = {};
    const betten = zahl(body.betten, true);
    const tag = zahl(body.grenzeTag, false);
    const nacht = zahl(body.grenzeNacht, false);
    if (body.betten !== undefined) {
        if (betten === undefined)
            return NextResponse.json({ error: "Betten: eine Zahl über 0." }, { status: 400 });
        updates.betten = betten;
    }
    if (body.grenzeTag !== undefined) {
        if (tag === undefined)
            return NextResponse.json({ error: "Grenze Tag: eine Zahl über 0." }, { status: 400 });
        updates.ppug_grenze_tag = tag;
    }
    if (body.grenzeNacht !== undefined) {
        if (nacht === undefined)
            return NextResponse.json({ error: "Grenze Nacht: eine Zahl über 0." }, { status: 400 });
        updates.ppug_grenze_nacht = nacht;
    }
    if (body.standort !== undefined) {
        const s = typeof body.standort === "string" ? body.standort.trim().slice(0, 120) : "";
        updates.standort = s || null;
    }
    if (Object.keys(updates).length === 0)
        return NextResponse.json({ error: "Nichts zu speichern." }, { status: 400 });
    const db = admin();
    const { data, error } = await db.from("stations").update(updates)
        .eq("id", id).eq("facility_name", ctx.facilityName).select("id").maybeSingle();
    if (spalteFehlt(error))
        return NextResponse.json({ error: "Migration 20261006_schicht_belegung fehlt." }, { status: 503 });
    if (error)
        return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
    if (!data)
        return NextResponse.json({ error: "Station unbekannt." }, { status: 404 });
    return NextResponse.json({ ok: true });
}
