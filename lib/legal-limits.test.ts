import { describe, expect, it } from "vitest";
import { checkLegalLimits, minijobGrenze } from "./legal-limits";
import { effectiveWeeklyLimit } from "@/lib/scheduling/generate-plan-core";
import { calculatePayroll } from "@/lib/payroll/calculate-payroll";
const norms = (l: Parameters<typeof checkLegalLimits>[0]) => checkLegalLimits(l).map(f => f.norm);
describe("checkLegalLimits", () => {
    it("meldet nichts bei gesetzeskonformen Werten", () => {
        expect(checkLegalLimits({
            defaultMinRestHours: 11,
            defaultMaxHoursPerShift: 10,
            defaultVacationDays: 30,
            defaultBreakMin: 30,
        })).toEqual([]);
    });
    it("meldet nichts, wenn gar nichts eingestellt ist", () => {
        expect(checkLegalLimits({})).toEqual([]);
        expect(checkLegalLimits({
            defaultMinRestHours: null,
            defaultMaxHoursPerShift: null,
            defaultVacationDays: null,
        })).toEqual([]);
    });
    it("erkennt eine zu kurze Ruhezeit (§ 5 ArbZG)", () => {
        const f = checkLegalLimits({ defaultMinRestHours: 9 });
        expect(f).toHaveLength(1);
        expect(f[0].norm).toBe("§ 5 Abs. 1 ArbZG");
        expect(f[0].schwere).toBe("blocker");
        expect(f[0].text).toContain("§ 5 Abs. 2 ArbZG");
    });
    it("akzeptiert genau 11 Stunden Ruhezeit", () => {
        expect(norms({ defaultMinRestHours: 11 })).toEqual([]);
    });
    it("erkennt eine zu lange Schicht (§ 3 ArbZG)", () => {
        expect(norms({ defaultMaxHoursPerShift: 12 })).toEqual(["§ 3 ArbZG"]);
        expect(norms({ defaultMaxHoursPerShift: 10 })).toEqual([]);
    });
    it("erkennt zu wenig Urlaub (§ 3 BUrlG)", () => {
        expect(norms({ defaultVacationDays: 18 })).toEqual(["§ 3 Abs. 1 BUrlG"]);
        expect(norms({ defaultVacationDays: 20 })).toEqual([]);
        expect(norms({ defaultVacationDays: 30 })).toEqual([]);
    });
    it("erkennt eine zu kurze Pause (§ 4 ArbZG)", () => {
        expect(norms({ defaultBreakMin: 15 })).toEqual(["§ 4 ArbZG"]);
        expect(norms({ defaultBreakMin: 30 })).toEqual([]);
    });
    it("meldet keine Pausen-Verletzung, wenn die Pause schon vor 6 h greift", () => {
        expect(norms({ defaultBreakMin: 20, defaultBreakAfterMinutes: 240 })).toEqual([]);
    });
    it("weist auf die Mitbestimmung hin, solange Gleitzeit unbestätigt aktiv ist", () => {
        const f = checkLegalLimits({ flextimeEnabled: true, flextimeCodeterminationAck: false });
        expect(f).toHaveLength(1);
        expect(f[0].norm).toBe("§ 87 Abs. 1 Nr. 2 BetrVG");
        expect(f[0].schwere).toBe("warnung");
    });
    it("schweigt zur Mitbestimmung nach Bestätigung und bei ausgeschalteter Gleitzeit", () => {
        expect(norms({ flextimeEnabled: true, flextimeCodeterminationAck: true })).toEqual([]);
        expect(norms({ flextimeEnabled: false })).toEqual([]);
    });
    it("sammelt mehrere Verstöße gleichzeitig", () => {
        expect(norms({
            defaultMinRestHours: 8,
            defaultMaxHoursPerShift: 14,
            defaultVacationDays: 10,
        })).toEqual(["§ 5 Abs. 1 ArbZG", "§ 3 ArbZG", "§ 3 Abs. 1 BUrlG"]);
    });
});
describe("minijobGrenze", () => {
    it("folgt dem Mindestlohn × 130 ÷ 3, aufgerundet", () => {
        expect(minijobGrenze(2024)).toBe(538);
        expect(minijobGrenze(2025)).toBe(556);
        expect(minijobGrenze(2026)).toBe(603);
        expect(minijobGrenze(2027)).toBe(633);
    });
    it("nimmt für unbekannte Jahre das nächstgelegene, nie 0", () => {
        expect(minijobGrenze(2031)).toBe(633);
        expect(minijobGrenze(2019)).toBe(538);
    });
    it("deckelt Minijobber im Planer nach dem Jahr des Plans", () => {
        const minijob = { max_hours_per_week: 40, job_type: "Minijob", hourly_rate: 13.9, minijob_buffer_pct: 0 };
        expect(effectiveWeeklyLimit(minijob, 2026)).toBe(10);
        expect(effectiveWeeklyLimit(minijob, 2024)).toBe(8);
    });
    it("meldet in der Abrechnung 2026 erst über 603 € eine Überschreitung", () => {
        const lauf = (brutto: number, year: number) => calculatePayroll({
            staffName: "Prueffall", jobType: "Minijob", taxClass: 1, churchTax: false, childrenCount: 0,
            hoursWorked: 1, hourlyRate: brutto, monthlySalary: null, year,
        }).minijobCapExceeded;
        expect(lauf(580, 2026)).toBe(false);
        expect(lauf(604, 2026)).toBe(true);
        expect(lauf(580, 2025)).toBe(true);
    });
});
