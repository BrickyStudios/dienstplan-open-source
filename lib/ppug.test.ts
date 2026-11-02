import { describe, it, expect } from "vitest";
import { alsTagOderNacht, meldetermin, monateDesQuartals, ppugZeilen, OFFENE_FELDER } from "./ppug";
import type { PpbvReport } from "./ppbv";
const typ = (shift_type: string, shiftsCount: number, plannedSum: number, actualSum: number, understaffedCount: number) => ({ shift_type, shiftsCount, plannedSum, actualSum, understaffedCount, fulfilledShifts: shiftsCount - understaffedCount });
const bericht = (stations: PpbvReport["stations"]): PpbvReport => ({
    year: 2026,
    month: 10,
    stations,
    totals: { shiftsCount: 0, plannedSum: 0, actualSum: 0, understaffedCount: 0, fulfilledShifts: 0, compliancePct: 0, shiftQuotePct: 0 },
});
const station = (name: string, byType: ReturnType<typeof typ>[]) => ({
    station: name,
    shiftsCount: byType.reduce((s, t) => s + t.shiftsCount, 0),
    plannedSum: byType.reduce((s, t) => s + t.plannedSum, 0),
    actualSum: byType.reduce((s, t) => s + t.actualSum, 0),
    understaffedCount: byType.reduce((s, t) => s + t.understaffedCount, 0),
    fulfilledShifts: byType.reduce((s, t) => s + t.fulfilledShifts, 0),
    compliancePct: 0,
    shiftQuotePct: 0,
    byType,
});
describe("Tag oder Nacht", () => {
    it("fasst Früh und Spät zur Tagschicht zusammen", () => {
        expect(alsTagOderNacht("frueh")).toBe("Tag");
        expect(alsTagOderNacht("spaet")).toBe("Tag");
    });
    it("lässt die Nacht die Nacht sein", () => {
        expect(alsTagOderNacht("nacht")).toBe("Nacht");
    });
    it("wirft alles Unbekannte zur Tagschicht — die Verordnung kennt keinen dritten Kasten", () => {
        expect(alsTagOderNacht("all")).toBe("Tag");
        expect(alsTagOderNacht("zwischendienst")).toBe("Tag");
    });
});
describe("ppugZeilen", () => {
    it("addiert Früh und Spät zu EINER Tagzeile", () => {
        const z = ppugZeilen(bericht([
            station("Intensiv", [typ("frueh", 30, 90, 84, 6), typ("spaet", 30, 60, 58, 2)]),
        ]));
        expect(z).toHaveLength(1);
        expect(z[0]).toMatchObject({
            station: "Intensiv", schicht: "Tag",
            schichten: 60, sollSumme: 150, istSumme: 142, unterschritten: 8,
        });
    });
    it("hält Tag und Nacht getrennt — das ist die Gliederung der Meldung", () => {
        const z = ppugZeilen(bericht([
            station("Innere", [typ("frueh", 30, 90, 90, 0), typ("nacht", 30, 30, 27, 3)]),
        ]));
        expect(z.map(x => x.schicht)).toEqual(["Nacht", "Tag"]);
        expect(z.find(x => x.schicht === "Nacht")!.unterschritten).toBe(3);
        expect(z.find(x => x.schicht === "Tag")!.unterschritten).toBe(0);
    });
    it("verliert beim Zusammenfassen keine einzige Unterschreitung", () => {
        const stationen = [
            station("A", [typ("frueh", 10, 30, 28, 2), typ("spaet", 10, 20, 20, 0), typ("nacht", 10, 10, 8, 2)]),
            station("B", [typ("frueh", 10, 30, 25, 5)]),
        ];
        const summeVorher = stationen.reduce((s, st) => s + st.byType.reduce((t, x) => t + x.understaffedCount, 0), 0);
        const summeNachher = ppugZeilen(bericht(stationen)).reduce((s, z) => s + z.unterschritten, 0);
        expect(summeNachher).toBe(summeVorher);
        expect(summeNachher).toBe(9);
    });
    it("sortiert nach Station, Nacht vor Tag innerhalb der Station", () => {
        const z = ppugZeilen(bericht([
            station("Zentral-OP", [typ("frueh", 1, 1, 1, 0)]),
            station("Ambulanz", [typ("nacht", 1, 1, 1, 0), typ("frueh", 1, 1, 1, 0)]),
        ]));
        expect(z.map(x => `${x.station}/${x.schicht}`)).toEqual([
            "Ambulanz/Nacht", "Ambulanz/Tag", "Zentral-OP/Tag",
        ]);
    });
    it("kommt mit einem leeren Monat zurecht", () => {
        expect(ppugZeilen(bericht([]))).toEqual([]);
    });
    it("trägt Jahr und Monat des Berichts mit", () => {
        const z = ppugZeilen(bericht([station("A", [typ("frueh", 1, 1, 1, 0)])]));
        expect(z[0].jahr).toBe(2026);
        expect(z[0].monat).toBe(10);
    });
});
describe("Quartal und Meldetermin", () => {
    it("nennt die drei Monate je Quartal", () => {
        expect(monateDesQuartals(1)).toEqual([1, 2, 3]);
        expect(monateDesQuartals(4)).toEqual([10, 11, 12]);
    });
    it("nennt die vier Meldetermine der Verordnung", () => {
        expect(meldetermin(2026, 1)).toBe("15.04.2026");
        expect(meldetermin(2026, 2)).toBe("15.07.2026");
        expect(meldetermin(2026, 3)).toBe("15.10.2026");
        expect(meldetermin(2026, 4)).toBe("15.01.2027");
    });
});
describe("Die Ehrlichkeit der Datei", () => {
    it("benennt die Felder, die NICHT aus dem Dienstplan kommen", () => {
        const felder = OFFENE_FELDER.map(f => f.feld).join(" ");
        expect(felder).toMatch(/Patientenbelegung/);
        expect(felder).toMatch(/Bettenzahl/);
        expect(felder).toMatch(/Hebammen/);
        expect(felder).toMatch(/standort/i);
        expect(OFFENE_FELDER.every(f => f.quelle.trim().length > 0)).toBe(true);
    });
});
