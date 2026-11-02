import { describe, expect, it } from "vitest";
import { abwesenheitenNachTag, isoWeekRange, shiftMinutesLocal } from "@/lib/ai-guard-daten";
const namen = new Map([["p1", "Anna Weber"], ["p2", "Bert Kral"]]);
describe("abwesenheitenNachTag", () => {
    it("rollt einen Urlaubszeitraum auf Einzeltage aus", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-09-21", to_date: "2026-09-23" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-17", bis: "2026-10-10",
        });
        expect(r.get("Anna Weber")).toEqual({
            "2026-09-21": "Urlaub", "2026-09-22": "Urlaub", "2026-09-23": "Urlaub",
        });
    });
    it("markiert NUR die Urlaubstage, nicht das ganze Fenster", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-10-09", to_date: "2026-10-09" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-17", bis: "2026-10-10",
        });
        const tage = r.get("Anna Weber")!;
        expect(Object.keys(tage)).toEqual(["2026-10-09"]);
        expect(tage["2026-09-18"]).toBeUndefined();
    });
    it("beschneidet einen langen Urlaub auf das Fenster", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-01-01", to_date: "2026-12-31" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-20", bis: "2026-09-22",
        });
        expect(Object.keys(r.get("Anna Weber")!)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    });
    it("lässt eine Krankmeldung den Urlaub überschreiben, nicht umgekehrt", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-09-21", to_date: "2026-09-22" }],
            krankmeldungen: [{ sick_staff_name: "Anna Weber", sick_date: "2026-09-21" }],
            nameByStaffId: namen, von: "2026-09-20", bis: "2026-09-25",
        });
        expect(r.get("Anna Weber")).toEqual({
            "2026-09-21": "Krankmeldung", "2026-09-22": "Urlaub",
        });
    });
    it("überspringt Urlaube unbekannter Personen, statt zu raten", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "unbekannt", from_date: "2026-09-21", to_date: "2026-09-21" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-20", bis: "2026-09-25",
        });
        expect(r.size).toBe(0);
    });
    it("dreht sich bei einem verdrehten Zeitraum nicht fest", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-09-25", to_date: "2026-09-20" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-19", bis: "2026-09-30",
        });
        expect(r.get("Anna Weber")).toBeUndefined();
    });
    it("hält zwei Personen auseinander", () => {
        const r = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p2", from_date: "2026-09-21", to_date: "2026-09-21" }],
            krankmeldungen: [], nameByStaffId: namen, von: "2026-09-20", bis: "2026-09-25",
        });
        expect(r.get("Bert Kral")).toEqual({ "2026-09-21": "Urlaub" });
        expect(r.get("Anna Weber")).toBeUndefined();
    });
});
describe("isoWeekRange", () => {
    it("liefert Montag bis Sonntag, auch wenn der Tag ein Sonntag ist", () => {
        expect(isoWeekRange("2026-09-20")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    });
    it("liefert für den Montag selbst dieselbe Woche", () => {
        expect(isoWeekRange("2026-09-14")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    });
});
describe("shiftMinutesLocal", () => {
    it("rechnet über Mitternacht", () => {
        expect(shiftMinutesLocal({ start_time: "22:00", end_time: "06:00", shift_type: "nacht" })).toBe(8 * 60);
    });
    it("greift auf die Vorgabezeiten zurück, wenn keine gesetzt sind", () => {
        expect(shiftMinutesLocal({ start_time: null, end_time: null, shift_type: "spaet" })).toBe(8 * 60);
    });
});
