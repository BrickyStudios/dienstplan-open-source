import { NextRequest, NextResponse } from "next/server";
import { resolveStationStaff, stationAdmin, leaderStations, type StationStaffCtx } from "@/lib/mein-station-auth";
import { resolveCapabilities } from "@/lib/plan";
import { aktuelleSchicht, vorherigeSchicht, eingeteilteSchichten, type SchichtSchluessel } from "@/lib/schicht-belegung";
import { eingabeAus, staendeLesen, zaehlen } from "@/lib/schicht-belegung-schreiben";
async function istKlinik(db: ReturnType<typeof stationAdmin>, facility: string): Promise<boolean> {
    const { data } = await db.from("facility_settings").select("plan").eq("facility_name", facility).maybeSingle();
    return resolveCapabilities(data?.plan ?? null).compliance.framework === "ppbv";
}
async function darfZaehlen(db: ReturnType<typeof stationAdmin>, ctx: StationStaffCtx, schichten: SchichtSchluessel[]): Promise<(station: string, s: SchichtSchluessel) => boolean> {
    const geleitet = new Set(await leaderStations(ctx));
    const daten = [...new Set(schichten.map((s) => s.datum))];
    const { data: plan } = await db.from("shifts").select("id, date, station, shift_type")
        .eq("facility_name", ctx.facility).in("station", ctx.stations).in("date", daten);
    const ids = (plan ?? []).map((p) => p.id as string);
    const { data: zuordnungen } = ids.length
        ? await db.from("shift_assignments").select("shift_id, staff_name")
            .eq("facility_name", ctx.facility).in("shift_id", ids)
        : { data: [] };
    const meine = eingeteilteSchichten((plan ?? []) as {
        id: string;
        date: string;
        station: string;
        shift_type: string;
    }[], (zuordnungen ?? []) as {
        shift_id: string;
        staff_name: string;
    }[], ctx.demoStaffName || ctx.name);
    return (station, s) => geleitet.has(station) || meine.has(`${station}|${s.datum}|${s.schicht}`);
}
export async function GET(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const db = stationAdmin();
    if (!(await istKlinik(db, ctx.facility)))
        return NextResponse.json({ aktiv: false });
    const aktuell = aktuelleSchicht();
    const vorher = vorherigeSchicht(aktuell);
    const { stand, migrationFehlt } = await staendeLesen(db, ctx.facility, ctx.stations, [aktuell, vorher]);
    const darf = await darfZaehlen(db, ctx, [aktuell, vorher]);
    return NextResponse.json({
        aktiv: true,
        migrationFehlt,
        aktuell,
        vorher,
        stationen: ctx.stations
            .map((s) => ({
            station: s,
            darfAktuell: darf(s, aktuell),
            darfVorher: darf(s, vorher),
            aktuell: stand.get(`${s}|${aktuell.datum}|${aktuell.schicht}`) ?? null,
            vorher: stand.get(`${s}|${vorher.datum}|${vorher.schicht}`) ?? null,
        }))
            .filter((s) => s.darfAktuell || s.darfVorher),
    });
}
export async function POST(req: NextRequest) {
    const ctx = await resolveStationStaff(req);
    if (!ctx)
        return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const station = typeof body.station === "string" ? body.station : "";
    if (!ctx.stations.includes(station)) {
        return NextResponse.json({ error: "Zählen geht nur für die eigene Station." }, { status: 403 });
    }
    const eingabe = eingabeAus(body);
    if (!eingabe)
        return NextResponse.json({ error: "Bitte eine Zahl angeben." }, { status: 400 });
    const db = stationAdmin();
    if (!(await istKlinik(db, ctx.facility))) {
        return NextResponse.json({ error: "Die Belegungszählung gibt es nur im Krankenhaus." }, { status: 400 });
    }
    const aktuell = aktuelleSchicht();
    const ziel = body.schicht === "vorher" ? vorherigeSchicht(aktuell) : aktuell;
    if (!(await darfZaehlen(db, ctx, [ziel]))(station, ziel)) {
        return NextResponse.json({ error: "Zählen geht nur in einer Schicht, in der du eingeteilt bist." }, { status: 403 });
    }
    const erg = await zaehlen(db, {
        facility: ctx.facility,
        station,
        datum: ziel.datum,
        schicht: ziel.schicht,
        eingabe,
        userId: ctx.userId,
        name: ctx.name,
        quelle: "station",
    });
    if (erg.ok)
        return NextResponse.json({ ok: true, schicht: ziel, stand: erg.stand });
    if (erg.grund === "migration")
        return NextResponse.json({ error: "Die Belegungszählung ist noch nicht eingerichtet (Migration 20261006_schicht_belegung)." }, { status: 503 });
    if (erg.grund === "ungueltig")
        return NextResponse.json({ error: "Die Zahl muss zwischen 0 und 500 liegen." }, { status: 400 });
    if (erg.grund === "konflikt")
        return NextResponse.json({ error: "Gerade haben mehrere gleichzeitig gezählt — bitte noch einmal tippen." }, { status: 409 });
    return NextResponse.json({ error: "Speichern fehlgeschlagen." }, { status: 500 });
}
