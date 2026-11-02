import { describe, it, expect } from "vitest";
import { decideRebalanceForStaff, type RebalanceCandidateShift } from "@/lib/overtime-rebalance";
import type { ReplacementCandidate } from "@/lib/scheduling/generate-plan-core";
const cand = (name: string, overtime = false): ReplacementCandidate => ({
    staff_id: name.toLowerCase(), staff_name: name, score: 50, reason: "Verfügbar", is_overtime: overtime,
});
const shiftOf = (over: Partial<RebalanceCandidateShift>): RebalanceCandidateShift => ({
    shiftId: "s1", date: "2026-07-10", shiftType: "frueh", plannedStaff: 2,
    confirmedCountExclTarget: 1, replacementCandidates: [], ...over,
});
describe("decideRebalanceForStaff — Kaskade", () => {
    it("nicht über der Grenze -> none", () => {
        const d = decideRebalanceForStaff({ weekHours: 38, limitHours: 40, candidateShifts: [] });
        expect(d).toEqual({ action: "none" });
    });
    it("Besetzung reicht auch ohne die Person -> remove, kein Ersatz nötig", () => {
        const d = decideRebalanceForStaff({
            weekHours: 48, limitHours: 40,
            candidateShifts: [shiftOf({ plannedStaff: 2, confirmedCountExclTarget: 2 })],
        });
        expect(d).toMatchObject({ action: "remove", shiftId: "s1" });
    });
    it("Besetzung reicht NICHT ohne Ersatz -> swap mit nicht-Überstunden-Kandidat", () => {
        const d = decideRebalanceForStaff({
            weekHours: 48, limitHours: 40,
            candidateShifts: [shiftOf({
                    plannedStaff: 2, confirmedCountExclTarget: 1,
                    replacementCandidates: [cand("Bea", true), cand("Anna", false)],
                })],
        });
        expect(d).toMatchObject({ action: "swap", replacementStaffName: "Anna" });
    });
    it("nur Überstunden-Kandidaten verfügbar -> keine Lösung -> escalate", () => {
        const d = decideRebalanceForStaff({
            weekHours: 48, limitHours: 40,
            candidateShifts: [shiftOf({
                    plannedStaff: 2, confirmedCountExclTarget: 1,
                    replacementCandidates: [cand("Bea", true)],
                })],
        });
        expect(d).toMatchObject({ action: "escalate" });
    });
    it("keine Kandidaten und keine freie Besetzung -> escalate", () => {
        const d = decideRebalanceForStaff({
            weekHours: 48, limitHours: 40,
            candidateShifts: [shiftOf({ plannedStaff: 2, confirmedCountExclTarget: 1, replacementCandidates: [] })],
        });
        expect(d).toMatchObject({ action: "escalate" });
    });
    it("mehrere Schichten: früheste zuerst prüfen", () => {
        const d = decideRebalanceForStaff({
            weekHours: 48, limitHours: 40,
            candidateShifts: [
                shiftOf({ shiftId: "later", date: "2026-07-12", plannedStaff: 2, confirmedCountExclTarget: 2 }),
                shiftOf({ shiftId: "earlier", date: "2026-07-10", plannedStaff: 2, confirmedCountExclTarget: 2 }),
            ],
        });
        expect(d).toMatchObject({ action: "remove", shiftId: "earlier" });
    });
});
