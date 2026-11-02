import type { SupabaseClient } from "@supabase/supabase-js";
import { tabelleFehlt } from "@/lib/db-fehler";
import { zaehlerAnwenden, type Eingabe, type PpugSchichtArt, type Zaehlerstand } from "@/lib/schicht-belegung";
type Db = SupabaseClient<any>;
export type ZaehlAuftrag = {
    facility: string;
    station: string;
    datum: string;
    schicht: PpugSchichtArt;
    eingabe: Eingabe;
    userId: string;
    name: string;
    quelle: "station" | "leitung";
};
export type ZaehlErgebnis = {
    ok: true;
    stand: Zaehlerstand;
} | {
    ok: false;
    grund: "ungueltig" | "migration" | "konflikt" | "fehler";
    meldung?: string;
};
const SPALTEN = "patienten, hoechststand, zugaenge, abgaenge, aenderungen";
export async function zaehlen(db: Db, a: ZaehlAuftrag): Promise<ZaehlErgebnis> {
    for (let versuch = 0; versuch < 4; versuch++) {
        const { data: alt, error: lesen } = await db
            .from("schicht_belegung").select(SPALTEN)
            .eq("facility_name", a.facility).eq("station", a.station)
            .eq("datum", a.datum).eq("schicht", a.schicht)
            .maybeSingle();
        if (tabelleFehlt(lesen))
            return { ok: false, grund: "migration" };
        if (lesen)
            return { ok: false, grund: "fehler", meldung: lesen.message };
        const neu = zaehlerAnwenden(alt as Zaehlerstand | null, a.eingabe);
        if (!neu)
            return { ok: false, grund: "ungueltig" };
        const wer = { quelle: a.quelle, geaendert_von: a.userId, geaendert_von_name: a.name, geaendert_am: new Date().toISOString() };
        if (!alt) {
            const { error } = await db.from("schicht_belegung").insert({
                facility_name: a.facility, station: a.station, datum: a.datum, schicht: a.schicht,
                ...neu, ...wer, aenderungen: 1,
            });
            if (!error)
                return { ok: true, stand: neu };
            if (error.code === "23505")
                continue;
            return { ok: false, grund: "fehler", meldung: error.message };
        }
        const bisher = Number((alt as {
            aenderungen: number;
        }).aenderungen ?? 1);
        const { data: geschrieben, error } = await db.from("schicht_belegung")
            .update({ ...neu, ...wer, aenderungen: bisher + 1 })
            .eq("facility_name", a.facility).eq("station", a.station)
            .eq("datum", a.datum).eq("schicht", a.schicht)
            .eq("aenderungen", bisher)
            .select("id");
        if (error)
            return { ok: false, grund: "fehler", meldung: error.message };
        if ((geschrieben ?? []).length === 1)
            return { ok: true, stand: neu };
    }
    return { ok: false, grund: "konflikt" };
}
export async function staendeLesen(db: Db, facility: string, stationen: string[], schichten: {
    datum: string;
    schicht: PpugSchichtArt;
}[]): Promise<{
    stand: Map<string, Zaehlerstand & {
        geaendert_von_name: string | null;
        geaendert_am: string;
    }>;
    migrationFehlt: boolean;
}> {
    const stand = new Map<string, Zaehlerstand & {
        geaendert_von_name: string | null;
        geaendert_am: string;
    }>();
    if (stationen.length === 0)
        return { stand, migrationFehlt: false };
    const { data, error } = await db
        .from("schicht_belegung")
        .select("station, datum, schicht, patienten, hoechststand, zugaenge, abgaenge, geaendert_von_name, geaendert_am")
        .eq("facility_name", facility).in("station", stationen)
        .in("datum", [...new Set(schichten.map((s) => s.datum))]);
    if (tabelleFehlt(error))
        return { stand, migrationFehlt: true };
    for (const z of data ?? []) {
        stand.set(`${z.station}|${z.datum}|${z.schicht}`, z as never);
    }
    return { stand, migrationFehlt: false };
}
export function eingabeAus(body: Record<string, unknown>): Eingabe | null {
    if (typeof body.delta === "number")
        return { delta: body.delta };
    if (typeof body.anzahl === "number")
        return { anzahl: body.anzahl };
    return null;
}
