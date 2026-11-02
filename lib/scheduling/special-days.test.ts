import { describe, it, expect } from "vitest";
import { utcTagISO } from "@/lib/date";
import { resolveOccurrence, isSpecialDayActiveOn, matchSpecialDays, specialDayMultiplier, makeSpecialDayId, isGermanState, sanitizeSpecialDays, GERMAN_STATES, SEED_SPECIAL_DAYS, type SpecialDay, } from "./special-days";
const fixedSilvester: SpecialDay = {
    id: "silvester", name: "Silvester", kind: "fixed", month: 12, day: 31,
    demandMultiplier: 1.4, status: "active", source: "seed",
};
const computedRosenmontag: SpecialDay = {
    id: "rosenmontag", name: "Karneval (Rosenmontag)", kind: "computed",
    easterOffsetDays: -48, dateRangeDays: 1,
    demandMultiplier: 1.3, status: "active", source: "seed",
};
const regionalOktoberfest: SpecialDay = {
    id: "oktoberfest", name: "Oktoberfest", kind: "regional",
    bundeslaender: ["Bayern"], month: 9, day: 20, dateRangeDays: 16,
    demandMultiplier: 1.3, status: "active", source: "seed",
};
describe("resolveOccurrence — Ostern-Berechnung (Rosenmontag)", () => {
    it("berechnet Rosenmontag 2027 korrekt (bekanntes Referenzdatum: 08.02.2027)", () => {
        const occ = resolveOccurrence(computedRosenmontag, 2027);
        expect(occ).not.toBeNull();
        expect(utcTagISO(occ!.start)).toBe("2027-02-08");
        expect(utcTagISO(occ!.end)).toBe("2027-02-08");
    });
    it("berechnet Rosenmontag für ein zweites bekanntes Jahr (2024: 12.02.2024)", () => {
        const occ = resolveOccurrence(computedRosenmontag, 2024);
        expect(utcTagISO(occ!.start)).toBe("2024-02-12");
    });
    it("verlängert um dateRangeDays ab dem berechneten Datum", () => {
        const sd: SpecialDay = { ...regionalOktoberfest };
        const occ = resolveOccurrence(sd, 2026);
        expect(utcTagISO(occ!.start)).toBe("2026-09-20");
        expect(utcTagISO(occ!.end)).toBe("2026-10-05");
    });
    it("löst ein einzelnes date (learned/manuell) auf, ohne month/day/easterOffsetDays", () => {
        const sd: SpecialDay = {
            id: "stadtfest", name: "Stadtfest", kind: "learned", date: "2025-06-14",
            demandMultiplier: 1.2, status: "pending", source: "learned",
        };
        const occ = resolveOccurrence(sd, 2025);
        expect(utcTagISO(occ!.start)).toBe("2025-06-14");
    });
    it("liefert null ohne auswertbares Datum", () => {
        const sd: SpecialDay = { id: "x", name: "X", kind: "fixed", demandMultiplier: 1, status: "active", source: "leitung" };
        expect(resolveOccurrence(sd, 2026)).toBeNull();
    });
});
describe("isSpecialDayActiveOn", () => {
    it("erkennt Silvester jedes Jahr", () => {
        expect(isSpecialDayActiveOn(fixedSilvester, "2026-12-31")).toBe(true);
        expect(isSpecialDayActiveOn(fixedSilvester, "2030-12-31")).toBe(true);
        expect(isSpecialDayActiveOn(fixedSilvester, "2026-12-30")).toBe(false);
        expect(isSpecialDayActiveOn(fixedSilvester, "2027-01-01")).toBe(false);
    });
    it("erkennt einen Tag innerhalb des Oktoberfest-Zeitraums, aber nicht davor/danach", () => {
        expect(isSpecialDayActiveOn(regionalOktoberfest, "2026-09-20")).toBe(true);
        expect(isSpecialDayActiveOn(regionalOktoberfest, "2026-09-30")).toBe(true);
        expect(isSpecialDayActiveOn(regionalOktoberfest, "2026-10-05")).toBe(true);
        expect(isSpecialDayActiveOn(regionalOktoberfest, "2026-10-06")).toBe(false);
        expect(isSpecialDayActiveOn(regionalOktoberfest, "2026-09-19")).toBe(false);
    });
});
describe("matchSpecialDays — regionale Filterung", () => {
    const specialDays = [fixedSilvester, regionalOktoberfest];
    it("regional eingeschränkter Eintrag greift nur im passenden Bundesland", () => {
        expect(matchSpecialDays("2026-09-25", specialDays, "Bayern")).toEqual([regionalOktoberfest]);
        expect(matchSpecialDays("2026-09-25", specialDays, "Berlin")).toEqual([]);
        expect(matchSpecialDays("2026-09-25", specialDays, null)).toEqual([]);
    });
    it("bundesweiter Eintrag (kein bundeslaender-Feld) greift überall, auch ohne bundesland", () => {
        expect(matchSpecialDays("2026-12-31", specialDays, null)).toEqual([fixedSilvester]);
        expect(matchSpecialDays("2026-12-31", specialDays, "Saarland")).toEqual([fixedSilvester]);
    });
    it("ignoriert status='pending' (gelernte, noch nicht bestätigte Einträge)", () => {
        const pending: SpecialDay = { ...fixedSilvester, id: "p", status: "pending" };
        expect(matchSpecialDays("2026-12-31", [pending], null)).toEqual([]);
    });
    it("liefert leeres Array ohne Konfiguration", () => {
        expect(matchSpecialDays("2026-12-31", null, "Bayern")).toEqual([]);
        expect(matchSpecialDays("2026-12-31", [], "Bayern")).toEqual([]);
    });
});
describe("specialDayMultiplier", () => {
    it("liefert 1 ohne zutreffenden Sondertag", () => {
        expect(specialDayMultiplier("2026-05-01", [fixedSilvester], null)).toBe(1);
    });
    it("liefert den demandMultiplier des zutreffenden Sondertags", () => {
        expect(specialDayMultiplier("2026-12-31", [fixedSilvester], null)).toBe(1.4);
    });
    it("liefert den HÖCHSTEN Multiplikator, wenn mehrere Sondertage überlappen", () => {
        const strongerRegional: SpecialDay = {
            id: "silvester-nrw", name: "Silvester (verstärkt NRW)", kind: "regional",
            bundeslaender: ["Nordrhein-Westfalen"], month: 12, day: 31,
            demandMultiplier: 1.8, status: "active", source: "leitung",
        };
        expect(specialDayMultiplier("2026-12-31", [fixedSilvester, strongerRegional], "Nordrhein-Westfalen")).toBe(1.8);
        expect(specialDayMultiplier("2026-12-31", [fixedSilvester, strongerRegional], "Bayern")).toBe(1.4);
    });
});
describe("Bundesländer-Validierung", () => {
    it("kennt alle 16 Bundesländer, konsistent geschrieben", () => {
        expect(GERMAN_STATES).toHaveLength(16);
        expect(GERMAN_STATES).toContain("Bayern");
        expect(GERMAN_STATES).toContain("Nordrhein-Westfalen");
    });
    it("isGermanState akzeptiert nur exakte, kanonische Schreibweise", () => {
        expect(isGermanState("Bayern")).toBe(true);
        expect(isGermanState("bayern")).toBe(false);
        expect(isGermanState("BY")).toBe(false);
        expect(isGermanState("Bavaria")).toBe(false);
        expect(isGermanState(null)).toBe(false);
    });
});
describe("Seed-Vorschläge", () => {
    it("sind alle status=active, source=seed und haben einen sinnvollen Multiplikator", () => {
        for (const sd of SEED_SPECIAL_DAYS) {
            expect(sd.status).toBe("active");
            expect(sd.source).toBe("seed");
            expect(sd.demandMultiplier).toBeGreaterThan(1);
        }
    });
    it("jeder Seed-Eintrag löst zu einem konkreten Datum auf", () => {
        for (const sd of SEED_SPECIAL_DAYS) {
            expect(resolveOccurrence(sd, 2026)).not.toBeNull();
        }
    });
});
describe("makeSpecialDayId", () => {
    it("erzeugt einen stabilen Slug aus dem Namen", () => {
        expect(makeSpecialDayId("Karneval (Rosenmontag)", [])).toBe("karneval-rosenmontag");
    });
    it("vermeidet Kollisionen mit bestehenden IDs", () => {
        const existing: SpecialDay[] = [{ ...fixedSilvester, id: "silvester" }];
        expect(makeSpecialDayId("Silvester", existing)).toBe("silvester-2");
    });
});
describe("sanitizeSpecialDays (Review-Finding F8: rohe API-Eingabe klemmen)", () => {
    it("klemmt einen absurd hohen demandMultiplier auf 3.0", () => {
        const out = sanitizeSpecialDays([
            { id: "x", name: "X", kind: "fixed", month: 1, day: 1, demandMultiplier: 1e9, status: "active", source: "leitung" },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].demandMultiplier).toBe(3.0);
    });
    it("klemmt einen absurd hohen dateRangeDays auf 90 (schützt den geteilten Cron)", () => {
        const out = sanitizeSpecialDays([
            { id: "x", name: "X", kind: "fixed", month: 1, day: 1, dateRangeDays: 5000000, demandMultiplier: 1.5, status: "active", source: "leitung" },
        ]);
        expect(out[0].dateRangeDays).toBe(90);
    });
    it("verwirft Einträge ohne gültige id/name/kind/status/source", () => {
        const out = sanitizeSpecialDays([
            { name: "Ohne ID", kind: "fixed", demandMultiplier: 1.2, status: "active", source: "leitung" },
            { id: "y", name: "Ungültiger kind", kind: "irgendwas", demandMultiplier: 1.2, status: "active", source: "leitung" },
            { id: "z", name: "OK", kind: "fixed", demandMultiplier: 1.2, status: "active", source: "leitung" },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe("z");
    });
    it("filtert ungültige Bundesländer aus bundeslaender heraus", () => {
        const out = sanitizeSpecialDays([
            { id: "x", name: "X", kind: "regional", bundeslaender: ["Bayern", "Nirgendwo"], demandMultiplier: 1.3, status: "active", source: "leitung" },
        ]);
        expect(out[0].bundeslaender).toEqual(["Bayern"]);
    });
    it("kappt die Liste auf 100 Einträge", () => {
        const many = Array.from({ length: 150 }, (_, i) => ({
            id: `x${i}`, name: `X${i}`, kind: "fixed" as const, demandMultiplier: 1.2, status: "active" as const, source: "leitung" as const,
        }));
        expect(sanitizeSpecialDays(many)).toHaveLength(100);
    });
    it("liefert ein leeres Array für Nicht-Arrays", () => {
        expect(sanitizeSpecialDays(null)).toEqual([]);
        expect(sanitizeSpecialDays("nope")).toEqual([]);
        expect(sanitizeSpecialDays(undefined)).toEqual([]);
    });
});
