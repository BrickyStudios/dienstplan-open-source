import { describe, expect, it } from "vitest";
import { easter, getGermanHolidays, isGermanHoliday } from "./holidays";
describe("easter", () => {
    const BEKANNT: Record<number, string> = {
        2024: "2024-03-31",
        2025: "2025-04-20",
        2026: "2026-04-05",
        2027: "2027-03-28",
        2030: "2030-04-21",
    };
    it("trifft den Ostersonntag", () => {
        for (const [jahr, erwartet] of Object.entries(BEKANNT)) {
            const d = easter(Number(jahr));
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            expect(iso, `Ostern ${jahr}`).toBe(erwartet);
        }
    });
    it("fällt immer auf einen Sonntag", () => {
        for (let jahr = 2024; jahr <= 2040; jahr++) {
            expect(easter(jahr).getDay(), `Ostern ${jahr}`).toBe(0);
        }
    });
});
describe("getGermanHolidays", () => {
    it("legt die beweglichen Feiertage 2026 auf den richtigen Tag", () => {
        const h = getGermanHolidays(2026);
        expect(h.has("2026-04-03"), "Karfreitag").toBe(true);
        expect(h.has("2026-04-05"), "Ostersonntag").toBe(true);
        expect(h.has("2026-04-06"), "Ostermontag").toBe(true);
        expect(h.has("2026-05-14"), "Christi Himmelfahrt").toBe(true);
        expect(h.has("2026-05-24"), "Pfingstsonntag").toBe(true);
        expect(h.has("2026-05-25"), "Pfingstmontag").toBe(true);
        expect(h.has("2026-06-04"), "Fronleichnam").toBe(true);
    });
    it("verschiebt sie NICHT um einen Tag nach vorn", () => {
        const h = getGermanHolidays(2026);
        expect(h.has("2026-04-02"), "Gründonnerstag ist kein Feiertag").toBe(false);
        expect(h.has("2026-04-04"), "Karsamstag ist kein Feiertag").toBe(false);
        expect(h.has("2026-05-13"), "Tag vor Himmelfahrt").toBe(false);
        expect(h.has("2026-06-03"), "Tag vor Fronleichnam").toBe(false);
    });
    it("kennt die festen Feiertage", () => {
        const h = getGermanHolidays(2027);
        for (const tag of ["2027-01-01", "2027-05-01", "2027-10-03", "2027-12-25", "2027-12-26"]) {
            expect(h.has(tag), tag).toBe(true);
        }
    });
    it("stimmt auch in einem Jahr mit früher Ostern", () => {
        const h = getGermanHolidays(2027);
        expect(h.has("2027-03-26"), "Karfreitag 2027").toBe(true);
        expect(h.has("2027-03-29"), "Ostermontag 2027").toBe(true);
        expect(h.has("2027-03-25"), "Gründonnerstag 2027 ist kein Feiertag").toBe(false);
    });
});
describe("isGermanHoliday", () => {
    it("beantwortet die Frage für einzelne Tage", () => {
        expect(isGermanHoliday("2026-04-03")).toBe(true);
        expect(isGermanHoliday("2026-04-02")).toBe(false);
        expect(isGermanHoliday("2026-12-25")).toBe(true);
        expect(isGermanHoliday("2026-09-22")).toBe(false);
    });
    it("hängt nicht davon ab, welche Zeitzone der Prozess hat", () => {
        expect(isGermanHoliday("2026-04-03")).toBe(isGermanHoliday("2026-04-03"));
        const jahr = new Date("2026-04-03T23:59:59").getFullYear();
        expect(jahr).toBe(2026);
    });
});
