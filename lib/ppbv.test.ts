import { describe, it, expect } from "vitest";
import { computePpbvReport, monthRange, isPastMonth, previousMonth, monthKey, recordRowsFromReport, reportFromRecordRows, sourceLabel, type PpbvShift, type PpbvRecordRow, } from "./ppbv";
function shift(p: Partial<PpbvShift>): PpbvShift {
    return { planned_staff: 3, actual_staff: 3, date: "2026-06-01", station: "A", shift_type: "frueh", ...p };
}
describe("computePpbvReport", () => {
    it("aggregiert Soll/Ist und Unterschreitungen je Station", () => {
        const shifts = [
            shift({ station: "A", planned_staff: 4, actual_staff: 4 }),
            shift({ station: "A", planned_staff: 4, actual_staff: 3, shift_type: "spaet" }),
            shift({ station: "B", planned_staff: 2, actual_staff: 2, shift_type: "nacht" }),
        ];
        const r = computePpbvReport(shifts, new Set(), 2026, 6);
        expect(r.stations).toHaveLength(2);
        const a = r.stations.find(s => s.station === "A")!;
        expect(a.shiftsCount).toBe(2);
        expect(a.plannedSum).toBe(8);
        expect(a.actualSum).toBe(7);
        expect(a.understaffedCount).toBe(1);
        expect(a.fulfilledShifts).toBe(1);
        expect(a.compliancePct).toBe(88);
        expect(a.shiftQuotePct).toBe(50);
        expect(r.totals.plannedSum).toBe(10);
        expect(r.totals.actualSum).toBe(9);
        expect(r.totals.understaffedCount).toBe(1);
    });
    it("überschüssiges Ist deckelt die Schichtquote nicht, aber gilt als erfüllt", () => {
        const shifts = [shift({ planned_staff: 2, actual_staff: 5 })];
        const r = computePpbvReport(shifts, new Set(), 2026, 6);
        expect(r.totals.understaffedCount).toBe(0);
        expect(r.totals.fulfilledShifts).toBe(1);
        expect(r.totals.shiftQuotePct).toBe(100);
    });
    it("ignoriert PPBV-befreite Stationen und Schichten ohne Soll", () => {
        const shifts = [
            shift({ station: "Ärztlicher Dienst", planned_staff: 3, actual_staff: 1 }),
            shift({ station: "A", planned_staff: 0, actual_staff: 0 }),
            shift({ station: "A", planned_staff: 2, actual_staff: 2 }),
        ];
        const r = computePpbvReport(shifts, new Set(["Ärztlicher Dienst"]), 2026, 6);
        expect(r.stations).toHaveLength(1);
        expect(r.stations[0].station).toBe("A");
        expect(r.stations[0].shiftsCount).toBe(1);
    });
    it("schlüsselt nach Schichtart auf", () => {
        const shifts = [
            shift({ shift_type: "frueh", actual_staff: 3, planned_staff: 3 }),
            shift({ shift_type: "nacht", actual_staff: 1, planned_staff: 2 }),
        ];
        const r = computePpbvReport(shifts, new Set(), 2026, 6);
        const byType = r.stations[0].byType;
        expect(byType.map(t => t.shift_type)).toEqual(["frueh", "nacht"]);
        expect(byType.find(t => t.shift_type === "nacht")!.understaffedCount).toBe(1);
    });
});
describe("monthRange", () => {
    it("liefert ersten und letzten Tag inkl. Schaltmonate", () => {
        expect(monthRange(2026, 6)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
        expect(monthRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
        expect(monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
        expect(monthRange(2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    });
});
describe("isPastMonth", () => {
    const now = new Date("2026-07-15T12:00:00Z");
    it("erkennt abgeschlossene vs. laufende Monate", () => {
        expect(isPastMonth(2026, 6, now)).toBe(true);
        expect(isPastMonth(2026, 7, now)).toBe(false);
        expect(isPastMonth(2026, 8, now)).toBe(false);
        expect(isPastMonth(2025, 12, now)).toBe(true);
    });
});
describe("recordRowsFromReport / reportFromRecordRows", () => {
    const shifts = [
        shift({ station: "A", planned_staff: 4, actual_staff: 4 }),
        shift({ station: "A", planned_staff: 4, actual_staff: 3, shift_type: "spaet" }),
        shift({ station: "B", planned_staff: 2, actual_staff: 2, shift_type: "nacht" }),
    ];
    it("überlebt den Rundlauf unverändert", () => {
        const original = computePpbvReport(shifts, new Set(), 2026, 6);
        const rows = recordRowsFromReport(original, "Testklinik") as unknown as PpbvRecordRow[];
        expect(reportFromRecordRows(rows, 2026, 6)).toEqual(original);
    });
    it("schreibt Einrichtung und Zeitraum in jede Zeile", () => {
        const rows = recordRowsFromReport(computePpbvReport(shifts, new Set(), 2026, 6), "Testklinik");
        expect(rows).toHaveLength(2);
        expect(rows.every(r => r.facility_name === "Testklinik" && r.year === 2026 && r.month === 6)).toBe(true);
    });
    it("übernimmt die eingefrorenen Prozentwerte, statt sie neu zu rechnen", () => {
        const rows: PpbvRecordRow[] = [{
                station: "A", year: 2026, month: 6,
                shifts_count: 2, planned_sum: 8, actual_sum: 7,
                understaffed_count: 1, fulfilled_shifts: 1,
                compliance_pct: 42, shift_quote_pct: 17,
                by_type: null,
            }];
        const r = reportFromRecordRows(rows, 2026, 6);
        expect(r.stations[0].compliancePct).toBe(42);
        expect(r.stations[0].shiftQuotePct).toBe(17);
        expect(r.totals.compliancePct).toBe(88);
    });
    it("verträgt kaputte oder fehlende by_type-Werte aus der Datenbank", () => {
        const kaputt: PpbvRecordRow[] = [
            { station: "A", year: 2026, month: 6, shifts_count: 1, planned_sum: 2, actual_sum: 2, understaffed_count: 0, fulfilled_shifts: 1, compliance_pct: 100, shift_quote_pct: 100, by_type: "nicht mal ein Array" },
            { station: "B", year: 2026, month: 6, shifts_count: 1, planned_sum: 2, actual_sum: 1, understaffed_count: 1, fulfilled_shifts: 0, compliance_pct: 50, shift_quote_pct: 0, by_type: [null, { shift_type: "nacht", plannedSum: "2" }] },
        ];
        const r = reportFromRecordRows(kaputt, 2026, 6);
        expect(r.stations[0].byType).toEqual([]);
        expect(r.stations[1].byType).toHaveLength(1);
        expect(r.stations[1].byType[0].plannedSum).toBe(2);
        expect(r.totals.shiftsCount).toBe(2);
    });
    it("sortiert Stationen deutsch, unabhängig von der Zeilenreihenfolge", () => {
        const rows: PpbvRecordRow[] = ["Ötztal", "Anlage", "Zentral"].map(station => ({
            station, year: 2026, month: 6, shifts_count: 0, planned_sum: 0, actual_sum: 0,
            understaffed_count: 0, fulfilled_shifts: 0, compliance_pct: 0, shift_quote_pct: 0, by_type: [],
        }));
        expect(reportFromRecordRows(rows, 2026, 6).stations.map(s => s.station))
            .toEqual(["Anlage", "Ötztal", "Zentral"]);
    });
});
describe("previousMonth", () => {
    it("liefert den zuletzt abgeschlossenen Monat", () => {
        expect(previousMonth(new Date("2026-07-15T12:00:00Z"))).toEqual({ year: 2026, month: 6 });
    });
    it("springt im Januar ins Vorjahr", () => {
        expect(previousMonth(new Date("2026-01-03T12:00:00Z"))).toEqual({ year: 2025, month: 12 });
    });
    it("ist immer ein abgeschlossener Monat — sonst dürfte der Cron ihn nicht festschreiben", () => {
        for (const tag of ["2026-01-01", "2026-03-31", "2026-12-31"]) {
            const now = new Date(`${tag}T09:00:00Z`);
            const p = previousMonth(now);
            expect(isPastMonth(p.year, p.month, now)).toBe(true);
        }
    });
});
describe("monthKey", () => {
    it("ordnet Monate über Jahresgrenzen hinweg", () => {
        expect(monthKey({ year: 2026, month: 1 })).toBeGreaterThan(monthKey({ year: 2025, month: 12 }));
        expect(monthKey({ year: 2026, month: 6 })).toBe(monthKey({ year: 2026, month: 6 }));
    });
});
describe("sourceLabel", () => {
    it("benennt alle drei Wege und fällt sonst auf 'manuell' zurück", () => {
        expect(sourceLabel("automatisch")).toContain("automatisch");
        expect(sourceLabel("korrektur")).toContain("korrigiert");
        expect(sourceLabel("manuell")).toContain("manuell");
        expect(sourceLabel(null)).toContain("manuell");
    });
});
