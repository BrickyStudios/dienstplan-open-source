import type { SupabaseClient } from "@supabase/supabase-js";
import { spalteFehlt, tabelleFehlt } from "@/lib/db-fehler";
import { addDaysISO } from "@/lib/date";
import { belegungAuswerten, kisBestand, kisZeitpunkt, type BelegungAuswertung, type BelegungZeile, type KisAbschnitt, type PlanSchicht, type PpugSchichtArt, type StationsGrenzen, } from "@/lib/schicht-belegung";
type Db = SupabaseClient<any>;
export type StationsStamm = StationsGrenzen & {
    id: string;
    name: string;
    standort: string | null;
};
export async function stationsStamm(db: Db, facility: string): Promise<{
    stationen: StationsStamm[];
    migrationFehlt: boolean;
}> {
    const { data, error } = await db
        .from("stations")
        .select("id, name, betten, standort, ppug_grenze_tag, ppug_grenze_nacht")
        .eq("facility_name", facility)
        .eq("archived", false)
        .order("sort_order")
        .order("name");
    if (error) {
        if (!spalteFehlt(error) && !tabelleFehlt(error))
            throw error;
        const { data: nur } = await db
            .from("stations").select("id, name").eq("facility_name", facility).eq("archived", false).order("name");
        return {
            stationen: (nur ?? []).map((s) => ({ id: s.id as string, name: s.name as string, standort: null, betten: null, grenzeTag: null, grenzeNacht: null })),
            migrationFehlt: true,
        };
    }
    const zahl = (v: unknown) => (v == null || v === "" ? null : Number(v));
    return {
        stationen: (data ?? []).map((s) => ({
            id: s.id as string,
            name: s.name as string,
            standort: (s.standort as string | null) ?? null,
            betten: zahl(s.betten),
            grenzeTag: zahl(s.ppug_grenze_tag),
            grenzeNacht: zahl(s.ppug_grenze_nacht),
        })),
        migrationFehlt: false,
    };
}
export async function belegungLaden(db: Db, facility: string, von: string, bis: string): Promise<{
    auswertung: BelegungAuswertung[];
    stationen: StationsStamm[];
    migrationFehlt: boolean;
    kisAngebunden: boolean;
}> {
    const { stationen, migrationFehlt: spaltenFehlen } = await stationsStamm(db, facility);
    const grenzen = new Map(stationen.map((s) => [s.name, s] as const));
    const [planRes, zaehlRes] = await Promise.all([
        db.from("shifts").select("station, date, shift_type, actual_staff")
            .eq("facility_name", facility).gte("date", von).lte("date", bis),
        db.from("schicht_belegung").select("station, datum, schicht, patienten, hoechststand")
            .eq("facility_name", facility).gte("datum", von).lte("datum", bis),
    ]);
    const plan = (planRes.data ?? []) as PlanSchicht[];
    const tabelleDa = !tabelleFehlt(zaehlRes.error);
    const zaehlung = (tabelleDa ? zaehlRes.data ?? [] : []) as BelegungZeile[];
    const kis = new Map<string, number>();
    const bisPlus = addDaysISO(bis, 1);
    const { data: abschnitte, error: kisFehler } = await db
        .from("anbindung_belegung").select("station, seit, bis")
        .eq("facility_name", facility)
        .lt("seit", `${bisPlus}T23:59:59Z`)
        .or(`bis.is.null,bis.gte.${von}T00:00:00Z`);
    const kisListe = (kisFehler ? [] : abschnitte ?? []) as KisAbschnitt[];
    if (kisListe.length > 0) {
        const stationenMitKis = [...new Set(kisListe.map((a) => a.station))];
        for (let d = von; d <= bis; d = addDaysISO(d, 1)) {
            for (const schicht of ["tag", "nacht"] as PpugSchichtArt[]) {
                const t = kisZeitpunkt(d, schicht);
                if (t.getTime() > Date.now())
                    continue;
                for (const st of stationenMitKis)
                    kis.set(`${st}|${d}|${schicht}`, kisBestand(kisListe, st, t));
            }
        }
    }
    return {
        auswertung: belegungAuswerten(plan, zaehlung, grenzen, kis),
        stationen,
        migrationFehlt: spaltenFehlen || !tabelleDa,
        kisAngebunden: kisListe.length > 0,
    };
}
