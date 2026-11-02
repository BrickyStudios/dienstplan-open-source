import { describe, expect, it } from "vitest";
import { PRAXIS_BEGRIFFE, praxisText } from "@/lib/praxis-begriffe";
describe("Praxis-Begriffe", () => {
    it("kein Praxis-Text spricht von Station, Springer oder Pflegeleitung", () => {
        const falsch = Object.entries(PRAXIS_BEGRIFFE)
            .filter(([, f]) => /Station|Springer|Pflegeleitung|Pflegedienst/.test(f!.de))
            .map(([k]) => k);
        expect(falsch).toEqual([]);
    });
    it("liefert die Sprache, die es gibt, und sonst nichts", () => {
        expect(praxisText("fp.title", "de")).toBe("Krankmeldung & Vertretung");
        expect(praxisText("fp.title", "en")).toBe("Sick calls & cover");
        expect(praxisText("fp.title", "tr")).toBeUndefined();
        expect(praxisText("nav.support", "de")).toBeUndefined();
    });
});
