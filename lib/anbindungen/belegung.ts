import type { SupabaseClient } from "@supabase/supabase-js";
type Admin = SupabaseClient<any>;
export type OffenerAbschnitt = {
    id: string;
    fall_schluessel: string;
    station: string;
    seit: string;
};
export async function offeneAbschnitte(admin: Admin, facility: string, anbindungId?: string): Promise<OffenerAbschnitt[]> {
    let frage = admin
        .from("anbindung_belegung")
        .select("id, fall_schluessel, station, seit")
        .eq("facility_name", facility)
        .is("bis", null);
    if (anbindungId)
        frage = frage.eq("anbindung_id", anbindungId);
    const { data } = await frage;
    return (data ?? []) as OffenerAbschnitt[];
}
export type Anwendung = {
    facility: string;
    anbindungId: string;
    quelle: "hl7" | "fhir";
};
export type Entscheidung = {
    art: "unveraendert";
} | {
    art: "neu";
} | {
    art: "verlegt";
    altenAbschnittSchliessen: string;
};
export function entscheiden(offen: OffenerAbschnitt[], fallSchluessel: string, station: string): Entscheidung {
    const laufend = offen.find((a) => a.fall_schluessel === fallSchluessel);
    if (!laufend)
        return { art: "neu" };
    if (laufend.station === station)
        return { art: "unveraendert" };
    return { art: "verlegt", altenAbschnittSchliessen: laufend.id };
}
export async function fallSetzen(admin: Admin, ctx: Anwendung, fall: {
    fallSchluessel: string;
    station: string;
    zeitpunkt: string;
    aufenthalt?: string;
}, offen?: OffenerAbschnitt[]): Promise<Entscheidung["art"]> {
    const bestand = offen ?? (await offeneAbschnitte(admin, ctx.facility, ctx.anbindungId));
    const entscheidung = entscheiden(bestand, fall.fallSchluessel, fall.station);
    if (entscheidung.art === "unveraendert")
        return "unveraendert";
    if (entscheidung.art === "verlegt") {
        await admin
            .from("anbindung_belegung")
            .update({ bis: fall.zeitpunkt, aktualisiert_am: new Date().toISOString() })
            .eq("id", entscheidung.altenAbschnittSchliessen)
            .eq("facility_name", ctx.facility);
    }
    await admin.from("anbindung_belegung").insert({
        facility_name: ctx.facility,
        station: fall.station,
        fall_schluessel: fall.fallSchluessel,
        seit: fall.zeitpunkt,
        bis: null,
        aufenthalt: fall.aufenthalt ?? null,
        quelle: ctx.quelle,
        anbindung_id: ctx.anbindungId,
    });
    return entscheidung.art;
}
export async function fallBeenden(admin: Admin, ctx: Anwendung, fallSchluessel: string, zeitpunkt: string, offen?: OffenerAbschnitt[]): Promise<boolean> {
    const bestand = offen ?? (await offeneAbschnitte(admin, ctx.facility, ctx.anbindungId));
    const laufend = bestand.find((a) => a.fall_schluessel === fallSchluessel);
    if (!laufend)
        return false;
    await admin
        .from("anbindung_belegung")
        .update({ bis: zeitpunkt, aktualisiert_am: new Date().toISOString() })
        .eq("id", laufend.id)
        .eq("facility_name", ctx.facility);
    return true;
}
export async function standJeStation(admin: Admin, facility: string): Promise<{
    station: string;
    anzahl: number;
}[]> {
    const offen = await offeneAbschnitte(admin, facility);
    const zaehler = new Map<string, number>();
    for (const a of offen)
        zaehler.set(a.station, (zaehler.get(a.station) ?? 0) + 1);
    return [...zaehler.entries()]
        .map(([station, anzahl]) => ({ station, anzahl }))
        .sort((a, b) => a.station.localeCompare(b.station, "de"));
}
export async function standAmTag(admin: Admin, facility: string, tag: string): Promise<{
    station: string;
    anzahl: number;
}[]> {
    const beginn = `${tag}T00:00:00.000Z`;
    const ende = `${tag}T23:59:59.999Z`;
    const { data } = await admin
        .from("anbindung_belegung")
        .select("station, seit, bis")
        .eq("facility_name", facility)
        .lte("seit", ende)
        .or(`bis.is.null,bis.gte.${beginn}`);
    const zaehler = new Map<string, number>();
    for (const a of (data ?? []) as {
        station: string;
    }[]) {
        zaehler.set(a.station, (zaehler.get(a.station) ?? 0) + 1);
    }
    return [...zaehler.entries()]
        .map(([station, anzahl]) => ({ station, anzahl }))
        .sort((a, b) => a.station.localeCompare(b.station, "de"));
}
