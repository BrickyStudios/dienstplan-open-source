import { describe, it, expect } from "vitest";
import { pruefeEignung, wochenUebersicht, wochenTage, wocheVerschieben, type EignungsPerson, type EignungsSchicht, type Belegung, } from "./eignung";
const schicht = (id: string, date: string, shift_type: string, station = "A"): EignungsSchicht => ({ id, date, shift_type, start_time: null, end_time: null, station });
const person = (over: Partial<EignungsPerson["grenzen"]> = {}, extra: Partial<EignungsPerson> = {}): EignungsPerson => ({
    id: "p1",
    name: "Anna",
    vertragsMinutenWoche: 40 * 60,
    abwesendeTage: {},
    grenzen: {
        maxConsecutiveNights: 4, maxConsecutiveDays: 6, maxShiftsPerWeek: null,
        maxHoursPerShift: null, minRestHours: 11, noSundayWork: false, ...over,
    },
    ...extra,
});
const auf = (...ids: string[]): Belegung[] => ids.map(shiftId => ({ shiftId, staffId: "p1" }));
describe("pruefeEignung", () => {
    it("ohne Konflikt: ok", () => {
        const z = schicht("z", "2026-10-06", "frueh");
        expect(pruefeEignung(person(), z, [z], []).stufe).toBe("ok");
    });
    it("schon auf genau dieser Schicht: eingeteilt", () => {
        const z = schicht("z", "2026-10-06", "frueh");
        expect(pruefeEignung(person(), z, [z], auf("z")).stufe).toBe("eingeteilt");
    });
    it("Frühdienst nach Nachtdienst: Ruhezeit nach § 5 ArbZG", () => {
        const n = schicht("n", "2026-10-05", "nacht");
        const z = schicht("z", "2026-10-06", "frueh");
        const e = pruefeEignung(person(), z, [n, z], auf("n"));
        expect(e.stufe).toBe("blocker");
        expect(e.befunde.map(b => b.regel)).toContain("ruhezeit");
    });
    it("Nacht auf Nacht verletzt keine Ruhezeit", () => {
        const n = schicht("n", "2026-10-05", "nacht");
        const z = schicht("z", "2026-10-06", "nacht");
        expect(pruefeEignung(person(), z, [n, z], auf("n")).stufe).toBe("ok");
    });
    it("die fünfte Nacht am Stück ist bei einer Grenze von 4 gesperrt", () => {
        const naechte = ["05", "06", "07", "08"].map((d, i) => schicht(`n${i}`, `2026-10-${d}`, "nacht"));
        const z = schicht("z", "2026-10-09", "nacht");
        const e = pruefeEignung(person(), z, [...naechte, z], auf("n0", "n1", "n2", "n3"));
        expect(e.befunde.find(b => b.regel === "naechte_am_stueck")?.text).toMatch(/5\. Nacht am Stück — erlaubt sind 4/);
    });
    it("zählt Nächte auch NACH der Zielnacht mit (Lücke wird geschlossen)", () => {
        const vorher = [schicht("a", "2026-10-05", "nacht"), schicht("b", "2026-10-06", "nacht")];
        const nachher = [schicht("c", "2026-10-08", "nacht"), schicht("d", "2026-10-09", "nacht")];
        const z = schicht("z", "2026-10-07", "nacht");
        const e = pruefeEignung(person(), z, [...vorher, ...nachher, z], auf("a", "b", "c", "d"));
        expect(e.befunde.map(b => b.regel)).toContain("naechte_am_stueck");
    });
    it("die eigene Nachtgrenze der Person gilt, nicht der Rückfall", () => {
        const n = schicht("n", "2026-10-05", "nacht");
        const z = schicht("z", "2026-10-06", "nacht");
        expect(pruefeEignung(person({ maxConsecutiveNights: 1 }), z, [n, z], auf("n")).stufe).toBe("blocker");
        expect(pruefeEignung(person({ maxConsecutiveNights: null }), z, [n, z], auf("n")).stufe).toBe("ok");
    });
    it("Abwesenheit sperrt nur den Tag, nicht die Woche", () => {
        const p = person({}, { abwesendeTage: { "2026-10-06": "Urlaub" } });
        expect(pruefeEignung(p, schicht("z", "2026-10-06", "frueh"), [], []).befunde[0].text).toMatch(/Urlaub/);
        expect(pruefeEignung(p, schicht("y", "2026-10-07", "frueh"), [], []).stufe).toBe("ok");
    });
    it("zweiter Dienst am selben Tag — auch auf einer anderen Station", () => {
        const f = schicht("f", "2026-10-06", "frueh", "B");
        const z = schicht("z", "2026-10-06", "spaet", "A");
        const e = pruefeEignung(person(), z, [f, z], auf("f"));
        expect(e.befunde.find(b => b.regel === "doppelt")?.text).toMatch(/\(B\)/);
    });
    it("Überstunden über der Vertragszeit sind eine Warnung", () => {
        const tage = ["05", "06", "07", "08", "09"].map((d, i) => schicht(`f${i}`, `2026-10-${d}`, "frueh"));
        const z = schicht("z", "2026-10-10", "frueh");
        const alle = [...tage, z];
        const e = pruefeEignung(person(), z, alle, auf("f0", "f1", "f2", "f3", "f4"));
        expect(e.stufe).toBe("warnung");
        expect(e.befunde[0].regel).toBe("vertrag");
    });
    it("über 48 h in der Woche ist ein Blocker", () => {
        const lang = (id: string, d: string): EignungsSchicht => ({ ...schicht(id, d, "frueh"), start_time: "06:00", end_time: "16:00" });
        const zehner = ["05", "06", "07", "08"].map((d, i) => lang(`l${i}`, `2026-10-${d}`));
        const ziel = lang("x", "2026-10-09");
        const e = pruefeEignung(person(), ziel, [...zehner, ziel], auf("l0", "l1", "l2", "l3"));
        expect(e.befunde.find(b => b.regel === "woche")?.schwere).toBe("blocker");
    });
    it("Sonntag gesperrt, wenn die Person nicht sonntags arbeitet", () => {
        const z = schicht("z", "2026-10-11", "frueh");
        expect(pruefeEignung(person({ noSundayWork: true }), z, [z], []).befunde[0].regel).toBe("sonntag");
        expect(pruefeEignung(person(), z, [z], []).stufe).toBe("ok");
    });
    it("Tage am Stück", () => {
        const tage = ["05", "06", "07"].map((d, i) => schicht(`f${i}`, `2026-10-${d}`, "frueh"));
        const z = schicht("z", "2026-10-08", "frueh");
        expect(pruefeEignung(person({ maxConsecutiveDays: 3 }), z, [...tage, z], auf("f0", "f1", "f2")).befunde.map(b => b.regel))
            .toContain("tage_am_stueck");
    });
    it("Blocker stehen vor Warnungen", () => {
        const p = person({ noSundayWork: true }, { vertragsMinutenWoche: 60 });
        const z = schicht("z", "2026-10-11", "frueh");
        const e = pruefeEignung(p, z, [z], []);
        expect(e.befunde.map(b => b.schwere)).toEqual(["blocker", "warnung"]);
    });
});
describe("wochenUebersicht", () => {
    it("nennt die Tage, an denen eine Nacht noch geht", () => {
        const naechte = ["05", "06", "07", "08", "09"].map((d, i) => schicht(`n${i}`, `2026-10-${d}`, "nacht"));
        const ue = wochenUebersicht(person(), "2026-10-07", naechte, naechte, auf("n0", "n1", "n2"));
        expect(ue.naechteWoche).toBe(3);
        expect(ue.minutenWoche).toBe(3 * 8 * 60);
        expect(ue.nachtMoeglichAn).toEqual(["2026-10-08", "2026-10-09"]);
    });
    it("nach vier Nächten am Stück geht diese Woche keine mehr", () => {
        const naechte = ["05", "06", "07", "08", "09"].map((d, i) => schicht(`n${i}`, `2026-10-${d}`, "nacht"));
        const ue = wochenUebersicht(person(), "2026-10-05", naechte, naechte, auf("n0", "n1", "n2", "n3"));
        expect(ue.nachtMoeglichAn).toEqual([]);
        expect(ue.nachtSchichtenWoche).toBe(5);
    });
});
describe("Wochenrechnung", () => {
    it("Montag bis Sonntag, auch vom Sonntag aus", () => {
        expect(wochenTage("2026-10-11")).toEqual([
            "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11",
        ]);
        expect(wocheVerschieben("2026-10-08", 1)).toBe("2026-10-12");
        expect(wocheVerschieben("2026-10-08", -1)).toBe("2026-09-28");
    });
});
