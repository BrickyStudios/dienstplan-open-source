import { monatsBereichISO } from "@/lib/date";
export type PpbvShift = {
    planned_staff: number | null;
    actual_staff: number | null;
    date: string;
    station: string;
    shift_type: string;
};
export type PpbvTypeAgg = {
    shift_type: string;
    shiftsCount: number;
    plannedSum: number;
    actualSum: number;
    understaffedCount: number;
    fulfilledShifts: number;
};
export type PpbvStationAgg = {
    station: string;
    shiftsCount: number;
    plannedSum: number;
    actualSum: number;
    understaffedCount: number;
    fulfilledShifts: number;
    compliancePct: number;
    shiftQuotePct: number;
    byType: PpbvTypeAgg[];
};
export type PpbvTotals = {
    shiftsCount: number;
    plannedSum: number;
    actualSum: number;
    understaffedCount: number;
    fulfilledShifts: number;
    compliancePct: number;
    shiftQuotePct: number;
};
export type PpbvReport = {
    year: number;
    month: number;
    stations: PpbvStationAgg[];
    totals: PpbvTotals;
};
export const SHIFT_TYPE_LABELS: Record<string, string> = {
    frueh: "Frühdienst",
    spaet: "Spätdienst",
    nacht: "Nachtdienst",
    all: "Ganztags",
};
export function shiftTypeLabel(t: string): string {
    return SHIFT_TYPE_LABELS[t] ?? t;
}
const TYPE_ORDER: Record<string, number> = { frueh: 0, spaet: 1, nacht: 2, all: 3 };
function pct(numer: number, denom: number): number {
    if (denom <= 0)
        return 0;
    return Math.round((numer / denom) * 100);
}
export function computePpbvReport(shifts: PpbvShift[], exempt: Set<string>, year: number, month: number): PpbvReport {
    type Acc = Omit<PpbvStationAgg, "compliancePct" | "shiftQuotePct" | "byType"> & {
        byType: Map<string, PpbvTypeAgg>;
    };
    const byStation = new Map<string, Acc>();
    for (const s of shifts) {
        if (exempt.has(s.station))
            continue;
        const planned = Number(s.planned_staff ?? 0);
        if (planned <= 0)
            continue;
        const actual = Number(s.actual_staff ?? 0);
        const fulfilled = actual >= planned;
        let acc = byStation.get(s.station);
        if (!acc) {
            acc = {
                station: s.station,
                shiftsCount: 0,
                plannedSum: 0,
                actualSum: 0,
                understaffedCount: 0,
                fulfilledShifts: 0,
                byType: new Map(),
            };
            byStation.set(s.station, acc);
        }
        acc.shiftsCount += 1;
        acc.plannedSum += planned;
        acc.actualSum += actual;
        if (fulfilled)
            acc.fulfilledShifts += 1;
        else
            acc.understaffedCount += 1;
        const key = s.shift_type || "all";
        let ta = acc.byType.get(key);
        if (!ta) {
            ta = { shift_type: key, shiftsCount: 0, plannedSum: 0, actualSum: 0, understaffedCount: 0, fulfilledShifts: 0 };
            acc.byType.set(key, ta);
        }
        ta.shiftsCount += 1;
        ta.plannedSum += planned;
        ta.actualSum += actual;
        if (fulfilled)
            ta.fulfilledShifts += 1;
        else
            ta.understaffedCount += 1;
    }
    const stations: PpbvStationAgg[] = [...byStation.values()]
        .map(a => ({
        station: a.station,
        shiftsCount: a.shiftsCount,
        plannedSum: a.plannedSum,
        actualSum: a.actualSum,
        understaffedCount: a.understaffedCount,
        fulfilledShifts: a.fulfilledShifts,
        compliancePct: pct(a.actualSum, a.plannedSum),
        shiftQuotePct: pct(a.fulfilledShifts, a.shiftsCount),
        byType: [...a.byType.values()].sort((x, y) => (TYPE_ORDER[x.shift_type] ?? 99) - (TYPE_ORDER[y.shift_type] ?? 99)),
    }))
        .sort((a, b) => a.station.localeCompare(b.station, "de"));
    return { year, month, stations, totals: summe(stations) };
}
function summe(stations: PpbvTotals[]): PpbvTotals {
    const t = { shiftsCount: 0, plannedSum: 0, actualSum: 0, understaffedCount: 0, fulfilledShifts: 0 };
    for (const s of stations)
        for (const k of Object.keys(t) as (keyof typeof t)[])
            t[k] += s[k];
    return { ...t, compliancePct: pct(t.actualSum, t.plannedSum), shiftQuotePct: pct(t.fulfilledShifts, t.shiftsCount) };
}
export function monthRange(year: number, month: number): {
    from: string;
    to: string;
} {
    return monatsBereichISO(year, month - 1);
}
export function isPastMonth(year: number, month: number, now = new Date()): boolean {
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    return year < cy || (year === cy && month < cm);
}
export type PpbvRecordRow = {
    station: string;
    year: number;
    month: number;
    shifts_count: number;
    planned_sum: number;
    actual_sum: number;
    understaffed_count: number;
    fulfilled_shifts: number;
    compliance_pct: number;
    shift_quote_pct: number;
    by_type: unknown;
    generated_at?: string | null;
    source?: string | null;
};
function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}
function normalizeByType(raw: unknown): PpbvTypeAgg[] {
    if (!Array.isArray(raw))
        return [];
    return raw
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map(t => ({
        shift_type: String(t.shift_type ?? "all"),
        shiftsCount: num(t.shiftsCount),
        plannedSum: num(t.plannedSum),
        actualSum: num(t.actualSum),
        understaffedCount: num(t.understaffedCount),
        fulfilledShifts: num(t.fulfilledShifts),
    }))
        .sort((x, y) => (TYPE_ORDER[x.shift_type] ?? 99) - (TYPE_ORDER[y.shift_type] ?? 99));
}
export function recordRowsFromReport(report: PpbvReport, facilityName: string) {
    return report.stations.map(s => ({
        facility_name: facilityName,
        station: s.station,
        year: report.year,
        month: report.month,
        shifts_count: s.shiftsCount,
        planned_sum: s.plannedSum,
        actual_sum: s.actualSum,
        understaffed_count: s.understaffedCount,
        fulfilled_shifts: s.fulfilledShifts,
        compliance_pct: s.compliancePct,
        shift_quote_pct: s.shiftQuotePct,
        by_type: s.byType,
    }));
}
export function reportFromRecordRows(rows: PpbvRecordRow[], year: number, month: number): PpbvReport {
    const stations: PpbvStationAgg[] = rows
        .map(r => ({
        station: r.station,
        shiftsCount: num(r.shifts_count),
        plannedSum: num(r.planned_sum),
        actualSum: num(r.actual_sum),
        understaffedCount: num(r.understaffed_count),
        fulfilledShifts: num(r.fulfilled_shifts),
        compliancePct: num(r.compliance_pct),
        shiftQuotePct: num(r.shift_quote_pct),
        byType: normalizeByType(r.by_type),
    }))
        .sort((a, b) => a.station.localeCompare(b.station, "de"));
    return { year, month, stations, totals: summe(stations) };
}
export function previousMonth(now = new Date()): {
    year: number;
    month: number;
} {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
export function monthKey(p: {
    year: number;
    month: number;
}): number {
    return p.year * 12 + p.month;
}
export type PpbvSource = "automatisch" | "manuell" | "korrektur";
export function sourceLabel(s: string | null | undefined): string {
    if (s === "automatisch")
        return "automatisch zum Monatsende";
    if (s === "korrektur")
        return "korrigiert und neu festgeschrieben";
    return "manuell nachberechnet";
}
