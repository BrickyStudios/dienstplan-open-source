import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { decideSwapScope } from "./swap-scope";
const WURZEL = join(__dirname, "..");
const lies = (...teile: string[]) => readFileSync(join(WURZEL, ...teile), "utf8");
describe("Die Entscheidung", () => {
    it("lässt ohne Überschreibung die Einrichtung entscheiden", () => {
        const s = decideSwapScope({ mode: "manual", stationOverride: null, bereichOverrides: [] });
        expect(s.enabled).toBe(true);
        expect(s.source).toBe("einrichtung");
        expect(s.staffMayInitiate).toBe(true);
    });
    it("sperrt, wenn die Station ausdrücklich sperrt", () => {
        const s = decideSwapScope({ mode: "manual", stationOverride: false, bereichOverrides: [] });
        expect(s.enabled).toBe(false);
        expect(s.staffMayInitiate).toBe(false);
        expect(s.reason).toContain("Station");
    });
    it("sperrt, wenn ein Bereich sperrt — auch wenn die Station erlaubt", () => {
        const s = decideSwapScope({ mode: "manual", stationOverride: true, bereichOverrides: [false] });
        expect(s.enabled).toBe(false);
        expect(s.source).toBe("bereich");
    });
    it("unterscheidet 'nicht entschieden' von 'verboten'", () => {
        const offen = decideSwapScope({ mode: "manual", stationOverride: null, bereichOverrides: [] });
        const verboten = decideSwapScope({ mode: "manual", stationOverride: false, bereichOverrides: [] });
        expect(offen.enabled).toBe(true);
        expect(verboten.enabled).toBe(false);
    });
    it("lässt bei 'leitung_only' niemanden selbst anstoßen, sperrt aber nicht", () => {
        const s = decideSwapScope({ mode: "leitung_only", stationOverride: null, bereichOverrides: [] });
        expect(s.enabled).toBe(true);
        expect(s.staffMayInitiate).toBe(false);
        expect(s.reason).toContain("Leitung");
    });
    it("sagt bei erlaubtem Tausch nichts — ein leerer Grund ist der Normalfall", () => {
        const s = decideSwapScope({ mode: "automatic", stationOverride: true, bereichOverrides: [] });
        expect(s.reason).toBe("");
    });
});
describe("Wer die Regel wirklich fragt", () => {
    const STELLEN = [
        ["app/api/mitarbeiter/shift-release/route.ts", "Schichtabgabe"],
        ["app/api/mitarbeiter/shift-swap-requests/route.ts", "Tausch-Anfrage"],
        ["app/api/mitarbeiter/shift-swap-eligible/route.ts", "Partner-Picker"],
    ] as const;
    for (const [pfad, was] of STELLEN) {
        it(`${was} löst den Geltungsbereich auf (${pfad})`, () => {
            const quelle = lies(pfad);
            expect(quelle, "muss lib/swap-scope benutzen statt selbst zu entscheiden").toMatch(/from "@\/lib\/swap-scope"/);
            expect(quelle).toMatch(/staffMayInitiate/);
        });
    }
    it("liest den Modus nicht mehr an der Tausch-Route vorbei aus der Einrichtung", () => {
        const quelle = lies("app/api/mitarbeiter/shift-swap-requests/route.ts");
        expect(quelle.includes('select("shift_swap_mode")'), "shift_swap_mode gehört über resolveSwapScope gelesen, nicht direkt").toBe(false);
    });
});
describe("Der Weg, Station und Bereich umzustellen", () => {
    const EBENEN = [
        ["Station", "components/StationManager.tsx", "app/api/leitung/stations/route.ts"],
        ["Bereich", "components/BereicheManager.tsx", "app/api/bereiche/route.ts"],
    ] as const;
    for (const [ebene, komponente, route] of EBENEN) {
        it(`${ebene}: der Schalter existiert in der Oberfläche`, () => {
            const quelle = lies(komponente);
            expect(quelle).toMatch(/shift_swap_enabled/);
            expect(quelle).toMatch(/toggleSwapScope/);
        });
        it(`${ebene}: beim Speichern bleiben die drei Zustände — kein Boolean()`, () => {
            expect(lies(route)).toMatch(/shift_swap_enabled === null \? null : Boolean\(shift_swap_enabled\)/);
        });
    }
});
