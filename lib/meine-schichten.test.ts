import { describe, it, expect } from "vitest";
import { istMeine, meineSchichten, monatsRahmen, zuordnungenFuer } from "./meine-schichten";
const schichten = [{ id: "a" }, { id: "b" }, { id: "c" }];
describe("meineSchichten", () => {
    it("liefert nur die zugeordneten Schichten", () => {
        const z = [{ shift_id: "b", staff_name: "Maria" }, { shift_id: "c", staff_name: "Jonas" }];
        expect(meineSchichten(schichten, z, "Maria")).toEqual([{ id: "b" }]);
    });
    it("gibt ohne eigene Zuordnung eine LEERE Liste zurück, nicht alle Schichten", () => {
        const z = [{ shift_id: "c", staff_name: "Jonas" }];
        expect(meineSchichten(schichten, z, "Maria")).toEqual([]);
    });
    it("gibt ohne Zuordnungen überhaupt eine leere Liste zurück", () => {
        expect(meineSchichten(schichten, [], "Maria")).toEqual([]);
    });
    it("ordnet ohne Namen niemandem etwas zu", () => {
        const z = [{ shift_id: "a", staff_name: "" }];
        expect(meineSchichten(schichten, z, "")).toEqual([]);
    });
    it("trennt zwei Personen gleichen Namens über die Kennung (25.10.2026)", () => {
        const z = [
            { shift_id: "a", staff_name: "Lilian Schiffer", staff_id: "leitung" },
            { shift_id: "b", staff_name: "Lilian Schiffer", staff_id: "test" },
            { shift_id: "c", staff_name: "Lilian Schiffer", staff_id: null },
        ];
        expect(meineSchichten(schichten, z, "Lilian Schiffer", "test")).toEqual([{ id: "b" }, { id: "c" }]);
        expect(meineSchichten(schichten, z, "Lilian Schiffer", "leitung")).toEqual([{ id: "a" }, { id: "c" }]);
    });
});
describe("istMeine", () => {
    it("lässt mit Kennung den Namen außen vor", () => {
        expect(istMeine({ staff_id: "x", staff_name: "Maria" }, "y", "Maria")).toBe(false);
        expect(istMeine({ staff_id: "x", staff_name: "Jonas" }, "x", "Maria")).toBe(true);
    });
    it("nimmt den Namen nur, wenn die Zeile keine Kennung hat", () => {
        expect(istMeine({ staff_id: null, staff_name: "Maria" }, "y", "Maria")).toBe(true);
        expect(istMeine({ staff_name: "Maria" }, undefined, "Jonas")).toBe(false);
    });
    it("ordnet ohne eigene Kennung keine Zeile mit Kennung zu", () => {
        expect(istMeine({ staff_id: "x", staff_name: "Maria" }, undefined, "Maria")).toBe(false);
    });
});
describe("monatsRahmen", () => {
    it("nennt ersten und letzten Tag", () => {
        expect(monatsRahmen("2026-09-23")).toEqual({ von: "2026-09-01", bis: "2026-09-30", monatIndex: 8 });
    });
    it("kennt Schaltjahre", () => {
        expect(monatsRahmen("2028-02-10").bis).toBe("2028-02-29");
        expect(monatsRahmen("2026-02-10").bis).toBe("2026-02-28");
    });
    it("bleibt am Monatsersten im richtigen Monat", () => {
        expect(monatsRahmen("2026-10-01").von).toBe("2026-10-01");
        expect(monatsRahmen("2026-12-31").bis).toBe("2026-12-31");
    });
});
describe("zuordnungenFuer", () => {
    it("fragt in Paketen zu 300 Schichten und nur diese Schichten ab", async () => {
        const aufrufe: string[][] = [];
        const db = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        in: async (_spalte: string, ids: string[]) => {
                            aufrufe.push(ids);
                            return { data: ids.map(id => ({ shift_id: id, staff_name: "Anna", staff_id: null })) };
                        },
                    }),
                }),
            }),
        };
        const ids = Array.from({ length: 650 }, (_, i) => `s${i}`);
        const z = await zuordnungenFuer(db, "Haus", ids);
        expect(aufrufe.map(a => a.length)).toEqual([300, 300, 50]);
        expect(z).toHaveLength(650);
    });
    it("ohne Schichten keine Abfrage", async () => {
        let gefragt = false;
        const db = { from: () => { gefragt = true; return {}; } };
        expect(await zuordnungenFuer(db, "Haus", [])).toEqual([]);
        expect(gefragt).toBe(false);
    });
});
