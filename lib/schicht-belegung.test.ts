import { describe, it, expect } from "vitest";
import { aktuelleSchicht, vorherigeSchicht, zaehlerAnwenden, ueberUntergrenze, belegungAuswerten, kisBestand, kisZeitpunkt, eingeteilteSchichten, type StationsGrenzen, } from "./schicht-belegung";
describe("aktuelleSchicht", () => {
    it("06:00 bis 21:59 Berliner Zeit ist Tag", () => {
        expect(aktuelleSchicht(new Date("2026-10-05T04:00:00Z"))).toEqual({ datum: "2026-10-05", schicht: "tag" });
        expect(aktuelleSchicht(new Date("2026-10-05T19:59:00Z"))).toEqual({ datum: "2026-10-05", schicht: "tag" });
    });
    it("22:00 ist die Nacht desselben Tages", () => {
        expect(aktuelleSchicht(new Date("2026-10-05T20:00:00Z"))).toEqual({ datum: "2026-10-05", schicht: "nacht" });
    });
    it("03:00 gehört zur Nacht des Vortags", () => {
        expect(aktuelleSchicht(new Date("2026-10-06T01:00:00Z"))).toEqual({ datum: "2026-10-05", schicht: "nacht" });
    });
    it("Monatswechsel in der Nacht", () => {
        expect(aktuelleSchicht(new Date("2026-11-01T02:00:00Z"))).toEqual({ datum: "2026-10-31", schicht: "nacht" });
    });
});
describe("vorherigeSchicht", () => {
    it("vor der Nacht kommt der Tag desselben Datums, vor dem Tag die Nacht des Vortags", () => {
        expect(vorherigeSchicht({ datum: "2026-10-05", schicht: "nacht" })).toEqual({ datum: "2026-10-05", schicht: "tag" });
        expect(vorherigeSchicht({ datum: "2026-10-01", schicht: "tag" })).toEqual({ datum: "2026-09-30", schicht: "nacht" });
    });
});
describe("zaehlerAnwenden", () => {
    it("+1 erhöht Stand, Höchststand und Zugänge", () => {
        const s = zaehlerAnwenden({ patienten: 20, hoechststand: 20, zugaenge: 0, abgaenge: 0 }, { delta: 1 });
        expect(s).toEqual({ patienten: 21, hoechststand: 21, zugaenge: 1, abgaenge: 0 });
    });
    it("−1 senkt den Stand, aber nicht den Höchststand", () => {
        const s = zaehlerAnwenden({ patienten: 21, hoechststand: 21, zugaenge: 1, abgaenge: 0 }, { delta: -1 });
        expect(s).toEqual({ patienten: 20, hoechststand: 21, zugaenge: 1, abgaenge: 1 });
    });
    it("unter null wird nicht gezählt — und auch kein Abgang erfunden", () => {
        const s = zaehlerAnwenden({ patienten: 1, hoechststand: 1, zugaenge: 0, abgaenge: 0 }, { delta: -3 });
        expect(s).toEqual({ patienten: 0, hoechststand: 1, zugaenge: 0, abgaenge: 1 });
    });
    it("Setzen ist kein Zugang", () => {
        const s = zaehlerAnwenden(null, { anzahl: 24 });
        expect(s).toEqual({ patienten: 24, hoechststand: 24, zugaenge: 0, abgaenge: 0 });
    });
    it("lehnt Unsinn ab", () => {
        expect(zaehlerAnwenden(null, { anzahl: -1 })).toBeNull();
        expect(zaehlerAnwenden(null, { anzahl: 2.5 })).toBeNull();
        expect(zaehlerAnwenden(null, { anzahl: 2600 })).toBeNull();
        expect(zaehlerAnwenden(null, { delta: 0 })).toBeNull();
        expect(zaehlerAnwenden(null, { delta: 99 })).toBeNull();
    });
});
describe("ueberUntergrenze", () => {
    it("ohne Grenze kein Urteil", () => {
        expect(ueberUntergrenze(30, 2, null)).toBeNull();
    });
    it("genau auf der Grenze ist eingehalten, darüber nicht", () => {
        expect(ueberUntergrenze(20, 2, 10)).toBe(false);
        expect(ueberUntergrenze(21, 2, 10)).toBe(true);
    });
    it("Patienten ohne Pflegekraft ist immer über der Grenze", () => {
        expect(ueberUntergrenze(1, 0, 10)).toBe(true);
        expect(ueberUntergrenze(0, 0, 10)).toBe(false);
    });
});
describe("belegungAuswerten", () => {
    const grenzen = new Map<string, StationsGrenzen>([["Station 1", { betten: 30, grenzeTag: 10, grenzeNacht: 20 }]]);
    it("Tag = Durchschnitt aus Früh und Spät, geprüft mit dem Höchststand", () => {
        const erg = belegungAuswerten([
            { station: "Station 1", date: "2026-10-05", shift_type: "frueh", actual_staff: 3 },
            { station: "Station 1", date: "2026-10-05", shift_type: "spaet", actual_staff: 2 },
            { station: "Station 1", date: "2026-10-05", shift_type: "nacht", actual_staff: 1 },
        ], [
            { station: "Station 1", datum: "2026-10-05", schicht: "tag", patienten: 24, hoechststand: 26 },
            { station: "Station 1", datum: "2026-10-05", schicht: "nacht", patienten: 20, hoechststand: 20 },
        ], grenzen);
        const tag = erg.find((z) => z.schicht === "tag")!;
        const nacht = erg.find((z) => z.schicht === "nacht")!;
        expect(tag).toMatchObject({ schichtenImPlan: 1, erfasst: 1, patientenDurchschnitt: 24, pflegeDurchschnitt: 2.5, ueberGrenze: 1, betten: 30 });
        expect(nacht).toMatchObject({ erfasst: 1, ueberGrenze: 0 });
    });
    it("eine fehlende Zählung ist keine Null", () => {
        const erg = belegungAuswerten([
            { station: "Station 1", date: "2026-10-05", shift_type: "frueh", actual_staff: 3 },
            { station: "Station 1", date: "2026-10-06", shift_type: "frueh", actual_staff: 3 },
        ], [{ station: "Station 1", datum: "2026-10-05", schicht: "tag", patienten: 20, hoechststand: 20 }], grenzen);
        expect(erg[0]).toMatchObject({ schichtenImPlan: 2, erfasst: 1, patientenDurchschnitt: 20 });
    });
    it("KIS springt nur ein, wo nicht gezählt wurde", () => {
        const kis = new Map([
            ["Station 1|2026-10-05|tag", 99],
            ["Station 1|2026-10-06|tag", 18],
        ]);
        const erg = belegungAuswerten([
            { station: "Station 1", date: "2026-10-05", shift_type: "frueh", actual_staff: 3 },
            { station: "Station 1", date: "2026-10-06", shift_type: "frueh", actual_staff: 3 },
        ], [{ station: "Station 1", datum: "2026-10-05", schicht: "tag", patienten: 20, hoechststand: 20 }], grenzen, kis);
        expect(erg[0]).toMatchObject({ erfasst: 2, ausKis: 1, patientenDurchschnitt: 19 });
    });
    it("gezählt, aber kein Dienstplan an dem Tag: kein Urteil statt Unterschreitung", () => {
        const erg = belegungAuswerten([], [{ station: "Station 1", datum: "2026-10-05", schicht: "tag", patienten: 24, hoechststand: 24 }], grenzen);
        expect(erg[0]).toMatchObject({ schichtenImPlan: 0, erfasst: 1, ueberGrenze: 0, pflegeDurchschnitt: null });
    });
    it("ohne hinterlegte Grenze bleibt ueberGrenze leer", () => {
        const erg = belegungAuswerten([{ station: "Station 2", date: "2026-10-05", shift_type: "nacht", actual_staff: 1 }], [{ station: "Station 2", datum: "2026-10-05", schicht: "nacht", patienten: 40, hoechststand: 40 }], grenzen);
        expect(erg[0]!.ueberGrenze).toBeNull();
    });
});
describe("KIS-Bestand", () => {
    it("zählt offene und zum Zeitpunkt laufende Abschnitte", () => {
        const t = kisZeitpunkt("2026-10-05", "tag");
        expect(t.toISOString()).toBe("2026-10-05T12:00:00.000Z");
        const n = kisBestand([
            { station: "S1", seit: "2026-10-01T08:00:00Z", bis: null },
            { station: "S1", seit: "2026-10-05T13:00:00Z", bis: null },
            { station: "S1", seit: "2026-10-01T08:00:00Z", bis: "2026-10-05T10:00:00Z" },
            { station: "S2", seit: "2026-10-01T08:00:00Z", bis: null },
        ], "S1", t);
        expect(n).toBe(1);
    });
    it("Nacht wird um 02:00 des Folgetags gezählt, auch im Winter", () => {
        expect(kisZeitpunkt("2026-12-01", "nacht").toISOString()).toBe("2026-12-02T01:00:00.000Z");
    });
});
describe("eingeteilteSchichten", () => {
    it("nur die eigenen Dienste, Früh und Spät zählen als Tag", () => {
        const set = eingeteilteSchichten([
            { id: "a", date: "2026-10-07", station: "S1", shift_type: "frueh" },
            { id: "b", date: "2026-10-07", station: "S1", shift_type: "nacht" },
            { id: "c", date: "2026-10-07", station: "S2", shift_type: "spaet" },
        ], [
            { shift_id: "a", staff_name: "Anna Weber" },
            { shift_id: "b", staff_name: "Bernd Lange" },
            { shift_id: "c", staff_name: "Anna Weber" },
        ], "Anna Weber");
        expect([...set].sort()).toEqual(["S1|2026-10-07|tag", "S2|2026-10-07|tag"]);
    });
});
