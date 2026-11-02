import { describe, it, expect } from "vitest";
import { naechsteTermine, faelligeErinnerungen, pflichtenOhneTermin } from "./meldepflichten";
describe("naechsteTermine", () => {
    it("Krankenhaus am 05.10.2026: PpUG Q3 zum 15.10., PPBV Q3 zum 31.10., Jahresmeldungen 2027", () => {
        const t = naechsteTermine("2026-10-05", "ppbv");
        const nach = Object.fromEntries(t.map((x) => [x.pflicht.id, x]));
        expect(nach["ppug-quartal"]).toMatchObject({ datum: "2026-10-15", zeitraum: "3. Quartal 2026", tageBis: 10 });
        expect(nach["ppug-quartal"]!.export).toBe("/api/leitung/ppug-zulieferung?year=2026&quartal=3");
        expect(nach["ppbv-quartal"]).toMatchObject({ datum: "2026-10-31", zeitraum: "3. Quartal 2026" });
        expect(nach["ppug-jahr"]).toMatchObject({ datum: "2027-06-30", zeitraum: "Jahr 2026" });
        expect(t[0]!.pflicht.id).toBe("ppug-quartal");
    });
    it("nach dem 15.10. springt PpUG auf das vierte Quartal im Januar", () => {
        const t = naechsteTermine("2026-10-16", "ppbv").find((x) => x.pflicht.id === "ppug-quartal")!;
        expect(t).toMatchObject({ datum: "2027-01-15", zeitraum: "4. Quartal 2026" });
    });
    it("PPBV im Februar eines Schaltjahrs: Q4 fällig am 31.01., Q1 am 30.04.", () => {
        const t = naechsteTermine("2028-02-01", "ppbv").find((x) => x.pflicht.id === "ppbv-quartal")!;
        expect(t.datum).toBe("2028-04-30");
    });
    it("der Stichtag selbst ist noch offen", () => {
        const t = naechsteTermine("2026-10-15", "ppbv").find((x) => x.pflicht.id === "ppug-quartal")!;
        expect(t.tageBis).toBe(0);
    });
    it("Pflegeeinrichtung hat keine festen Termine, aber den Nachweis auf Verlangen", () => {
        expect(naechsteTermine("2026-10-05", "pebem")).toEqual([]);
        expect(pflichtenOhneTermin("pebem").map((p) => p.id)).toEqual(["pebem"]);
        expect(naechsteTermine("2026-10-05", "none")).toEqual([]);
    });
});
describe("faelligeErinnerungen", () => {
    it("erinnert 21, 7 und 1 Tag vorher", () => {
        expect(faelligeErinnerungen("2026-09-24", "ppbv").map((t) => t.pflicht.id)).toEqual(["ppug-quartal"]);
        expect(faelligeErinnerungen("2026-10-08", "ppbv").map((t) => t.pflicht.id)).toEqual(["ppug-quartal"]);
        expect(faelligeErinnerungen("2026-10-30", "ppbv").map((t) => t.pflicht.id)).toEqual(["ppbv-quartal"]);
        expect(faelligeErinnerungen("2026-10-05", "ppbv")).toEqual([]);
    });
});
