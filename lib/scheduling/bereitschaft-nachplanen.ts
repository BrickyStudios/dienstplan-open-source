import { aufStationEinsetzbar, type RawAbsence } from "@/lib/scheduling/generate-plan-core";
import { bereitschaftZurDienstplanung, type Dienstplanung } from "@/lib/scheduling/dienstplanung";
export type NachplanPerson = {
    id: string;
    name: string;
    noSundayWork: boolean;
    station: string | null;
    einsatzStationen: string[];
    stationsdienst?: boolean;
    dienstplanung?: Dienstplanung;
};
export type NachplanEingabe = {
    tage: string[];
    personen: NachplanPerson[];
    stationen: Set<string>;
    nichtPflege?: ReadonlySet<string>;
    dienstTage: Map<string, Set<string>>;
    abwesenheiten: RawAbsence[];
    verfuegbarkeit: Array<{
        staff_id: string;
        day_of_week: number;
        available: boolean;
    }>;
    wuensche: Array<{
        user_id?: string | null;
        full_name?: string | null;
        wish_type?: string | null;
        status?: string | null;
        date_from?: string | null;
        date_to?: string | null;
    }>;
    schonBelegt: Set<string>;
    bisher: Record<string, number>;
};
export type NachplanErgebnis = {
    bereitschaften: Array<{
        date: string;
        staff_id: string;
        staff_name: string;
    }>;
    ohneKandidat: string[];
};
function wochentag(iso: string): number {
    const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return d === 0 ? 7 : d;
}
export function planeBereitschaftNach(e: NachplanEingabe): NachplanErgebnis {
    const zaehlung: Record<string, number> = { ...e.bisher };
    const dienste: Record<string, number> = {};
    for (const [id, tage] of e.dienstTage)
        dienste[id] = tage.size;
    const verf = new Map<string, boolean>();
    for (const v of e.verfuegbarkeit)
        verf.set(`${v.staff_id}|${v.day_of_week}`, v.available);
    const abwesend = (id: string, tag: string) => e.abwesenheiten.some(a => a.staff_id === id && a.from <= tag && tag <= a.to);
    const kannNicht = (p: NachplanPerson, tag: string) => e.wuensche.some(w => w.wish_type === "unavailable" && w.status !== "abgelehnt" &&
        (w.user_id === p.id || w.full_name === p.name) &&
        !!w.date_from && w.date_from <= tag && tag <= (w.date_to || w.date_from));
    const bereitschaften: NachplanErgebnis["bereitschaften"] = [];
    const ohneKandidat: string[] = [];
    for (const tag of [...e.tage].sort()) {
        if (e.schonBelegt.has(tag))
            continue;
        const wt = wochentag(tag);
        const geeignet = e.personen.filter(p => aufStationEinsetzbar(p, e.stationen, e.nichtPflege) &&
            !e.dienstTage.get(p.id)?.has(tag) &&
            !abwesend(p.id, tag) &&
            !(p.noSundayWork && wt === 7) &&
            bereitschaftZurDienstplanung(p.dienstplanung ?? "schicht") &&
            verf.get(`${p.id}|${wt}`) !== false &&
            !kannNicht(p, tag));
        if (geeignet.length === 0) {
            ohneKandidat.push(tag);
            continue;
        }
        geeignet.sort((a, b) => (zaehlung[a.id] ?? 0) - (zaehlung[b.id] ?? 0) ||
            (dienste[a.id] ?? 0) - (dienste[b.id] ?? 0) ||
            a.name.localeCompare(b.name, "de"));
        const wahl = geeignet[0];
        bereitschaften.push({ date: tag, staff_id: wahl.id, staff_name: wahl.name });
        zaehlung[wahl.id] = (zaehlung[wahl.id] ?? 0) + 1;
    }
    return { bereitschaften, ohneKandidat };
}
