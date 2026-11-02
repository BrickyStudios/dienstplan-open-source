import { ARBZG_MIN_REST_MINUTES, checkRuhezeiten } from "@/lib/arbzg";
import { MAX_HOURS_PER_SHIFT_ARBZG, MAX_WEEKLY_HOURS_ARBZG } from "@/lib/legal-limits";
import { zeitumstellungMinuten } from "@/lib/date";
export const ARBZG_MAX_DAILY_MINUTES = MAX_HOURS_PER_SHIFT_ARBZG * 60;
export const ARBZG_MAX_WEEKLY_MINUTES = MAX_WEEKLY_HOURS_ARBZG * 60;
export type GuardStaff = {
    id: string;
    name: string;
    qualifikationen: string[];
    verplanteMinutenWoche: number;
    vertragsMinutenWoche: number;
    abwesend?: boolean;
    abwesenheitsgrund?: string;
    abwesendeTage?: Record<string, string>;
};
export function abwesenheitAm(p: GuardStaff, datum: string): string | null {
    if (p.abwesendeTage) {
        const grund = p.abwesendeTage[datum];
        return grund === undefined ? null : grund;
    }
    return p.abwesend ? (p.abwesenheitsgrund ?? "") : null;
}
function alsTag(iso: string): string {
    const [, m, d] = iso.split("-");
    return d && m ? `${d}.${m}.` : iso;
}
export type GuardShift = {
    id: string;
    date: string;
    shift_type: string;
    start_time?: string | null;
    end_time?: string | null;
    station: string;
    benoetigteQualifikation?: string | null;
    sollBesetzung: number;
};
export type GuardAssignment = {
    shiftId: string;
    staffId: string;
};
export type GuardConstraint = {
    art: "keine_ueberstunden";
    staffId: string;
} | {
    art: "nicht_einplanen";
    staffId: string;
} | {
    art: "nur_qualifikation";
    qualifikation: string;
};
export type GuardFinding = {
    regel: "ruhezeit" | "hoechstarbeitszeit_tag" | "hoechstarbeitszeit_woche" | "qualifikation" | "verfuegbarkeit" | "mindestbesetzung" | "vorgabe" | "unbekannte_person";
    schwere: "blocker" | "warnung";
    norm: string;
    text: string;
    staffId?: string;
    shiftId?: string;
};
export type GuardResult = {
    ok: boolean;
    blocker: GuardFinding[];
    warnungen: GuardFinding[];
    befunde: GuardFinding[];
};
const SHIFT_FALLBACK: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
export function shiftMinutes(shift: GuardShift): number {
    const fb = SHIFT_FALLBACK[shift.shift_type] ?? SHIFT_FALLBACK.frueh;
    const beginn = shift.start_time || fb.start;
    const schluss = shift.end_time || fb.end;
    const [sh, sm] = beginn.split(":").map(Number);
    const [eh, em] = schluss.split(":").map(Number);
    const start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end <= start)
        end += 24 * 60;
    return end - start + zeitumstellungMinuten(shift.date, beginn, schluss);
}
const stunden = (min: number) => (min / 60).toFixed(min % 60 === 0 ? 0 : 1).replace(".", ",");
export function validateProposal(input: {
    shifts: GuardShift[];
    staff: GuardStaff[];
    bestehend: GuardAssignment[];
    vorschlag: GuardAssignment[];
    vorgaben?: GuardConstraint[];
}): GuardResult {
    const { shifts, staff, bestehend, vorschlag, vorgaben = [] } = input;
    const shiftById = new Map(shifts.map(s => [s.id, s]));
    const staffById = new Map(staff.map(s => [s.id, s]));
    const befunde: GuardFinding[] = [];
    const add = (f: GuardFinding) => befunde.push(f);
    for (const a of vorschlag) {
        if (!staffById.has(a.staffId)) {
            add({
                regel: "unbekannte_person", schwere: "blocker", norm: "Nurvo-Stammdaten",
                text: `Die vorgeschlagene Person „${a.staffId}" existiert nicht im Mitarbeiterstamm.`,
                staffId: a.staffId, shiftId: a.shiftId,
            });
        }
        if (!shiftById.has(a.shiftId)) {
            add({
                regel: "unbekannte_person", schwere: "blocker", norm: "Nurvo-Stammdaten",
                text: `Die vorgeschlagene Schicht „${a.shiftId}" existiert nicht.`,
                staffId: a.staffId, shiftId: a.shiftId,
            });
        }
    }
    const gueltig = vorschlag.filter(a => staffById.has(a.staffId) && shiftById.has(a.shiftId));
    const alle = [...bestehend.filter(a => staffById.has(a.staffId) && shiftById.has(a.shiftId)), ...gueltig];
    for (const a of gueltig) {
        const p = staffById.get(a.staffId)!;
        const s = shiftById.get(a.shiftId)!;
        const grund = abwesenheitAm(p, s.date);
        if (grund !== null) {
            add({
                regel: "verfuegbarkeit", schwere: "blocker", norm: "Abwesenheitsplanung",
                text: `${p.name} ist am ${alsTag(s.date)} abwesend${grund ? ` (${grund})` : ""} und kann an diesem Tag nicht eingeplant werden.`,
                staffId: p.id, shiftId: a.shiftId,
            });
        }
    }
    for (const a of gueltig) {
        const p = staffById.get(a.staffId)!;
        const s = shiftById.get(a.shiftId)!;
        if (s.benoetigteQualifikation && !p.qualifikationen.includes(s.benoetigteQualifikation)) {
            add({
                regel: "qualifikation", schwere: "blocker", norm: "Fachkraftquote / Landesrecht",
                text: `${p.name} hat die für ${s.station} geforderte Qualifikation „${s.benoetigteQualifikation}" nicht.`,
                staffId: p.id, shiftId: s.id,
            });
        }
    }
    const gesehen = new Set<string>();
    for (const a of alle) {
        const key = `${a.shiftId}|${a.staffId}`;
        if (gesehen.has(key)) {
            const p = staffById.get(a.staffId)!;
            add({
                regel: "mindestbesetzung", schwere: "blocker", norm: "Plausibilität",
                text: `${p.name} ist derselben Schicht doppelt zugeteilt.`,
                staffId: a.staffId, shiftId: a.shiftId,
            });
        }
        gesehen.add(key);
    }
    const zuteilungenNachSchicht: Record<string, string[]> = {};
    for (const a of alle) {
        const p = staffById.get(a.staffId)!;
        (zuteilungenNachSchicht[a.shiftId] ??= []).push(p.name);
    }
    const neuePaare = new Set(gueltig.map(a => `${staffById.get(a.staffId)!.name}|${a.shiftId}`));
    const shiftRefs = shifts.map(s => ({ ...s, start_time: s.start_time ?? null, end_time: s.end_time ?? null }));
    for (const v of checkRuhezeiten(shiftRefs, zuteilungenNachSchicht)) {
        const durchVorschlag = neuePaare.has(`${v.staffName}|${v.prevShiftId}`) || neuePaare.has(`${v.staffName}|${v.nextShiftId}`);
        if (!durchVorschlag)
            continue;
        add({
            regel: "ruhezeit", schwere: "blocker", norm: "§ 5 ArbZG",
            text: `${v.staffName} käme nur auf ${stunden(v.restMinutes)} h Ruhezeit zwischen zwei Schichten — gesetzlich sind ${stunden(ARBZG_MIN_REST_MINUTES)} h vorgeschrieben.`,
            staffId: staff.find(s => s.name === v.staffName)?.id,
            shiftId: v.nextShiftId,
        });
    }
    const minutenProTag = new Map<string, number>();
    for (const a of alle) {
        const s = shiftById.get(a.shiftId)!;
        const tagKey = `${a.staffId}|${s.date}`;
        minutenProTag.set(tagKey, (minutenProTag.get(tagKey) ?? 0) + shiftMinutes(s));
    }
    const betroffene = new Set(gueltig.map(a => a.staffId));
    const neueTage = new Set(gueltig.map(a => `${a.staffId}|${shiftById.get(a.shiftId)!.date}`));
    for (const [tagKey, min] of minutenProTag) {
        const staffId = tagKey.slice(0, tagKey.lastIndexOf("|"));
        if (!neueTage.has(tagKey) || min <= ARBZG_MAX_DAILY_MINUTES)
            continue;
        add({
            regel: "hoechstarbeitszeit_tag", schwere: "blocker", norm: "§ 3 ArbZG",
            text: `${staffById.get(staffId)!.name} käme an einem Tag auf ${stunden(min)} h — die werktägliche Höchstarbeitszeit liegt bei ${stunden(ARBZG_MAX_DAILY_MINUTES)} h.`,
            staffId,
        });
    }
    for (const staffId of betroffene) {
        const p = staffById.get(staffId)!;
        const neu = gueltig
            .filter(a => a.staffId === staffId)
            .reduce((sum, a) => sum + shiftMinutes(shiftById.get(a.shiftId)!), 0);
        const gesamt = p.verplanteMinutenWoche + neu;
        if (gesamt > ARBZG_MAX_WEEKLY_MINUTES) {
            add({
                regel: "hoechstarbeitszeit_woche", schwere: "blocker", norm: "§ 3 ArbZG",
                text: `${p.name} käme auf ${stunden(gesamt)} h in der Woche — die Obergrenze im Ausgleichszeitraum liegt bei ${stunden(ARBZG_MAX_WEEKLY_MINUTES)} h.`,
                staffId,
            });
        }
        else if (gesamt > p.vertragsMinutenWoche) {
            const ueber = gesamt - p.vertragsMinutenWoche;
            const verboten = vorgaben.some(v => v.art === "keine_ueberstunden" && v.staffId === staffId);
            add({
                regel: verboten ? "vorgabe" : "hoechstarbeitszeit_woche",
                schwere: verboten ? "blocker" : "warnung",
                norm: verboten ? "Vorgabe aus der Anfrage" : "Arbeitsvertrag",
                text: verboten
                    ? `${p.name} war ausdrücklich ohne Überstunden angefragt, käme mit diesem Vorschlag aber auf +${stunden(ueber)} h über der Vertragszeit.`
                    : `${p.name} macht mit diesem Vorschlag +${stunden(ueber)} h Überstunden (${stunden(gesamt)} h statt ${stunden(p.vertragsMinutenWoche)} h).`,
                staffId,
            });
        }
    }
    for (const v of vorgaben) {
        if (v.art === "nicht_einplanen") {
            for (const a of gueltig.filter(a => a.staffId === v.staffId)) {
                add({
                    regel: "vorgabe", schwere: "blocker", norm: "Vorgabe aus der Anfrage",
                    text: `${staffById.get(v.staffId)?.name ?? v.staffId} sollte laut Anfrage nicht eingeplant werden.`,
                    staffId: v.staffId, shiftId: a.shiftId,
                });
            }
        }
        if (v.art === "nur_qualifikation") {
            for (const a of gueltig) {
                const p = staffById.get(a.staffId)!;
                if (!p.qualifikationen.includes(v.qualifikation)) {
                    add({
                        regel: "vorgabe", schwere: "blocker", norm: "Vorgabe aus der Anfrage",
                        text: `Laut Anfrage sollten nur Personen mit „${v.qualifikation}" eingeplant werden — ${p.name} hat diese Qualifikation nicht.`,
                        staffId: p.id, shiftId: a.shiftId,
                    });
                }
            }
        }
    }
    const betroffeneSchichten = new Set(gueltig.map(a => a.shiftId));
    for (const shiftId of betroffeneSchichten) {
        const s = shiftById.get(shiftId)!;
        const besetzt = new Set(alle.filter(a => a.shiftId === shiftId).map(a => a.staffId)).size;
        if (besetzt < s.sollBesetzung) {
            add({
                regel: "mindestbesetzung", schwere: "warnung", norm: "Soll-Besetzung der Schicht",
                text: `${s.station} bleibt mit ${besetzt} von ${s.sollBesetzung} Personen unterbesetzt.`,
                shiftId,
            });
        }
    }
    const blocker = befunde.filter(f => f.schwere === "blocker");
    const warnungen = befunde.filter(f => f.schwere === "warnung");
    return { ok: blocker.length === 0, blocker, warnungen, befunde: [...blocker, ...warnungen] };
}
export function befundeAlsText(befunde: GuardFinding[]): string {
    return befunde.map(f => `- [${f.schwere.toUpperCase()} · ${f.norm}] ${f.text}`).join("\n");
}
