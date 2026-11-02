import { describe, expect, it } from "vitest";
import { addDaysISO, berlinTodayISO, daysInclusive, fromISODate, isISODate, toLocalISODate } from "./date";
describe("toLocalISODate", () => {
    it("gibt den lokalen Kalendertag zurück, nicht den UTC-Tag", () => {
        const d = new Date(2026, 6, 30, 0, 0, 0);
        expect(toLocalISODate(d)).toBe("2026-07-30");
    });
    it("bleibt kurz nach Mitternacht auf dem richtigen Tag (Nachtdienst-Fenster)", () => {
        const d = new Date(2026, 6, 30, 0, 30, 0);
        expect(toLocalISODate(d)).toBe("2026-07-30");
    });
    it("bleibt kurz vor Mitternacht auf dem richtigen Tag", () => {
        const d = new Date(2026, 6, 30, 23, 45, 0);
        expect(toLocalISODate(d)).toBe("2026-07-30");
    });
    it("füllt Monat und Tag zweistellig auf", () => {
        expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
    it("behandelt den Jahreswechsel korrekt", () => {
        expect(toLocalISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
        expect(toLocalISODate(new Date(2027, 0, 1, 0, 1))).toBe("2027-01-01");
    });
});
describe("fromISODate", () => {
    it("ist die Umkehrung von toLocalISODate", () => {
        for (const iso of ["2026-01-01", "2026-03-29", "2026-07-30", "2026-10-25", "2026-12-31"]) {
            expect(toLocalISODate(fromISODate(iso))).toBe(iso);
        }
    });
    it("erzeugt lokale Mitternacht", () => {
        const d = fromISODate("2026-07-30");
        expect(d.getHours()).toBe(0);
        expect(d.getDate()).toBe(30);
        expect(d.getMonth()).toBe(6);
    });
});
describe("addDaysISO", () => {
    it("zählt Tage vorwärts und rückwärts", () => {
        expect(addDaysISO("2026-07-30", 1)).toBe("2026-07-31");
        expect(addDaysISO("2026-07-30", 2)).toBe("2026-08-01");
        expect(addDaysISO("2026-07-30", -1)).toBe("2026-07-29");
    });
    it("überschreitet Monats- und Jahresgrenzen", () => {
        expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    });
    it("driftet über eine Sommerzeit-Umstellung nicht ab", () => {
        expect(addDaysISO("2026-03-28", 1)).toBe("2026-03-29");
        expect(addDaysISO("2026-03-29", 1)).toBe("2026-03-30");
        expect(addDaysISO("2026-10-24", 1)).toBe("2026-10-25");
        expect(addDaysISO("2026-10-25", 1)).toBe("2026-10-26");
    });
    it("bleibt über 400 Tage hinweg konsistent", () => {
        let iso = "2026-01-01";
        for (let i = 0; i < 400; i++)
            iso = addDaysISO(iso, 1);
        expect(iso).toBe("2027-02-05");
    });
});
describe("berlinTodayISO", () => {
    it("liefert den Berliner Kalendertag, auch wenn der Prozess in UTC läuft", () => {
        expect(berlinTodayISO(new Date("2026-07-30T23:30:00Z"))).toBe("2026-07-31");
    });
    it("liefert im Winter den Berliner Tag (CET)", () => {
        expect(berlinTodayISO(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    });
    it("gibt das Format YYYY-MM-DD zurück", () => {
        expect(berlinTodayISO(new Date("2026-07-30T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
describe("isISODate", () => {
    it("akzeptiert gültige Kalendertage", () => {
        expect(isISODate("2026-08-29")).toBe(true);
        expect(isISODate("2028-02-29")).toBe(true);
    });
    it("weist Nicht-Strings und falsche Formate ab", () => {
        expect(isISODate(null)).toBe(false);
        expect(isISODate(undefined)).toBe(false);
        expect(isISODate(20260829)).toBe(false);
        expect(isISODate("29.08.2026")).toBe(false);
        expect(isISODate("2026-8-29")).toBe(false);
        expect(isISODate("")).toBe(false);
    });
    it("weist Tage ab, die es im Kalender nicht gibt", () => {
        expect(isISODate("2026-02-30")).toBe(false);
        expect(isISODate("2026-13-01")).toBe(false);
        expect(isISODate("2026-00-10")).toBe(false);
        expect(isISODate("2026-04-31")).toBe(false);
        expect(isISODate("2027-02-29")).toBe(false);
    });
});
describe("daysInclusive", () => {
    it("zählt beide Randtage mit", () => {
        expect(daysInclusive("2026-09-01", "2026-09-01")).toBe(1);
        expect(daysInclusive("2026-09-01", "2026-09-05")).toBe(5);
    });
    it("gibt bei verdrehtem Zeitraum 0 statt einer negativen Zahl zurück", () => {
        expect(daysInclusive("2026-09-05", "2026-09-01")).toBe(0);
        expect(daysInclusive("2026-09-01", "2025-09-01")).toBe(0);
    });
    it("gibt bei ungültigen Eingaben 0 zurück", () => {
        expect(daysInclusive("", "2026-09-01")).toBe(0);
        expect(daysInclusive("2026-02-30", "2026-09-01")).toBe(0);
    });
    it("driftet über die Sommerzeit-Umstellung nicht ab", () => {
        expect(daysInclusive("2026-03-28", "2026-03-30")).toBe(3);
        expect(daysInclusive("2026-10-24", "2026-10-26")).toBe(3);
    });
    it("rechnet über Jahresgrenzen korrekt", () => {
        expect(daysInclusive("2026-01-01", "2026-12-31")).toBe(365);
        expect(daysInclusive("2028-01-01", "2028-12-31")).toBe(366);
    });
});
import { monatsBereichISO, berlinMonatsBereich, berlinTagISO, utcTagISO } from "./date";
describe("Monats- und Tageshelfer (Berlin statt UTC)", () => {
    it("monatsBereichISO kennt Monatslängen, Schaltjahr und Überlauf", () => {
        expect(monatsBereichISO(2026, 9)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
        expect(monatsBereichISO(2028, 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
        expect(monatsBereichISO(2026, 12)).toEqual({ from: "2027-01-01", to: "2027-01-31" });
        expect(monatsBereichISO(2026, -1)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    });
    it("berlinMonatsBereich: 00:30 Uhr am Monatsersten ist schon der neue Monat", () => {
        expect(berlinMonatsBereich(new Date("2026-10-31T23:30:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
        expect(berlinMonatsBereich(new Date("2026-10-31T23:30:00Z"), 1)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    });
    it("berlinTagISO rechnet vom Berliner Tag aus", () => {
        expect(berlinTagISO(0, new Date("2026-10-11T23:30:00Z"))).toBe("2026-10-12");
        expect(berlinTagISO(-30, new Date("2026-10-11T23:30:00Z"))).toBe("2026-09-12");
    });
    it("utcTagISO ist der UTC-Tag", () => {
        expect(utcTagISO(Date.UTC(2026, 0, 31, 12))).toBe("2026-01-31");
    });
});
import { isoWeekRange, zeitumstellungMinuten } from "./date";
import { shiftHours } from "./scheduling/generate-plan-core";
import { shiftMinutes } from "./ai-guardrails";
import { schichtMinuten } from "./scheduling/eignung";
describe("isoWeekRange", () => {
    it("Montag bis Sonntag, auch über Sonntag, Jahreswechsel und Zeitumstellung", () => {
        expect(isoWeekRange("2026-10-11")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
        expect(isoWeekRange("2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-18" });
        expect(isoWeekRange("2027-01-01")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
        expect(isoWeekRange("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    });
});
import { daysUntil } from "./utils";
describe("daysUntil (Kalendertage)", () => {
    it("zählt Kalendertage, unabhängig von der Uhrzeit", () => {
        expect(daysUntil("2026-10-11", "2026-10-11")).toBe(0);
        expect(daysUntil("2026-10-10", "2026-10-11")).toBe(-1);
        expect(daysUntil("2027-01-09", "2026-10-11")).toBe(90);
        expect(daysUntil("2026-10-25T05:00:00", "2026-10-24")).toBe(1);
        expect(daysUntil(null)).toBeNull();
        expect(daysUntil("kaputt")).toBeNull();
    });
});
describe("zeitumstellungMinuten — Nachtdienst in der Nacht der Umstellung", () => {
    it("Sommerzeit (29.03.2026): 22–6 Uhr dauert 7 Stunden", () => {
        expect(zeitumstellungMinuten("2026-03-28", "22:00", "06:00")).toBe(-60);
        expect(shiftHours({ date: "2026-03-28", start_time: "22:00", end_time: "06:00", shift_type: "nacht" })).toBe(7);
    });
    it("Winterzeit (25.10.2026): 22–6 Uhr dauert 9 Stunden", () => {
        expect(zeitumstellungMinuten("2026-10-24", "22:00", "06:00")).toBe(60);
        expect(shiftHours({ date: "2026-10-24", start_time: "22:00", end_time: "06:00", shift_type: "nacht" })).toBe(9);
    });
    it("ein Dienst, der am Umstellungssonntag erst nach 3 Uhr beginnt, bleibt unverändert", () => {
        expect(zeitumstellungMinuten("2026-10-25", "06:00", "14:00")).toBe(0);
        expect(zeitumstellungMinuten("2026-03-29", "14:00", "22:00")).toBe(0);
    });
    it("andere Nächte und Tage ohne Datum bleiben unverändert", () => {
        expect(zeitumstellungMinuten("2026-10-17", "22:00", "06:00")).toBe(0);
        expect(zeitumstellungMinuten("2026-10-25", "22:00", "06:00")).toBe(0);
        expect(zeitumstellungMinuten(null, "22:00", "06:00")).toBe(0);
        expect(shiftHours({ start_time: "22:00", end_time: "06:00", shift_type: "nacht" })).toBe(8);
    });
    it("gilt auch für die Prüfregeln und die Eignung (Wochenstunden)", () => {
        expect(shiftMinutes({ id: "a", date: "2026-10-24", shift_type: "nacht", station: "x" } as Parameters<typeof shiftMinutes>[0])).toBe(9 * 60);
        expect(schichtMinuten({ id: "a", date: "2026-03-28", shift_type: "nacht", start_time: "22:00", end_time: "06:00", station: "x" } as Parameters<typeof schichtMinuten>[0])).toBe(7 * 60);
    });
    it("2027 liegen die Umstellungen auf dem 28.03. und 31.10.", () => {
        expect(zeitumstellungMinuten("2027-03-27", "23:00", "07:00")).toBe(-60);
        expect(zeitumstellungMinuten("2027-10-30", "20:00", "08:00")).toBe(60);
    });
});
