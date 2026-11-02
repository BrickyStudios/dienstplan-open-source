import { describe, it, expect } from "vitest";
import { deriveShiftType, plannedForStation, plannedForBereich, overrideFor, applySpecialDayDemand, type Demand } from "./shift-demand";
import type { SpecialDay } from "./special-days";
describe("deriveShiftType", () => {
    it("ordnet Startzeiten den drei Schichtarten zu", () => {
        expect(deriveShiftType("06:00")).toBe("frueh");
        expect(deriveShiftType("14:00")).toBe("spaet");
        expect(deriveShiftType("22:00")).toBe("nacht");
        expect(deriveShiftType("02:00")).toBe("nacht");
    });
    it("fällt ohne Startzeit auf früh zurück", () => {
        expect(deriveShiftType(null)).toBe("frueh");
        expect(deriveShiftType(undefined)).toBe("frueh");
    });
});
describe("plannedForStation", () => {
    it("nutzt den konfigurierten Wert, wenn vorhanden — auch 0", () => {
        const demand: Demand = { "Station 1": { frueh: 3, spaet: 0 } };
        expect(plannedForStation(demand, "Station 1", "frueh")).toBe(3);
        expect(plannedForStation(demand, "Station 1", "spaet")).toBe(0);
    });
    it("fällt auf den Standardbedarf zurück, wenn nichts konfiguriert ist — nie 0", () => {
        expect(plannedForStation(null, "Unbekannt", "frueh")).toBe(2);
        expect(plannedForStation(null, "Unbekannt", "spaet")).toBe(2);
        expect(plannedForStation(null, "Unbekannt", "nacht")).toBe(1);
        const demand: Demand = { "Station 1": { frueh: 3 } };
        expect(plannedForStation(demand, "Station 1", "nacht")).toBe(1);
    });
});
describe("plannedForBereich", () => {
    it("nutzt den konfigurierten Wert, auch 0 (,diese Schicht gibt es hier nicht')", () => {
        const demand: Demand = { Reinigung: { frueh: 2, nacht: 0 } };
        expect(plannedForBereich(demand, "Reinigung", "frueh")).toBe(2);
        expect(plannedForBereich(demand, "Reinigung", "nacht")).toBe(0);
    });
    it("fällt ohne Konfiguration auf 1 zurück", () => {
        expect(plannedForBereich(null, "Reinigung", "frueh")).toBe(1);
    });
});
describe("applySpecialDayDemand", () => {
    const silvester: SpecialDay = {
        id: "silvester", name: "Silvester", kind: "fixed", month: 12, day: 31,
        demandMultiplier: 1.4, status: "active", source: "seed",
    };
    const oktoberfest: SpecialDay = {
        id: "oktoberfest", name: "Oktoberfest", kind: "regional", bundeslaender: ["Bayern"],
        month: 9, day: 20, dateRangeDays: 16, demandMultiplier: 1.3, status: "active", source: "seed",
    };
    it("rundet den Soll-Wert an einem Sondertag AUF (nie ab)", () => {
        expect(applySpecialDayDemand(3, "2026-12-31", [silvester], null)).toBe(5);
    });
    it("lässt den Soll-Wert an einem gewöhnlichen Tag unverändert", () => {
        expect(applySpecialDayDemand(3, "2026-06-15", [silvester], null)).toBe(3);
    });
    it("wendet regionale Sondertage nur im passenden Bundesland an", () => {
        expect(applySpecialDayDemand(2, "2026-09-25", [oktoberfest], "Bayern")).toBe(3);
        expect(applySpecialDayDemand(2, "2026-09-25", [oktoberfest], "Berlin")).toBe(2);
        expect(applySpecialDayDemand(2, "2026-09-25", [oktoberfest], null)).toBe(2);
    });
    it("erzeugt aus 0 Soll-Personal keinen Bedarf (verstärkt nur bestehenden Bedarf)", () => {
        expect(applySpecialDayDemand(0, "2026-12-31", [silvester], null)).toBe(0);
    });
    it("ohne special_days/Konfiguration unverändert", () => {
        expect(applySpecialDayDemand(3, "2026-12-31", null, null)).toBe(3);
        expect(applySpecialDayDemand(3, "2026-12-31", [], null)).toBe(3);
    });
});
describe("overrideFor", () => {
    it("liefert die hinterlegte Abweichung", () => {
        const overrides = { "Station 1": { frueh: { start: "06:30", end: "14:30" } } };
        expect(overrideFor(overrides, "Station 1", "frueh")).toEqual({ start: "06:30", end: "14:30" });
    });
    it("liefert null ohne Konfiguration", () => {
        expect(overrideFor(null, "Station 1", "frueh")).toBeNull();
        expect(overrideFor({}, "Station 1", "frueh")).toBeNull();
    });
});
