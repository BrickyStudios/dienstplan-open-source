import { describe, it, expect } from "vitest";
import { countAssignmentsByShift, groupShiftIdsByCount, zaehltAlsBesetzt } from "./actual-staff";
describe("Ist-Besetzung aus den Einteilungen zählen", () => {
    it("zählt je Schicht und lässt Schichten ohne Einteilung auf 0", () => {
        const counts = countAssignmentsByShift(["a", "b", "c"], [
            { shift_id: "a", status: "confirmed" },
            { shift_id: "a", status: "confirmed" },
            { shift_id: "b", status: null },
        ]);
        expect(counts.get("a")).toBe(2);
        expect(counts.get("b")).toBe(1);
        expect(counts.get("c")).toBe(0);
    });
    it("zählt gelöste Zuweisungen (cancelled) nicht mit", () => {
        const counts = countAssignmentsByShift(["a"], [
            { shift_id: "a", status: "confirmed" },
            { shift_id: "a", status: "cancelled" },
            { shift_id: "a", status: "manual" },
        ]);
        expect(counts.get("a")).toBe(2);
        expect(zaehltAlsBesetzt("cancelled")).toBe(false);
        expect(zaehltAlsBesetzt(undefined)).toBe(true);
    });
    it("ignoriert Zeilen fremder Schichten", () => {
        const counts = countAssignmentsByShift(["a"], [
            { shift_id: "fremd", status: "confirmed" },
            { shift_id: null, status: "confirmed" },
        ]);
        expect(counts.get("a")).toBe(0);
        expect(counts.size).toBe(1);
    });
    it("gruppiert Schichten nach Ist-Zahl, damit ein Monat wenige UPDATEs braucht", () => {
        const gruppen = groupShiftIdsByCount(new Map([["a", 2], ["b", 2], ["c", 0], ["d", 3]]));
        expect(gruppen.get(2)).toEqual(["a", "b"]);
        expect(gruppen.get(0)).toEqual(["c"]);
        expect(gruppen.get(3)).toEqual(["d"]);
        expect(gruppen.size).toBe(3);
    });
});
