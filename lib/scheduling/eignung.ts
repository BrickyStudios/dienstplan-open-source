import { passtZurDienstplanung, type Dienstplanung } from "@/lib/scheduling/dienstplanung";
import { utcTagISO, zeitumstellungMinuten } from "@/lib/date";
import { MAX_HOURS_PER_SHIFT_ARBZG, MAX_WEEKLY_HOURS_ARBZG } from "@/lib/legal-limits";
export type EignungsSchicht = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    station: string;
};
export type PersonGrenzen = {
    maxConsecutiveNights: number | null;
    maxConsecutiveDays: number | null;
    maxShiftsPerWeek: number | null;
    maxHoursPerShift: number | null;
    minRestHours: number;
    noSundayWork: boolean;
    dienstplanung?: Dienstplanung;
};
export type EignungsPerson = {
    id: string;
    name: string;
    vertragsMinutenWoche: number;
    grenzen: PersonGrenzen;
    abwesendeTage: Record<string, string>;
};
export type Belegung = {
    shiftId: string;
    staffId: string;
};
export type EignungsBefund = {
    regel: "abwesend" | "doppelt" | "ruhezeit" | "tag" | "woche" | "vertrag" | "naechte_am_stueck" | "tage_am_stueck" | "schichten_woche" | "schichtlaenge" | "sonntag" | "dienstplanung";
    schwere: "blocker" | "warnung";
    norm: string;
    text: string;
};
export type Eignung = {
    stufe: "ok" | "warnung" | "blocker" | "eingeteilt";
    befunde: EignungsBefund[];
};
export const MAX_MINUTEN_TAG = MAX_HOURS_PER_SHIFT_ARBZG * 60;
export const MAX_MINUTEN_WOCHE = MAX_WEEKLY_HOURS_ARBZG * 60;
const RUECKFALL: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
const TAG_MS = 86400000;
function tagNummer(iso: string): number {
    return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / TAG_MS);
}
function isoAus(tag: number): string {
    return utcTagISO(tag * TAG_MS);
}
function minuten(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
}
export function zeitraum(s: EignungsSchicht): {
    start: number;
    ende: number;
} {
    const fb = RUECKFALL[s.shift_type] ?? RUECKFALL.frueh;
    const beginn = s.start_time || fb.start;
    const schluss = s.end_time || fb.end;
    const start = tagNummer(s.date) * 1440 + minuten(beginn);
    let ende = tagNummer(s.date) * 1440 + minuten(schluss);
    if (ende <= start)
        ende += 1440;
    ende += zeitumstellungMinuten(s.date, beginn, schluss);
    return { start, ende };
}
export function schichtMinuten(s: EignungsSchicht): number {
    const { start, ende } = zeitraum(s);
    return ende - start;
}
function wochenAnfang(iso: string): number {
    const n = tagNummer(iso);
    const wochentag = (new Date(n * TAG_MS).getUTCDay() + 6) % 7;
    return n - wochentag;
}
function istSonntag(iso: string): boolean {
    return new Date(tagNummer(iso) * TAG_MS).getUTCDay() === 0;
}
function stunden(min: number): string {
    const h = min / 60;
    return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
}
function alsTag(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}
function serie(tage: Set<number>, tag: number, richtung: -1 | 1): number {
    let n = 0;
    while (tage.has(tag + richtung * (n + 1)))
        n++;
    return n;
}
export function pruefeEignung(person: EignungsPerson, ziel: EignungsSchicht, schichten: EignungsSchicht[], belegung: Belegung[]): Eignung {
    const nachId = new Map(schichten.map(s => [s.id, s]));
    const eigene = belegung
        .filter(b => b.staffId === person.id)
        .map(b => nachId.get(b.shiftId))
        .filter((s): s is EignungsSchicht => !!s);
    if (eigene.some(s => s.id === ziel.id))
        return { stufe: "eingeteilt", befunde: [] };
    const befunde: EignungsBefund[] = [];
    const g = person.grenzen;
    const zielZeit = zeitraum(ziel);
    const zielMin = zielZeit.ende - zielZeit.start;
    const zielTag = tagNummer(ziel.date);
    const grund = person.abwesendeTage[ziel.date];
    if (grund !== undefined) {
        befunde.push({
            regel: "abwesend", schwere: "blocker", norm: "Abwesenheitsplanung",
            text: `${person.name} ist am ${alsTag(ziel.date)} abwesend${grund ? ` (${grund})` : ""}.`,
        });
    }
    const amTag = eigene.find(s => s.date === ziel.date);
    if (amTag) {
        befunde.push({
            regel: "doppelt", schwere: "blocker", norm: "Plausibilität",
            text: `${person.name} hat am ${alsTag(ziel.date)} schon einen ${LABEL[amTag.shift_type] ?? "Dienst"}${amTag.station !== ziel.station ? ` (${amTag.station})` : ""}.`,
        });
    }
    const ruheMin = Math.round(g.minRestHours * 60);
    let knappste: {
        min: number;
        s: EignungsSchicht;
    } | null = null;
    for (const s of eigene) {
        const z = zeitraum(s);
        if (z.start < zielZeit.ende && zielZeit.start < z.ende)
            continue;
        const abstand = z.ende <= zielZeit.start ? zielZeit.start - z.ende : z.start - zielZeit.ende;
        if (abstand < ruheMin && (!knappste || abstand < knappste.min))
            knappste = { min: abstand, s };
    }
    if (knappste && !amTag) {
        befunde.push({
            regel: "ruhezeit", schwere: "blocker", norm: "§ 5 ArbZG",
            text: `Nur ${stunden(knappste.min)} h Ruhe zum ${LABEL[knappste.s.shift_type] ?? "Dienst"} am ${alsTag(knappste.s.date)} — nötig sind ${stunden(ruheMin)} h.`,
        });
    }
    if (zielMin > MAX_MINUTEN_TAG) {
        befunde.push({
            regel: "tag", schwere: "blocker", norm: "§ 3 ArbZG",
            text: `Die Schicht dauert ${stunden(zielMin)} h — mehr als ${stunden(MAX_MINUTEN_TAG)} h am Tag.`,
        });
    }
    if (g.maxHoursPerShift != null && zielMin > g.maxHoursPerShift * 60) {
        befunde.push({
            regel: "schichtlaenge", schwere: "blocker", norm: "Arbeitsvertrag",
            text: `Schichten über ${stunden(g.maxHoursPerShift * 60)} h sind für ${person.name} ausgeschlossen.`,
        });
    }
    const montag = wochenAnfang(ziel.date);
    const inWoche = eigene.filter(s => { const t = tagNummer(s.date); return t >= montag && t < montag + 7; });
    const wocheMin = inWoche.reduce((sum, s) => sum + schichtMinuten(s), 0) + zielMin;
    if (wocheMin > MAX_MINUTEN_WOCHE) {
        befunde.push({
            regel: "woche", schwere: "blocker", norm: "§ 3 ArbZG",
            text: `Käme auf ${stunden(wocheMin)} h in dieser Woche — Obergrenze ${stunden(MAX_MINUTEN_WOCHE)} h.`,
        });
    }
    else if (person.vertragsMinutenWoche > 0 && wocheMin > person.vertragsMinutenWoche) {
        befunde.push({
            regel: "vertrag", schwere: "warnung", norm: "Arbeitsvertrag",
            text: `+${stunden(wocheMin - person.vertragsMinutenWoche)} h über der Vertragszeit (${stunden(wocheMin)} von ${stunden(person.vertragsMinutenWoche)} h).`,
        });
    }
    if (g.maxShiftsPerWeek != null && inWoche.length + 1 > g.maxShiftsPerWeek) {
        befunde.push({
            regel: "schichten_woche", schwere: "blocker", norm: "Arbeitsvertrag",
            text: `Höchstens ${g.maxShiftsPerWeek} Schichten je Woche — das wäre die ${inWoche.length + 1}.`,
        });
    }
    if (ziel.shift_type === "nacht" && g.maxConsecutiveNights != null) {
        const naechte = new Set(eigene.filter(s => s.shift_type === "nacht").map(s => tagNummer(s.date)));
        const lauf = serie(naechte, zielTag, -1) + 1 + serie(naechte, zielTag, 1);
        if (lauf > g.maxConsecutiveNights) {
            befunde.push({
                regel: "naechte_am_stueck", schwere: "blocker", norm: "Nachtdienst-Grenze",
                text: `Wäre die ${lauf}. Nacht am Stück — erlaubt sind ${g.maxConsecutiveNights}.`,
            });
        }
    }
    if (g.maxConsecutiveDays != null && !amTag) {
        const tage = new Set(eigene.map(s => tagNummer(s.date)));
        const lauf = serie(tage, zielTag, -1) + 1 + serie(tage, zielTag, 1);
        if (lauf > g.maxConsecutiveDays) {
            befunde.push({
                regel: "tage_am_stueck", schwere: "blocker", norm: "Arbeitszeit-Grenze",
                text: `Wäre der ${lauf}. Arbeitstag am Stück — erlaubt sind ${g.maxConsecutiveDays}.`,
            });
        }
    }
    if (g.noSundayWork && istSonntag(ziel.date)) {
        befunde.push({
            regel: "sonntag", schwere: "blocker", norm: "Arbeitsvertrag",
            text: `${person.name} arbeitet nicht sonntags.`,
        });
    }
    if (g.dienstplanung && !passtZurDienstplanung(g.dienstplanung, ziel.date, ziel.shift_type)) {
        befunde.push({
            regel: "dienstplanung", schwere: "warnung", norm: "Dienstplanung der Person",
            text: g.dienstplanung === "selbst"
                ? `${person.name} plant die eigenen Zeiten selbst (Gleitzeit).`
                : `${person.name} arbeitet im Tagdienst, Montag bis Freitag.`,
        });
    }
    befunde.sort((a, b) => (a.schwere === b.schwere ? 0 : a.schwere === "blocker" ? -1 : 1));
    const stufe = befunde.some(b => b.schwere === "blocker") ? "blocker" : befunde.length ? "warnung" : "ok";
    return { stufe, befunde };
}
const LABEL: Record<string, string> = { frueh: "Frühdienst", spaet: "Spätdienst", nacht: "Nachtdienst" };
export type WochenUebersicht = {
    minutenWoche: number;
    naechteWoche: number;
    nachtMoeglichAn: string[];
    nachtSchichtenWoche: number;
};
export function wochenUebersicht(person: EignungsPerson, wocheVon: string, stationsSchichten: EignungsSchicht[], schichten: EignungsSchicht[], belegung: Belegung[]): WochenUebersicht {
    const montag = wochenAnfang(wocheVon);
    const inWoche = (iso: string) => { const t = tagNummer(iso); return t >= montag && t < montag + 7; };
    const nachId = new Map(schichten.map(s => [s.id, s]));
    const eigene = belegung
        .filter(b => b.staffId === person.id)
        .map(b => nachId.get(b.shiftId))
        .filter((s): s is EignungsSchicht => !!s && inWoche(s.date));
    const naechte = stationsSchichten.filter(s => s.shift_type === "nacht" && inWoche(s.date));
    const moeglich = naechte
        .filter(s => pruefeEignung(person, s, schichten, belegung).stufe !== "blocker"
        && !eigene.some(e => e.id === s.id))
        .map(s => s.date);
    return {
        minutenWoche: eigene.reduce((sum, s) => sum + schichtMinuten(s), 0),
        naechteWoche: eigene.filter(s => s.shift_type === "nacht").length,
        nachtMoeglichAn: [...new Set(moeglich)].sort(),
        nachtSchichtenWoche: naechte.length,
    };
}
export function wochenTage(iso: string): string[] {
    const montag = wochenAnfang(iso);
    return Array.from({ length: 7 }, (_, i) => isoAus(montag + i));
}
export function wocheVerschieben(iso: string, wochen: number): string {
    return isoAus(wochenAnfang(iso) + wochen * 7);
}
