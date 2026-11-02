import { describe, it, expect } from "vitest";
import { abDatum, findeVerdachtsfaelle, type SchichtZeile, type ZuweisungZeile } from "./nichterscheinen";
const shifts: SchichtZeile[] = [
    { id: "s1", date: "2026-10-06", shift_type: "frueh", start_time: "06:00", end_time: "14:00", station: "A" },
    { id: "s2", date: "2026-10-07", shift_type: "nacht", station: "A" },
    { id: "heute", date: "2026-10-09", shift_type: "frueh", station: "A" },
];
const idVonName = new Map([["Anna", "u-anna"], ["Ben", "u-ben"], ["Mitarbeiter 9", "fs-9"]]);
const kannStempeln = new Set(["u-anna", "u-ben"]);
function basis(z: ZuweisungZeile[], extra: Partial<Parameters<typeof findeVerdachtsfaelle>[0]> = {}) {
    return findeVerdachtsfaelle({
        shifts, zuweisungen: z, idVonName, kannStempeln, gestempelt: new Set(), krank: new Set(), urlaub: [], entschieden: new Set(),
        vor: "2026-10-09", ...extra,
    });
}
describe("findeVerdachtsfaelle", () => {
    it("meldet eingeteilte Person ohne Stempel", () => {
        const f = basis([{ shift_id: "s1", staff_name: "Anna" }]);
        expect(f).toHaveLength(1);
        expect(f[0]).toMatchObject({ shiftId: "s1", staffId: "u-anna", datum: "2026-10-06", zeit: "06:00–14:00" });
    });
    it("kein Verdacht bei Stempel am selben Tag", () => {
        expect(basis([{ shift_id: "s1", staff_name: "Anna" }], { gestempelt: new Set(["u-anna|2026-10-06"]) })).toHaveLength(0);
    });
    it("Nachtdienst: ein Stempel nach Mitternacht (Folgetag) zählt", () => {
        expect(basis([{ shift_id: "s2", staff_name: "Ben" }], { gestempelt: new Set(["u-ben|2026-10-08"]) })).toHaveLength(0);
        expect(basis([{ shift_id: "s1", staff_name: "Anna" }], { gestempelt: new Set(["u-anna|2026-10-07"]) })).toHaveLength(1);
    });
    it("kein Verdacht bei Krankmeldung, Urlaub oder schon entschieden", () => {
        const z = [{ shift_id: "s1", staff_name: "Anna" }];
        expect(basis(z, { krank: new Set(["Anna|2026-10-06"]) })).toHaveLength(0);
        expect(basis(z, { urlaub: [{ userId: "u-anna", von: "2026-10-05", bis: "2026-10-10" }] })).toHaveLength(0);
        expect(basis(z, { entschieden: new Set(["s1|Anna"]) })).toHaveLength(0);
    });
    it("ignoriert Personen, die nicht stempeln — ohne Konto und ohne Buchung", () => {
        expect(basis([{ shift_id: "s1", staff_name: "Mitarbeiter 9", staff_id: "fs-9" }])).toHaveLength(0);
    });
    it("prüft Personen ohne Konto, die nachweislich stempeln (Testpersonal)", () => {
        const f = basis([{ shift_id: "s1", staff_name: "Mitarbeiter 9", staff_id: "fs-9" }], { kannStempeln: new Set(["fs-9"]) });
        expect(f).toHaveLength(1);
        expect(f[0].staffId).toBe("fs-9");
    });
    it("ignoriert ausgetragene Einteilungen und den laufenden Tag", () => {
        expect(basis([{ shift_id: "s1", staff_name: "Anna", status: "cancelled" }])).toHaveLength(0);
        expect(basis([{ shift_id: "heute", staff_name: "Anna" }])).toHaveLength(0);
    });
    it("doppelte Einteilungszeilen ergeben einen Fall, jüngster zuerst", () => {
        const f = basis([
            { shift_id: "s1", staff_name: "Anna" }, { shift_id: "s1", staff_name: "Anna" },
            { shift_id: "s2", staff_name: "Ben" },
        ]);
        expect(f.map(x => x.shiftId)).toEqual(["s2", "s1"]);
    });
});
describe("abDatum", () => {
    it("beginnt am Monatsersten, auch über den Jahreswechsel", () => {
        expect(abDatum("2026-10-09", 12)).toBe("2025-10-01");
        expect(abDatum("2026-02-15", 3)).toBe("2025-11-01");
    });
});
