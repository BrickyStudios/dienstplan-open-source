import { describe, it, expect } from "vitest";
import { dienstplanungVon, istLeitungsberuf, passtZurDienstplanung } from "@/lib/scheduling/dienstplanung";
import { runSchedulingAlgorithm, rankReplacementCandidates, type AlgorithmInput, type RawFacilityStaff } from "@/lib/scheduling/generate-plan-core";
function staff(id: string, full_name: string, over: Partial<RawFacilityStaff> = {}): RawFacilityStaff {
    return {
        id, full_name, active: true, station: "S",
        max_hours_per_week: 100, job_type: "Vollzeit", hourly_rate: null, minijob_buffer_pct: 15,
        ...over,
    };
}
const WOCHE = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const TYPEN = [
    ["frueh", "06:00", "14:00"], ["spaet", "14:00", "22:00"], ["nacht", "22:00", "06:00"],
] as const;
const schichten = WOCHE.flatMap(d => TYPEN.map(([t, s, e]) => ({
    id: `${d}-${t}`, station: "S", date: d, shift_type: t, planned_staff: 1, start_time: s, end_time: e,
})));
describe("istLeitungsberuf", () => {
    it("erkennt Leitungen, aber nicht die Praxisanleitung", () => {
        expect(istLeitungsberuf("Stationsleitung")).toBe(true);
        expect(istLeitungsberuf("Wohnbereichsleitung")).toBe(true);
        expect(istLeitungsberuf("PDL")).toBe(true);
        expect(istLeitungsberuf("Reinigungskraft (Leitung)")).toBe(true);
        expect(istLeitungsberuf("Praxisanleitung")).toBe(false);
        expect(istLeitungsberuf("Pflegefachkraft")).toBe(false);
        expect(istLeitungsberuf(null)).toBe(false);
    });
});
describe("dienstplanungVon", () => {
    it("nimmt den gesetzten Wert, sonst Tagdienst für Leitungen, sonst Schicht", () => {
        expect(dienstplanungVon({ role: "Stationsleitung", dienstplanung: "schicht" })).toBe("schicht");
        expect(dienstplanungVon({ role: "Stationsleitung" })).toBe("tagdienst");
        expect(dienstplanungVon({ role: "Pflegefachkraft" })).toBe("schicht");
        expect(dienstplanungVon({ role: "Pflegefachkraft" }, "leitung")).toBe("tagdienst");
        expect(dienstplanungVon({ role: "Pflegefachkraft", dienstplanung: "unsinn" })).toBe("schicht");
    });
});
describe("passtZurDienstplanung", () => {
    it("Tagdienst: Mo–Fr Früh ja, Spät, Nacht und Wochenende nein", () => {
        expect(passtZurDienstplanung("tagdienst", "2026-10-05", "frueh")).toBe(true);
        expect(passtZurDienstplanung("tagdienst", "2026-10-05", "spaet")).toBe(false);
        expect(passtZurDienstplanung("tagdienst", "2026-10-08", "nacht")).toBe(false);
        expect(passtZurDienstplanung("tagdienst", "2026-10-10", "frueh")).toBe(false);
        expect(passtZurDienstplanung("tagdienst", "2026-10-11", "frueh")).toBe(false);
    });
    it("Gleitzeit nie, Schichtdienst immer", () => {
        expect(passtZurDienstplanung("selbst", "2026-10-05", "frueh")).toBe(false);
        expect(passtZurDienstplanung("schicht", "2026-10-10", "nacht")).toBe(true);
    });
});
describe("runSchedulingAlgorithm — Leitung im Plan", () => {
    const basis = (leitung: Partial<RawFacilityStaff>): AlgorithmInput => ({
        shifts: schichten,
        facilityStaff: [staff("l", "Leitung", { role: "Stationsleitung", ...leitung })],
        profiles: [], wishes: [], nightEntries: [], availability: [],
        settings: { understaffing_mode: "auto" },
    });
    it("plant eine Stationsleitung nur Mo–Fr in den Frühdienst — auch bei Unterbesetzung", () => {
        const res = runSchedulingAlgorithm(basis({}));
        expect(res.assignments.length).toBeGreaterThan(0);
        for (const a of res.assignments) {
            expect(a.shift_type).toBe("frueh");
            expect(["2026-10-10", "2026-10-11"]).not.toContain(a.shift_date);
        }
    });
    it("Gleitzeit: der Planer setzt die Person nie ein", () => {
        const res = runSchedulingAlgorithm(basis({ dienstplanung: "selbst" }));
        expect(res.assignments).toEqual([]);
    });
    it("ausdrücklich Schichtdienst: die Leitung rotiert mit", () => {
        const res = runSchedulingAlgorithm(basis({ dienstplanung: "schicht" }));
        expect(res.assignments.some(a => a.shift_type !== "frueh" || a.shift_date >= "2026-10-10")).toBe(true);
    });
    it("die Ausfallsuche schlägt die Leitung für keine Nacht vor", () => {
        const nacht = schichten.find(s => s.id === "2026-10-07-nacht")!;
        const kandidaten = rankReplacementCandidates({
            shift: nacht,
            facilityStaff: [staff("l", "Leitung", { role: "Stationsleitung" }), staff("p", "Pflege")],
            profiles: [], wishes: [], nightEntries: [], availability: [],
            hoursThisWeekByStaffId: {}, assignedByStaffAndDate: {},
        } as unknown as Parameters<typeof rankReplacementCandidates>[0]);
        expect(kandidaten.map(k => k.staff_name)).toEqual(["Pflege"]);
    });
});
