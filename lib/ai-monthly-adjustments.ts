import { isGermanHoliday } from "@/lib/holidays";
import { aiModel, aiProvider, aiStructured, isAiConfigured, type AiUsage } from "@/lib/ai";
import { befundeFuerModell, erstelleAnonymisierung, KUERZEL_HINWEIS, type Anonymisierung } from "@/lib/ai-anonym";
import { aiContentMeta, type AiContentMeta } from "@/lib/ai-transparency";
import { isoWeekKey } from "@/lib/scheduling/generate-plan-core";
import { matchSpecialDays, type SpecialDay } from "@/lib/scheduling/special-days";
import { shiftMinutes, validateProposal, type GuardAssignment, type GuardConstraint, type GuardFinding, type GuardShift, type GuardStaff, } from "@/lib/ai-guardrails";
import { addDaysISO } from "@/lib/date";
export type { SpecialDay } from "@/lib/scheduling/special-days";
export function kiMonatsplanungGlobalAktiv(): boolean {
    return (process.env.KI_MONTHLY_PLANNING_ENABLED ?? "").trim().toLowerCase() === "true";
}
export function kiMonatsplanungAktiv(facilitySettings: {
    ai_monthly_planning_enabled?: boolean | null;
} | null | undefined): boolean {
    return kiMonatsplanungGlobalAktiv() && Boolean(facilitySettings?.ai_monthly_planning_enabled);
}
export type ResolvedSpecialDay = {
    id: string;
    name: string;
    kind?: string | null;
    date: string;
    demandMultiplier: number;
};
const MAX_TAGE_AUFLOESUNG = 3660;
export function loeseSonderTageAuf(specialDays: SpecialDay[] | null | undefined, von: string, bis: string, bundesland?: string | null): ResolvedSpecialDay[] {
    if (!Array.isArray(specialDays) || specialDays.length === 0 || bis < von)
        return [];
    const out: ResolvedSpecialDay[] = [];
    const gesehen = new Set<string>();
    let datum = von;
    for (let i = 0; i < MAX_TAGE_AUFLOESUNG && datum <= bis; i++) {
        for (const sd of matchSpecialDays(datum, specialDays, bundesland)) {
            const key = `${sd.id}|${datum}`;
            if (gesehen.has(key))
                continue;
            gesehen.add(key);
            out.push({
                id: sd.id, name: sd.name, kind: sd.kind, date: datum,
                demandMultiplier: sd.demandMultiplier > 0 ? sd.demandMultiplier : 1,
            });
        }
        datum = addDaysISO(datum, 1);
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
export type BaselineZeile = {
    shiftId: string;
    datum: string;
    sonderTagName: string;
    station: string;
    schichtart: string;
    soll: number;
    ist: number;
    offen: number;
};
export function baselineFuerSonderTage(shifts: GuardShift[], bestehend: GuardAssignment[], sonderTage: ResolvedSpecialDay[]): BaselineZeile[] {
    const sonderTagByDate = new Map(sonderTage.map(s => [s.date, s]));
    const besetztByShift = new Map<string, number>();
    for (const a of bestehend)
        besetztByShift.set(a.shiftId, (besetztByShift.get(a.shiftId) ?? 0) + 1);
    return shifts
        .filter(s => sonderTagByDate.has(s.date))
        .map(s => {
        const sd = sonderTagByDate.get(s.date)!;
        const ist = besetztByShift.get(s.id) ?? 0;
        return {
            shiftId: s.id, datum: s.date, sonderTagName: sd.name, station: s.station, schichtart: s.shift_type,
            soll: s.sollBesetzung, ist, offen: Math.max(0, s.sollBesetzung - ist),
        };
    })
        .sort((a, b) => a.datum.localeCompare(b.datum) || a.station.localeCompare(b.station));
}
export type BurnoutEinstufung = "unauffaellig" | "erhoeht" | "kritisch";
export function burnoutEinstufungVon(score: number): BurnoutEinstufung {
    if (score >= 60)
        return "kritisch";
    if (score >= 30)
        return "erhoeht";
    return "unauffaellig";
}
export type BurnoutShiftRef = {
    date: string;
    shift_type: string;
};
function isWeekendDate(dateStr: string): boolean {
    const dow = new Date(dateStr + "T00:00:00").getDay();
    return dow === 0 || dow === 6;
}
export function berechneBurnoutScore(shiftsLetzte28Tage: BurnoutShiftRef[]): {
    score: number;
    einstufung: BurnoutEinstufung;
    naechte: number;
} {
    let naechte = 0, wochenende = 0, feiertage = 0;
    for (const s of shiftsLetzte28Tage) {
        if (s.shift_type === "nacht")
            naechte++;
        if (isWeekendDate(s.date))
            wochenende++;
        if (isGermanHoliday(s.date))
            feiertage++;
    }
    const score = naechte * 10 + wochenende * 5 + feiertage * 15;
    return { score, einstufung: burnoutEinstufungVon(score), naechte };
}
export type RealKandidat = GuardStaff & {
    burnoutScore: number;
    nachtdiensteLetzte28Tage: number;
    verfuegbarkeitHinweis?: string;
    wunschHinweis?: string;
};
export type PseudonymKandidat = {
    pseudoId: string;
    qualifikationen: string[];
    freieMinutenWoche: number;
    burnoutScore: number;
    burnoutEinstufung: BurnoutEinstufung;
    nachtdiensteLetzte28Tage: number;
    verfuegbarkeitHinweis?: string;
    wunschHinweis?: string;
};
export const MAX_KANDIDATEN_MONAT = 40;
export type Pseudonymisierung = {
    kandidaten: PseudonymKandidat[];
    mapping: Map<string, RealKandidat>;
};
export function pseudonymisiereKandidaten(staff: RealKandidat[]): Pseudonymisierung {
    const verfuegbar = staff.filter(p => !p.abwesend);
    verfuegbar.sort((a, b) => a.burnoutScore - b.burnoutScore ||
        (b.vertragsMinutenWoche - b.verplanteMinutenWoche) - (a.vertragsMinutenWoche - a.verplanteMinutenWoche));
    const mapping = new Map<string, RealKandidat>();
    const kandidaten: PseudonymKandidat[] = verfuegbar.slice(0, MAX_KANDIDATEN_MONAT).map((p, i) => {
        const pseudoId = `MA-${i + 1}`;
        mapping.set(pseudoId, p);
        return {
            pseudoId,
            qualifikationen: p.qualifikationen,
            freieMinutenWoche: Math.max(0, p.vertragsMinutenWoche - p.verplanteMinutenWoche),
            burnoutScore: p.burnoutScore,
            burnoutEinstufung: burnoutEinstufungVon(p.burnoutScore),
            nachtdiensteLetzte28Tage: p.nachtdiensteLetzte28Tage,
            ...(p.verfuegbarkeitHinweis ? { verfuegbarkeitHinweis: p.verfuegbarkeitHinweis } : {}),
            ...(p.wunschHinweis ? { wunschHinweis: p.wunschHinweis } : {}),
        };
    });
    return { kandidaten, mapping };
}
const oderNull = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
export type AdjustmentProposalItem = {
    shiftId: string;
    staffId: string;
    ersetztStaffId?: string | null;
    begruendung: string;
};
const PROPOSAL_SCHEMA = {
    type: "object",
    properties: {
        anpassungen: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    shiftId: { type: "string" },
                    staffId: { type: "string" },
                    ersetztStaffId: oderNull({ type: "string" }),
                    begruendung: { type: "string" },
                },
                required: ["shiftId", "staffId", "ersetztStaffId", "begruendung"],
                additionalProperties: false,
            },
        },
        zusammenfassung: { type: "string" },
    },
    required: ["anpassungen", "zusammenfassung"],
    additionalProperties: false,
} as const;
type ProposalResponse = {
    anpassungen: AdjustmentProposalItem[];
    zusammenfassung: string;
};
const PROPOSAL_SYSTEM = `Du bist die KI-Anpassungsschicht des Dienstplan-Systems Nurvo für deutsche Pflegeeinrichtungen und Kliniken. Ein deterministischer Algorithmus hat den Monat bereits vollständig geplant — deine einzige Aufgabe ist es, für einzelne SONDERTAGE (Karneval, Silvester, regionale Ereignisse mit erhöhtem oder abweichendem Personalbedarf) zusätzliche, punktuelle Anpassungen vorzuschlagen. Du planst NICHT den Monat, du ergänzt ihn an einzelnen Tagen.

Zwei Arten von Vorschlägen:
- Zusätzliche Person auf eine Schicht setzen: "ersetztStaffId" = null.
- Eine geplante Person durch eine andere ersetzen (z.B. weil die eine einen niedrigeren Burnout-Score hat oder an dem Tag laut Hinweis nicht verfügbar ist): "ersetztStaffId" = die pseudonyme ID der ersetzten Person.

Harte Regeln — ein Vorschlag, der dagegen verstößt, wird vom nachgelagerten Regel-Layer verworfen:
- § 5 ArbZG: zwischen zwei Schichten müssen mindestens 11 Stunden Ruhezeit liegen.
- § 3 ArbZG: höchstens 10 Stunden werktägliche und 48 Stunden wöchentliche Arbeitszeit.
- Geforderte Qualifikation der Schicht muss erfüllt sein, falls angegeben.
- Vorgaben aus der Anfrage sind bindend.

Priorisierung bei mehreren zulässigen Kandidaten:
1. niedrigerer Burnout-Score (burnoutEinstufung "unauffaellig" vor "erhoeht" vor "kritisch")
2. mehr freie Wochenminuten bis zur Vertragszeit
3. weniger Nachtdienste in den letzten 28 Tagen

Verwende ausschließlich die pseudonymen "MA-N"-Kennungen und shiftId-Werte aus den mitgelieferten Daten. Erfinde niemals Personen, Schichten oder IDs — auch keine neuen Pseudonyme.
Begründungen sind ein knapper deutscher Satz mit konkretem Grund (Burnout-Score, freie Zeit, Verfügbarkeitshinweis) — keine Floskeln.
Schlage nur Änderungen für Schichten vor, die tatsächlich unter der Soll-Besetzung liegen ("offen" > 0) oder bei denen eine ersetzte Person einen klar erkennbaren Grund hat (z.B. kritischer Burnout-Score, expliziter Verfügbarkeitshinweis).
Findest du keine sinnvolle Anpassung, liefere eine leere Liste und sage das ehrlich in der Zusammenfassung. Erfinde nie eine Änderung nur um etwas vorzuschlagen.

${KUERZEL_HINWEIS} Personen heißen in diesem Auftrag abweichend davon MA-1, MA-2 … — verwende für staffId und ersetztStaffId genau diese.`;
const MAX_KORREKTUREN = 1;
function wochenMinutenFuer(staffId: string, weekKey: string, shiftsById: Map<string, GuardShift>, alle: GuardAssignment[]): number {
    let sum = 0;
    for (const a of alle) {
        if (a.staffId !== staffId)
            continue;
        const sh = shiftsById.get(a.shiftId);
        if (!sh || isoWeekKey(sh.date) !== weekKey)
            continue;
        sum += shiftMinutes(sh);
    }
    return sum;
}
export type ResolvedAdjustment = {
    shiftId: string;
    staffId: string;
    staffName: string;
    ersetztStaffId?: string | null;
    ersetztStaffName?: string | null;
    begruendung: string;
    schicht: {
        datum: string;
        station: string;
        schichtart: string;
    } | null;
    sonderTagName?: string;
};
type Abgelehnt = {
    item: AdjustmentProposalItem;
    befunde: GuardFinding[];
};
function pruefeUndSammle(items: AdjustmentProposalItem[], ctx: {
    shifts: GuardShift[];
    shiftsById: Map<string, GuardShift>;
    staff: RealKandidat[];
    laufenderBestand: GuardAssignment[];
    vorgaben?: GuardConstraint[];
}): {
    akzeptiert: AdjustmentProposalItem[];
    abgelehnt: Abgelehnt[];
} {
    const akzeptiert: AdjustmentProposalItem[] = [];
    const abgelehnt: Abgelehnt[] = [];
    for (const item of items) {
        const sh = ctx.shiftsById.get(item.shiftId);
        const weekKey = sh ? isoWeekKey(sh.date) : "unbekannt";
        const minuten = wochenMinutenFuer(item.staffId, weekKey, ctx.shiftsById, ctx.laufenderBestand);
        const staffForCheck: GuardStaff[] = ctx.staff.map(p => (p.id === item.staffId ? { ...p, verplanteMinutenWoche: minuten } : p));
        const ergebnis = validateProposal({
            shifts: ctx.shifts,
            staff: staffForCheck,
            bestehend: ctx.laufenderBestand,
            vorschlag: [{ shiftId: item.shiftId, staffId: item.staffId }],
            vorgaben: ctx.vorgaben,
        });
        if (ergebnis.ok) {
            akzeptiert.push(item);
            ctx.laufenderBestand.push({ shiftId: item.shiftId, staffId: item.staffId });
        }
        else {
            abgelehnt.push({ item, befunde: ergebnis.befunde });
        }
    }
    return { akzeptiert, abgelehnt };
}
export type MonthlyAdjustmentRun = {
    sonderTage: ResolvedSpecialDay[];
    vorschlaege: ResolvedAdjustment[];
    verworfen: number;
    zusammenfassung: string;
    korrekturrunden: number;
    ai: AiContentMeta;
    usage: AiUsage;
    uebermittelt: {
        kandidaten: number;
        schichten: number;
    };
};
function baselineAlsText(rows: BaselineZeile[], an: Anonymisierung): string {
    if (rows.length === 0)
        return "- keine";
    return rows.map(r => `- shiftId=${an.schicht(r.shiftId)} | ${r.datum} (${an.sondertag(r.sonderTagName)}) | ${an.station(r.station)} ${r.schichtart}` +
        ` | Soll ${r.soll} (bereits mit Sondertag-Zuschlag), aktuell besetzt ${r.ist}, offen ${r.offen}`).join("\n");
}
function sonderTageAlsText(sonderTage: ResolvedSpecialDay[], an: Anonymisierung): string {
    return sonderTage.map(s => `- ${s.date}: ${an.sondertag(s.name)}${s.kind ? ` (${s.kind})` : ""} — Bedarfsfaktor ${s.demandMultiplier}×`).join("\n");
}
function kandidatenAlsText(kandidaten: PseudonymKandidat[], an: Anonymisierung): string {
    if (kandidaten.length === 0)
        return "- keine";
    return kandidaten.map(k => `- ${k.pseudoId} | Qualifikation: ${k.qualifikationen.map(q => an.quali(q)).join(", ") || "—"} | frei bis Vertragszeit: ${(k.freieMinutenWoche / 60).toFixed(1)} h` +
        ` | Burnout: ${k.burnoutScore} (${k.burnoutEinstufung}) | Nachtdienste (28 Tage): ${k.nachtdiensteLetzte28Tage}` +
        `${k.verfuegbarkeitHinweis ? ` | Verfügbarkeit: ${an.freitext(k.verfuegbarkeitHinweis)}` : ""}` +
        `${k.wunschHinweis ? ` | Wunsch: ${an.freitext(k.wunschHinweis)}` : ""}`).join("\n");
}
export async function planMonthlyAdjustments(input: {
    von: string;
    bis: string;
    shifts: GuardShift[];
    staff: RealKandidat[];
    bestehend: GuardAssignment[];
    specialDays: SpecialDay[] | null | undefined;
    bundesland?: string | null;
    vorgaben?: GuardConstraint[];
    einrichtung?: string[];
}): Promise<MonthlyAdjustmentRun | null> {
    const sonderTage = loeseSonderTageAuf(input.specialDays, input.von, input.bis, input.bundesland);
    if (sonderTage.length === 0)
        return null;
    const baseline = baselineFuerSonderTage(input.shifts, input.bestehend, sonderTage);
    if (baseline.length === 0)
        return null;
    if (!isAiConfigured())
        throw new Error("KI ist nicht konfiguriert");
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
    const zaehle = (u: AiUsage) => { usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens; };
    const { kandidaten, mapping } = pseudonymisiereKandidaten(input.staff);
    const shiftsById = new Map(input.shifts.map(s => [s.id, s]));
    const an = erstelleAnonymisierung({
        personen: input.staff,
        schichten: baseline.map(r => shiftsById.get(r.shiftId)).filter((s): s is GuardShift => !!s),
        stationen: input.shifts.map(s => s.station),
        qualifikationen: [...input.staff.flatMap(p => p.qualifikationen), ...input.shifts.map(s => s.benoetigteQualifikation ?? "")],
        sondertage: sonderTage.map(s => s.name),
        einrichtung: input.einrichtung,
    });
    const auftrag = `Zeitraum: ${input.von} bis ${input.bis}\n\n` +
        `SONDERTAGE\n${sonderTageAlsText(sonderTage, an)}\n\n` +
        `BEREITS GEPLANT (Baseline des deterministischen Algorithmus)\n${baselineAlsText(baseline, an)}\n\n` +
        `VERFÜGBARE KANDIDATEN (pseudonymisiert)\n${kandidatenAlsText(kandidaten, an)}`;
    const messages: {
        role: "user" | "assistant";
        content: string;
    }[] = [{ role: "user", content: auftrag }];
    const ersterLauf = await aiStructured<ProposalResponse>({
        system: PROPOSAL_SYSTEM, schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
        effort: "medium", maxTokens: 6000, messages, schranke: an.schranke,
    });
    zaehle(ersterLauf.usage);
    const pseudoIdByRealId = new Map<string, string>();
    for (const [pseudoId, real] of mapping)
        pseudoIdByRealId.set(real.id, pseudoId);
    const depseudonymisiere = (items: AdjustmentProposalItem[]): AdjustmentProposalItem[] => items.map(it => ({
        shiftId: an.schichtId(it.shiftId) ?? it.shiftId,
        staffId: mapping.get(it.staffId)?.id ?? it.staffId,
        ersetztStaffId: it.ersetztStaffId ? (mapping.get(it.ersetztStaffId)?.id ?? it.ersetztStaffId) : null,
        begruendung: zurueckBegruendung(it.begruendung),
    }));
    const zurueckBegruendung = (text: string) => an.zurueckText(text).replace(/\bMA-(\d+)\b/g, (k: string) => mapping.get(k)?.name ?? k);
    const alleVorgeschlagenenPaare = new Set<string>();
    const merkePaare = (items: AdjustmentProposalItem[]) => { for (const it of items)
        alleVorgeschlagenenPaare.add(`${it.shiftId}|${it.staffId}`); };
    const laufenderBestand: GuardAssignment[] = [...input.bestehend];
    const ersteVersuche = depseudonymisiere(ersterLauf.data.anpassungen);
    merkePaare(ersteVersuche);
    const ersteRunde = pruefeUndSammle(ersteVersuche, {
        shifts: input.shifts, shiftsById, staff: input.staff, laufenderBestand, vorgaben: input.vorgaben,
    });
    let akzeptiert = ersteRunde.akzeptiert;
    const abgelehnt = ersteRunde.abgelehnt;
    let korrekturrunden = 0;
    let zusammenfassung = ersterLauf.data.zusammenfassung;
    if (abgelehnt.length > 0 && korrekturrunden < MAX_KORREKTUREN) {
        korrekturrunden++;
        const befundText = abgelehnt.map(({ item, befunde }) => `- ${pseudoIdByRealId.get(item.staffId) ?? "unbekannt"} auf ${an.schichtKennt(item.shiftId) ? an.schicht(item.shiftId) : "unbekannt"}:\n` +
            befundeFuerModell(befunde, an, id => pseudoIdByRealId.get(id))).join("\n");
        messages.push({ role: "assistant", content: JSON.stringify(ersterLauf.data) });
        messages.push({
            role: "user",
            content: `Diese Änderungen haben die Regelprüfung NICHT bestanden:\n\n${befundText}\n\n` +
                `Erstelle eine neue, VOLLSTÄNDIGE Liste aller Änderungen (nicht nur der korrigierten), die diese Verstöße vermeidet. ` +
                `Lässt sich eine Änderung nicht regelkonform korrigieren, lass sie einfach weg — erfinde keine Ausweichlösung.`,
        });
        const nachbesserung = await aiStructured<ProposalResponse>({
            system: PROPOSAL_SYSTEM, schema: PROPOSAL_SCHEMA as unknown as Record<string, unknown>,
            effort: "medium", maxTokens: 6000, messages, schranke: an.schranke,
        });
        zaehle(nachbesserung.usage);
        zusammenfassung = nachbesserung.data.zusammenfassung || zusammenfassung;
        const zweiteVersuche = depseudonymisiere(nachbesserung.data.anpassungen)
            .filter(orig => !akzeptiert.some(a => a.shiftId === orig.shiftId && a.staffId === orig.staffId));
        merkePaare(zweiteVersuche);
        const zweiterDurchlauf = pruefeUndSammle(zweiteVersuche, {
            shifts: input.shifts, shiftsById, staff: input.staff, laufenderBestand, vorgaben: input.vorgaben,
        });
        akzeptiert = [...akzeptiert, ...zweiterDurchlauf.akzeptiert];
    }
    const verworfen = alleVorgeschlagenenPaare.size - akzeptiert.length;
    const sonderTagByDate = new Map(sonderTage.map(s => [s.date, s]));
    const nameById = new Map(input.staff.map(p => [p.id, p.name]));
    const vorschlaege: ResolvedAdjustment[] = akzeptiert.map(it => {
        const sh = shiftsById.get(it.shiftId);
        return {
            shiftId: it.shiftId,
            staffId: it.staffId,
            staffName: nameById.get(it.staffId) ?? it.staffId,
            ersetztStaffId: it.ersetztStaffId ?? null,
            ersetztStaffName: it.ersetztStaffId ? (nameById.get(it.ersetztStaffId) ?? it.ersetztStaffId) : null,
            begruendung: it.begruendung,
            schicht: sh ? { datum: sh.date, station: sh.station, schichtart: sh.shift_type } : null,
            sonderTagName: sh ? sonderTagByDate.get(sh.date)?.name : undefined,
        };
    });
    return {
        sonderTage,
        vorschlaege,
        verworfen,
        zusammenfassung: zurueckBegruendung(zusammenfassung),
        korrekturrunden,
        ai: aiContentMeta(aiProvider(), aiModel()),
        usage,
        uebermittelt: { kandidaten: kandidaten.length, schichten: baseline.length },
    };
}
