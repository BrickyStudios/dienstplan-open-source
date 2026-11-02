import { describe, expect, it } from "vitest";
import { checkFlextimeRequest, daysWithin, isoWeekStart, monthEnd, monthsTouched, weeksTouched } from "./flextime";
const base = {
    hoursPerDay: 8,
    balanceHours: 100,
    limits: {},
    existing: [] as {
        from_date: string;
        to_date: string;
    }[],
};
describe("isoWeekStart", () => {
    it("liefert den Montag der Woche", () => {
        expect(isoWeekStart("2026-08-26")).toBe("2026-08-24");
        expect(isoWeekStart("2026-08-24")).toBe("2026-08-24");
        expect(isoWeekStart("2026-08-30")).toBe("2026-08-24");
    });
});
describe("monthEnd", () => {
    it("kennt die Monatslängen inklusive Schaltjahr", () => {
        expect(monthEnd("2026-02-01")).toBe("2026-02-28");
        expect(monthEnd("2028-02-01")).toBe("2028-02-29");
        expect(monthEnd("2026-08-01")).toBe("2026-08-31");
        expect(monthEnd("2026-09-01")).toBe("2026-09-30");
    });
});
describe("weeksTouched / monthsTouched", () => {
    it("erfasst alle berührten Wochen", () => {
        expect(weeksTouched("2026-08-26", "2026-09-02")).toEqual(["2026-08-24", "2026-08-31"]);
        expect(weeksTouched("2026-08-25", "2026-08-26")).toEqual(["2026-08-24"]);
    });
    it("erfasst alle berührten Monate, auch über den Jahreswechsel", () => {
        expect(monthsTouched("2026-08-28", "2026-10-02")).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
        expect(monthsTouched("2026-12-30", "2027-01-02")).toEqual(["2026-12-01", "2027-01-01"]);
    });
});
describe("daysWithin", () => {
    it("schneidet bestehende Anträge auf das Fenster zu", () => {
        const reqs = [{ from_date: "2026-08-28", to_date: "2026-09-03" }];
        expect(daysWithin(reqs, "2026-08-01", "2026-08-31")).toBe(4);
        expect(daysWithin(reqs, "2026-09-01", "2026-09-30")).toBe(3);
    });
    it("ignoriert Anträge außerhalb des Fensters", () => {
        expect(daysWithin([{ from_date: "2026-07-01", to_date: "2026-07-05" }], "2026-08-01", "2026-08-31")).toBe(0);
    });
});
describe("checkFlextimeRequest — Guthaben", () => {
    it("lässt einen gedeckten Antrag durch und rechnet die Stunden aus", () => {
        const r = checkFlextimeRequest({ ...base, fromDate: "2026-09-01", toDate: "2026-09-02" });
        expect(r).toEqual({ ok: true, hours: 16 });
    });
    it("lehnt einen Antrag ohne Deckung ab (kein negatives Konto)", () => {
        const r = checkFlextimeRequest({ ...base, balanceHours: 8, fromDate: "2026-09-01", toDate: "2026-09-02" });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.error).toContain("Nicht genug Gleitzeitguthaben");
    });
    it("akzeptiert exakt aufgebrauchtes Guthaben", () => {
        expect(checkFlextimeRequest({ ...base, balanceHours: 16, fromDate: "2026-09-01", toDate: "2026-09-02" }).ok).toBe(true);
    });
    it("rechnet mit der einrichtungseigenen Stundenzahl pro Tag", () => {
        const r = checkFlextimeRequest({ ...base, hoursPerDay: 6, fromDate: "2026-09-01", toDate: "2026-09-01" });
        expect(r).toEqual({ ok: true, hours: 6 });
    });
    it("weist einen verdrehten Zeitraum ab", () => {
        expect(checkFlextimeRequest({ ...base, fromDate: "2026-09-05", toDate: "2026-09-01" }).ok).toBe(false);
    });
});
describe("checkFlextimeRequest — Limits", () => {
    it("greift beim Wochenlimit", () => {
        const r = checkFlextimeRequest({
            ...base, limits: { maxDaysPerWeek: 1 },
            fromDate: "2026-08-25", toDate: "2026-08-26",
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.error).toContain("pro Woche");
    });
    it("zählt bestehende Anträge derselben Woche mit", () => {
        const r = checkFlextimeRequest({
            ...base, limits: { maxDaysPerWeek: 2 },
            existing: [{ from_date: "2026-08-24", to_date: "2026-08-25" }],
            fromDate: "2026-08-26", toDate: "2026-08-26",
        });
        expect(r.ok).toBe(false);
    });
    it("prüft jede berührte Woche einzeln, nicht nur die erste", () => {
        expect(checkFlextimeRequest({
            ...base, limits: { maxDaysPerWeek: 2 },
            fromDate: "2026-08-29", toDate: "2026-09-01",
        }).ok).toBe(true);
        expect(checkFlextimeRequest({
            ...base, limits: { maxDaysPerWeek: 1 },
            fromDate: "2026-08-29", toDate: "2026-09-01",
        }).ok).toBe(false);
    });
    it("greift beim Monatslimit", () => {
        const r = checkFlextimeRequest({
            ...base, limits: { maxDaysPerMonth: 2 },
            existing: [{ from_date: "2026-09-01", to_date: "2026-09-02" }],
            fromDate: "2026-09-10", toDate: "2026-09-10",
        });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.error).toContain("September");
    });
    it("behandelt fehlende Limits als unbegrenzt", () => {
        expect(checkFlextimeRequest({
            ...base, balanceHours: 1000, limits: { maxDaysPerWeek: null, maxDaysPerMonth: undefined },
            fromDate: "2026-09-01", toDate: "2026-09-20",
        }).ok).toBe(true);
    });
});
