export type LegalFinding = {
    schwere: "blocker" | "warnung";
    norm: string;
    text: string;
};
export const MIN_REST_HOURS_ARBZG = 11;
export const MAX_HOURS_PER_SHIFT_ARBZG = 10;
export const MIN_VACATION_DAYS_BURLG = 20;
export const BREAK_AFTER_HOURS_ARBZG = 6;
export const MIN_REST_HOURS_VERKUERZT_ARBZG = 10;
export const RUHEZEIT_AUSGLEICH_HOURS_ARBZG = 12;
export const DAILY_AVERAGE_HOURS_ARBZG = 8;
export const MAX_WEEKLY_HOURS_ARBZG = 48;
const MINIJOB_GRENZE: Record<number, number> = {
    2024: 538,
    2025: 556,
    2026: 603,
    2027: 633,
};
const MINIJOB_JAHRE = Object.keys(MINIJOB_GRENZE).map(Number).sort((a, b) => a - b);
export function minijobGrenze(jahr: number = new Date().getFullYear()): number {
    if (MINIJOB_GRENZE[jahr])
        return MINIJOB_GRENZE[jahr];
    const juengstes = MINIJOB_JAHRE[MINIJOB_JAHRE.length - 1];
    return MINIJOB_GRENZE[jahr > juengstes ? juengstes : MINIJOB_JAHRE[0]];
}
export type FacilityLimits = {
    defaultMinRestHours?: number | null;
    defaultMaxHoursPerShift?: number | null;
    defaultVacationDays?: number | null;
    defaultBreakMin?: number | null;
    defaultBreakAfterMinutes?: number | null;
    flextimeEnabled?: boolean | null;
    flextimeCodeterminationAck?: boolean | null;
};
const num = (v: unknown): number | null => {
    if (v == null || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
export function checkLegalLimits(limits: FacilityLimits): LegalFinding[] {
    const findings: LegalFinding[] = [];
    const rest = num(limits.defaultMinRestHours);
    if (rest != null && rest > 0 && rest < MIN_REST_HOURS_ARBZG) {
        findings.push({
            schwere: "blocker",
            norm: "§ 5 Abs. 1 ArbZG",
            text: `Ruhezeit von ${fmt(rest)} Stunden eingestellt. Das Gesetz verlangt nach Arbeitsende mindestens ${MIN_REST_HOURS_ARBZG} Stunden ununterbrochene Ruhezeit. In Krankenhäusern und Pflegeeinrichtungen darf sie nach § 5 Abs. 2 ArbZG auf 10 Stunden verkürzt werden, wenn jede Verkürzung innerhalb eines Kalendermonats oder vier Wochen durch Verlängerung einer anderen Ruhezeit auf mindestens 12 Stunden ausgeglichen wird.`,
        });
    }
    const shift = num(limits.defaultMaxHoursPerShift);
    if (shift != null && shift > MAX_HOURS_PER_SHIFT_ARBZG) {
        findings.push({
            schwere: "blocker",
            norm: "§ 3 ArbZG",
            text: `Schichtlänge von bis zu ${fmt(shift)} Stunden eingestellt. Die werktägliche Arbeitszeit darf 8 Stunden nicht überschreiten und nur dann auf höchstens ${MAX_HOURS_PER_SHIFT_ARBZG} Stunden verlängert werden, wenn im Schnitt von sechs Kalendermonaten oder 24 Wochen 8 Stunden werktäglich nicht überschritten werden.`,
        });
    }
    const vacation = num(limits.defaultVacationDays);
    if (vacation != null && vacation < MIN_VACATION_DAYS_BURLG) {
        findings.push({
            schwere: "blocker",
            norm: "§ 3 Abs. 1 BUrlG",
            text: `Jahresurlaub von ${fmt(vacation)} Tagen eingestellt. Der gesetzliche Mindesturlaub beträgt 24 Werktage — bei der üblichen Fünf-Tage-Woche entspricht das ${MIN_VACATION_DAYS_BURLG} Arbeitstagen. Weniger darf auch einzelvertraglich nicht vereinbart werden.`,
        });
    }
    const breakMin = num(limits.defaultBreakMin);
    const breakAfter = num(limits.defaultBreakAfterMinutes);
    if (breakMin != null && breakMin > 0 && breakMin < 30
        && (breakAfter == null || breakAfter >= BREAK_AFTER_HOURS_ARBZG * 60)) {
        findings.push({
            schwere: "blocker",
            norm: "§ 4 ArbZG",
            text: `Pause von ${fmt(breakMin)} Minuten eingestellt. Bei einer Arbeitszeit von mehr als 6 bis zu 9 Stunden sind mindestens 30 Minuten vorgeschrieben, bei mehr als 9 Stunden mindestens 45 Minuten. Die Pause darf in Abschnitte von je mindestens 15 Minuten aufgeteilt werden.`,
        });
    }
    if (limits.flextimeEnabled === true && limits.flextimeCodeterminationAck !== true) {
        findings.push({
            schwere: "warnung",
            norm: "§ 87 Abs. 1 Nr. 2 BetrVG",
            text: "Gleitzeit ist aktiviert. Beginn und Ende der täglichen Arbeitszeit einschließlich der Verteilung auf die einzelnen Wochentage sind mitbestimmungspflichtig: Gibt es einen Betriebs- oder Personalrat, braucht die Regelung eine Betriebs- bzw. Dienstvereinbarung. Bitte bestätigen, dass das geklärt ist.",
        });
    }
    return findings;
}
function fmt(n: number): string {
    return n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}
