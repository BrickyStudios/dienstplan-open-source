import { addDaysISO } from "@/lib/date";
export type PpugSchichtArt = "tag" | "nacht";
export const MAX_PATIENTEN = 500;
function berlinTeile(now: Date): {
    datum: string;
    stunde: number;
} {
    const teile = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const wert = (t: string) => teile.find((p) => p.type === t)?.value ?? "";
    return { datum: `${wert("year")}-${wert("month")}-${wert("day")}`, stunde: Number(wert("hour")) };
}
function tagVorher(iso: string): string { return addDaysISO(iso, -1); }
export type SchichtSchluessel = {
    datum: string;
    schicht: PpugSchichtArt;
};
export function aktuelleSchicht(now: Date = new Date()): SchichtSchluessel {
    const { datum, stunde } = berlinTeile(now);
    if (stunde >= 6 && stunde < 22)
        return { datum, schicht: "tag" };
    if (stunde >= 22)
        return { datum, schicht: "nacht" };
    return { datum: tagVorher(datum), schicht: "nacht" };
}
export function vorherigeSchicht(s: SchichtSchluessel): SchichtSchluessel {
    return s.schicht === "nacht" ? { datum: s.datum, schicht: "tag" } : { datum: tagVorher(s.datum), schicht: "nacht" };
}
export function gleicheSchicht(a: SchichtSchluessel, b: SchichtSchluessel): boolean {
    return a.datum === b.datum && a.schicht === b.schicht;
}
export function ppugSchichtVon(shiftType: string): PpugSchichtArt {
    return shiftType === "nacht" ? "nacht" : "tag";
}
export type Zaehlerstand = {
    patienten: number;
    hoechststand: number;
    zugaenge: number;
    abgaenge: number;
};
export const LEERER_STAND: Zaehlerstand = { patienten: 0, hoechststand: 0, zugaenge: 0, abgaenge: 0 };
export type Eingabe = {
    delta: number;
} | {
    anzahl: number;
};
export function zaehlerAnwenden(stand: Zaehlerstand | null, eingabe: Eingabe): Zaehlerstand | null {
    const alt = stand ?? LEERER_STAND;
    const begrenzen = (n: number) => Math.min(MAX_PATIENTEN, Math.max(0, n));
    if ("delta" in eingabe) {
        if (!Number.isInteger(eingabe.delta) || eingabe.delta === 0 || Math.abs(eingabe.delta) > 50)
            return null;
        const patienten = begrenzen(alt.patienten + eingabe.delta);
        const tatsaechlich = patienten - alt.patienten;
        return {
            patienten,
            hoechststand: Math.max(alt.hoechststand, patienten),
            zugaenge: alt.zugaenge + Math.max(0, tatsaechlich),
            abgaenge: alt.abgaenge + Math.max(0, -tatsaechlich),
        };
    }
    if (!Number.isInteger(eingabe.anzahl) || eingabe.anzahl < 0 || eingabe.anzahl > MAX_PATIENTEN)
        return null;
    return {
        patienten: eingabe.anzahl,
        hoechststand: Math.max(alt.hoechststand, eingabe.anzahl),
        zugaenge: alt.zugaenge,
        abgaenge: alt.abgaenge,
    };
}
export function ueberUntergrenze(patienten: number, pflegekraefte: number, grenze: number | null): boolean | null {
    if (grenze == null || !(grenze > 0))
        return null;
    if (patienten <= 0)
        return false;
    if (pflegekraefte <= 0)
        return true;
    return patienten / pflegekraefte > grenze;
}
export type BelegungZeile = {
    station: string;
    datum: string;
    schicht: PpugSchichtArt;
    patienten: number;
    hoechststand: number;
};
export type PlanSchicht = {
    station: string;
    date: string;
    shift_type: string;
    actual_staff: number | null;
};
export type StationsGrenzen = {
    betten: number | null;
    grenzeTag: number | null;
    grenzeNacht: number | null;
};
export type BelegungAuswertung = {
    station: string;
    schicht: PpugSchichtArt;
    schichtenImPlan: number;
    erfasst: number;
    ausKis: number;
    patientenDurchschnitt: number | null;
    pflegeDurchschnitt: number | null;
    grenze: number | null;
    ueberGrenze: number | null;
    betten: number | null;
};
const runden = (n: number) => Math.round(n * 10) / 10;
export function belegungAuswerten(plan: PlanSchicht[], zaehlung: BelegungZeile[], grenzen: Map<string, StationsGrenzen>, kis: Map<string, number> = new Map()): BelegungAuswertung[] {
    const pflege = new Map<string, {
        summe: number;
        anzahl: number;
    }>();
    for (const s of plan) {
        const k = `${s.station}|${s.date}|${ppugSchichtVon(s.shift_type)}`;
        const p = pflege.get(k) ?? { summe: 0, anzahl: 0 };
        p.summe += Number(s.actual_staff ?? 0);
        p.anzahl += 1;
        pflege.set(k, p);
    }
    const gezaehlt = new Map<string, BelegungZeile>();
    for (const z of zaehlung)
        gezaehlt.set(`${z.station}|${z.datum}|${z.schicht}`, z);
    type Acc = {
        schichten: number;
        erfasst: number;
        kis: number;
        patSumme: number;
        pflSumme: number;
        pflAnzahl: number;
        ueber: number;
    };
    const acc = new Map<string, Acc>();
    const schluessel = new Set<string>([...pflege.keys(), ...gezaehlt.keys()]);
    for (const k of schluessel) {
        const [station, , schicht] = k.split("|") as [
            string,
            string,
            PpugSchichtArt
        ];
        const g = grenzen.get(station);
        const grenze = schicht === "tag" ? g?.grenzeTag ?? null : g?.grenzeNacht ?? null;
        const a = acc.get(`${station}|${schicht}`) ?? { schichten: 0, erfasst: 0, kis: 0, patSumme: 0, pflSumme: 0, pflAnzahl: 0, ueber: 0 };
        const p = pflege.get(k);
        if (p)
            a.schichten += 1;
        const pflegekraefte = p && p.anzahl > 0 ? p.summe / p.anzahl : null;
        if (pflegekraefte != null) {
            a.pflSumme += pflegekraefte;
            a.pflAnzahl += 1;
        }
        const hand = gezaehlt.get(k);
        const ausKis = hand ? null : kis.get(k) ?? null;
        const stand = hand ? hand.patienten : ausKis;
        const hoechst = hand ? Math.max(hand.hoechststand, hand.patienten) : ausKis;
        if (stand != null && hoechst != null) {
            a.erfasst += 1;
            if (!hand)
                a.kis += 1;
            a.patSumme += stand;
            if (pflegekraefte != null && ueberUntergrenze(hoechst, pflegekraefte, grenze))
                a.ueber += 1;
        }
        acc.set(`${station}|${schicht}`, a);
    }
    return [...acc.entries()]
        .map(([k, a]) => {
        const [station, schicht] = k.split("|") as [
            string,
            PpugSchichtArt
        ];
        const g = grenzen.get(station);
        const grenze = schicht === "tag" ? g?.grenzeTag ?? null : g?.grenzeNacht ?? null;
        return {
            station,
            schicht,
            schichtenImPlan: a.schichten,
            erfasst: a.erfasst,
            ausKis: a.kis,
            patientenDurchschnitt: a.erfasst > 0 ? runden(a.patSumme / a.erfasst) : null,
            pflegeDurchschnitt: a.pflAnzahl > 0 ? runden(a.pflSumme / a.pflAnzahl) : null,
            grenze,
            ueberGrenze: grenze == null || !(grenze > 0) ? null : a.ueber,
            betten: g?.betten ?? null,
        };
    })
        .sort((x, y) => x.station.localeCompare(y.station, "de") || x.schicht.localeCompare(y.schicht, "de"));
}
export type KisAbschnitt = {
    station: string;
    seit: string;
    bis: string | null;
};
export function kisBestand(abschnitte: KisAbschnitt[], station: string, zeitpunkt: Date): number {
    const t = zeitpunkt.getTime();
    let n = 0;
    for (const a of abschnitte) {
        if (a.station !== station)
            continue;
        if (new Date(a.seit).getTime() > t)
            continue;
        if (a.bis && new Date(a.bis).getTime() <= t)
            continue;
        n += 1;
    }
    return n;
}
export function kisZeitpunkt(datum: string, schicht: PpugSchichtArt): Date {
    const [y, m, d] = datum.split("-").map(Number);
    const mittag = new Date(Date.UTC(y!, m! - 1, d!, 12));
    const berlinStunde = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(mittag));
    const versatz = berlinStunde - 12;
    return schicht === "tag"
        ? new Date(Date.UTC(y!, m! - 1, d!, 14 - versatz))
        : new Date(Date.UTC(y!, m! - 1, d! + 1, 2 - versatz));
}
export function eingeteilteSchichten(schichten: {
    id: string;
    date: string;
    station: string;
    shift_type: string;
}[], zuordnungen: {
    shift_id: string;
    staff_name: string;
}[], name: string): Set<string> {
    const meine = new Set(zuordnungen.filter((z) => z.staff_name === name).map((z) => z.shift_id));
    const ergebnis = new Set<string>();
    for (const s of schichten) {
        if (meine.has(s.id))
            ergebnis.add(`${s.station}|${s.date}|${ppugSchichtVon(s.shift_type)}`);
    }
    return ergebnis;
}
