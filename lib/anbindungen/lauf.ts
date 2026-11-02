import type { SupabaseClient } from "@supabase/supabase-js";
import { entschluesseln } from "./geheimnis";
import type { AnbindungsKonfig, AnbindungsWeg, LaufStatus } from "./typen";
type Admin = SupabaseClient<any>;
export type GeladeneAnbindung = {
    id: string;
    facility_name: string;
    katalog_id: string;
    name: string;
    weg: AnbindungsWeg;
    aktiv: boolean;
    konfig: AnbindungsKonfig;
    fall_salz: string | null;
    zugang: {
        benutzer?: string;
        geheimnis: string;
    } | null;
};
export async function anbindungLaden(admin: Admin, id: string, facility: string): Promise<GeladeneAnbindung | null> {
    const { data } = await admin
        .from("anbindungen")
        .select("id, facility_name, katalog_id, name, weg, aktiv, konfig, geheimnis, fall_salz")
        .eq("id", id)
        .eq("facility_name", facility)
        .maybeSingle();
    if (!data)
        return null;
    const zeile = data as Record<string, unknown>;
    const roh = entschluesseln(zeile.geheimnis as string | null);
    let zugang: GeladeneAnbindung["zugang"] = null;
    if (roh) {
        try {
            zugang = JSON.parse(roh) as GeladeneAnbindung["zugang"];
        }
        catch {
            zugang = null;
        }
    }
    return {
        id: zeile.id as string,
        facility_name: zeile.facility_name as string,
        katalog_id: zeile.katalog_id as string,
        name: zeile.name as string,
        weg: zeile.weg as AnbindungsWeg,
        aktiv: zeile.aktiv as boolean,
        konfig: (zeile.konfig ?? {}) as AnbindungsKonfig,
        fall_salz: (zeile.fall_salz as string | null) ?? null,
        zugang,
    };
}
export async function laufProtokollieren(admin: Admin, anbindung: {
    id: string;
    facility_name: string;
}, ergebnis: {
    status: LaufStatus;
    saetze: number;
    meldung: string;
    dauerMs: number;
}): Promise<void> {
    const jetzt = new Date().toISOString();
    await admin
        .from("anbindung_laeufe")
        .insert({
        anbindung_id: anbindung.id,
        facility_name: anbindung.facility_name,
        gestartet_am: jetzt,
        dauer_ms: Math.round(ergebnis.dauerMs),
        status: ergebnis.status,
        saetze: ergebnis.saetze,
        meldung: ergebnis.meldung.slice(0, 2000),
    })
        .then(() => { }, () => { });
    await admin
        .from("anbindungen")
        .update({
        letzter_lauf: jetzt,
        letzter_status: ergebnis.status,
        letzte_meldung: ergebnis.meldung.slice(0, 2000),
    })
        .eq("id", anbindung.id)
        .eq("facility_name", anbindung.facility_name)
        .then(() => { }, () => { });
}
export async function letzteLaeufe(admin: Admin, anbindungId: string, facility: string, anzahl = 10) {
    const { data } = await admin
        .from("anbindung_laeufe")
        .select("gestartet_am, dauer_ms, status, saetze, meldung")
        .eq("anbindung_id", anbindungId)
        .eq("facility_name", facility)
        .order("gestartet_am", { ascending: false })
        .limit(anzahl);
    return data ?? [];
}
