import { describe, expect, it } from "vitest";
import { absenceDatesInMonth, daysInMonth, payableAbsenceDays, splitOvertime, sumAbsenceDays } from "./absence-hours";
const MS = "2026-08-01";
const ME = "2026-08-31";
describe("daysInMonth", () => {
    it("zählt einen Zeitraum innerhalb des Monats inklusive beider Randtage", () => {
        expect(daysInMonth({ from_date: "2026-08-10", to_date: "2026-08-14" }, MS, ME)).toBe(5);
        expect(daysInMonth({ from_date: "2026-08-10", to_date: "2026-08-10" }, MS, ME)).toBe(1);
    });
    it("schneidet einen Zeitraum am Monatsanfang und -ende zu", () => {
        expect(daysInMonth({ from_date: "2026-08-28", to_date: "2026-09-05" }, MS, ME)).toBe(4);
        expect(daysInMonth({ from_date: "2026-07-25", to_date: "2026-08-03" }, MS, ME)).toBe(3);
    });
    it("gibt 0 für Zeiträume komplett außerhalb des Monats zurück", () => {
        expect(daysInMonth({ from_date: "2026-09-01", to_date: "2026-09-10" }, MS, ME)).toBe(0);
        expect(daysInMonth({ from_date: "2026-06-01", to_date: "2026-07-31" }, MS, ME)).toBe(0);
    });
    it("deckt einen Zeitraum ab, der den ganzen Monat umschließt", () => {
        expect(daysInMonth({ from_date: "2026-07-01", to_date: "2026-09-30" }, MS, ME)).toBe(31);
    });
    it("summiert mehrere Zeiträume", () => {
        expect(sumAbsenceDays([
            { from_date: "2026-08-03", to_date: "2026-08-07" },
            { from_date: "2026-08-28", to_date: "2026-09-04" },
            { from_date: "2026-09-10", to_date: "2026-09-12" },
        ], MS, ME)).toBe(9);
    });
});
describe("splitOvertime", () => {
    it("zahlt bei payout alles aus (unverändertes Bestandsverhalten)", () => {
        expect(splitOvertime(180, 160, "payout")).toEqual({ paidHours: 180, bankedHours: 0 });
    });
    it("bankt die Mehrarbeit bei vacation/flextime statt sie auszuzahlen", () => {
        expect(splitOvertime(180, 160, "vacation")).toEqual({ paidHours: 160, bankedHours: 20 });
        expect(splitOvertime(180, 160, "flextime")).toEqual({ paidHours: 160, bankedHours: 20 });
    });
    it("bankt nichts, wenn keine Überstunden angefallen sind", () => {
        expect(splitOvertime(150, 160, "flextime")).toEqual({ paidHours: 150, bankedHours: 0 });
    });
    it("zahlt ohne bekannte Vertragsstunden alles aus statt alles zu banken", () => {
        expect(splitOvertime(180, 0, "flextime")).toEqual({ paidHours: 180, bankedHours: 0 });
    });
});
describe("absenceDatesInMonth", () => {
    it("liefert jeden Kalendertag des Zeitraums", () => {
        const d = absenceDatesInMonth([{ from_date: "2026-08-10", to_date: "2026-08-13" }], MS, ME);
        expect([...d].sort()).toEqual(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]);
    });
    it("schneidet am Monatsrand zu — passend zu daysInMonth", () => {
        const range = { from_date: "2026-07-28", to_date: "2026-08-03" };
        const d = absenceDatesInMonth([range], MS, ME);
        expect([...d].sort()).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
        expect(d.size).toBe(daysInMonth(range, MS, ME));
    });
    it("ignoriert Zeitraeume ausserhalb des Monats", () => {
        expect(absenceDatesInMonth([{ from_date: "2026-09-01", to_date: "2026-09-05" }], MS, ME).size).toBe(0);
    });
    it("zaehlt ueberlappende Antraege pro Tag nur einmal", () => {
        const ranges = [
            { from_date: "2026-08-10", to_date: "2026-08-12" },
            { from_date: "2026-08-11", to_date: "2026-08-13" },
        ];
        expect(sumAbsenceDays(ranges, MS, ME)).toBe(6);
        expect(absenceDatesInMonth(ranges, MS, ME).size).toBe(4);
    });
    it("kommt ueber einen Monatswechsel mit Sommerzeit hinweg", () => {
        const d = absenceDatesInMonth([{ from_date: "2026-10-24", to_date: "2026-10-27" }], "2026-10-01", "2026-10-31");
        expect([...d].sort()).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    });
});
describe("payableAbsenceDays", () => {
    it("bezahlt jeden Abwesenheitstag, an dem nicht gearbeitet wurde", () => {
        const urlaub = new Set(["2026-08-10", "2026-08-11", "2026-08-12"]);
        expect(payableAbsenceDays(urlaub, new Set())).toBe(3);
    });
    it("zieht Tage ab, an denen trotz Urlaub eingestempelt wurde", () => {
        const urlaub = new Set(["2026-08-10", "2026-08-11", "2026-08-12"]);
        expect(payableAbsenceDays(urlaub, new Set(["2026-08-11"]))).toBe(2);
    });
    it("ignoriert Arbeitstage ausserhalb der Abwesenheit", () => {
        const urlaub = new Set(["2026-08-10"]);
        expect(payableAbsenceDays(urlaub, new Set(["2026-08-20", "2026-08-21"]))).toBe(1);
    });
    it("ergibt 0, wenn an allen Abwesenheitstagen gearbeitet wurde", () => {
        const urlaub = new Set(["2026-08-10", "2026-08-11"]);
        expect(payableAbsenceDays(urlaub, new Set(["2026-08-10", "2026-08-11"]))).toBe(0);
    });
    it("ergibt 0 ohne Abwesenheit", () => {
        expect(payableAbsenceDays(new Set<string>(), new Set(["2026-08-10"]))).toBe(0);
    });
});
