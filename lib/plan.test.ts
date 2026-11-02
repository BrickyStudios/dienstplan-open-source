import { describe, it, expect } from "vitest";
import { AKTIVE_PLAENE, ALL_PLANS, SELECTABLE_PLANS, istAktiverPlan, normalizePlan, planFuerNeueEinrichtung, planFuerNeuanlage, planAusZeile, getPlanCapabilities, } from "./plan";
describe("aktive Einrichtungstypen", () => {
    it("nur Praxis ist aktiv und wählbar", () => {
        expect(AKTIVE_PLAENE).toEqual(["praxis"]);
        expect(SELECTABLE_PLANS).toEqual(AKTIVE_PLAENE);
        expect(istAktiverPlan("praxis")).toBe(true);
        expect(istAktiverPlan("klinik")).toBe(false);
        expect(istAktiverPlan("pflege")).toBe(false);
    });
    it("ruhende Typen bleiben vollständig im Code", () => {
        expect(ALL_PLANS).toEqual(["klinik", "pflege", "praxis"]);
        expect(getPlanCapabilities("klinik").ppbv).toBe(true);
        expect(getPlanCapabilities("pflege").compliance.framework).toBe("pebem");
    });
});
describe("neue Einrichtung", () => {
    it("entsteht als Praxis", () => {
        expect(planFuerNeueEinrichtung()).toBe("praxis");
    });
    it.each([null, undefined, "", "klinik", "pflege", "station", "quatsch"])("Roh-Wert %s wird zum aktiven Typ", raw => expect(planFuerNeuanlage(raw)).toBe("praxis"));
    it("ein aktiver Typ bleibt", () => {
        expect(planFuerNeuanlage("praxis")).toBe("praxis");
    });
});
describe("bestehende Einrichtung beim Lesen", () => {
    it("ohne Settings-Zeile gilt der aktive Typ, nicht Klinik", () => {
        expect(planAusZeile(null)).toBe("praxis");
        expect(planAusZeile(undefined)).toBe("praxis");
    });
    it("eine vorhandene Zeile behält ihren Typ", () => {
        expect(planAusZeile({ plan: "klinik" })).toBe("klinik");
        expect(planAusZeile({ plan: "pflege" })).toBe("pflege");
        expect(planAusZeile({ plan: "praxis" })).toBe("praxis");
    });
    it("Alt-Wert und leerer Typ in einer vorhandenen Zeile bleiben Klinik (wie normalizePlan)", () => {
        expect(planAusZeile({ plan: "station" })).toBe("klinik");
        expect(planAusZeile({ plan: null })).toBe(normalizePlan(null));
    });
});
