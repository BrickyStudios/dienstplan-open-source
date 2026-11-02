import { describe, it, expect } from "vitest";
import { assessSwapRuhezeit } from "@/lib/swap-ruhezeit";
type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>) {
    const builder = (rows: Row[]) => {
        const api: Record<string, unknown> = {};
        for (const m of ["eq", "in", "gte", "lte"]) {
            api[m] = () => api;
        }
        (api as {
            then: unknown;
        }).then = (resolve: (v: {
            data: Row[];
        }) => unknown) => resolve({ data: rows });
        return api;
    };
    return {
        from: (table: string) => ({ select: () => builder(tables[table] ?? []) }),
    } as any;
}
const shift = (id: string, date: string, type: string, start: string, end: string) => ({ id, station: "Station 1", date, shift_type: type, start_time: start, end_time: end });
const zuteilung = (shift_id: string, staff_name: string, staff_id: string) => ({ shift_id, staff_id, staff_name, status: "confirmed" });
const PARAMS = {
    requesterShiftId: "s-anna", targetShiftId: "s-bea",
    requesterStaffId: "id-anna", targetStaffId: "id-bea",
    requesterName: "Anna", targetName: "Bea",
};
describe("assessSwapRuhezeit", () => {
    it("warnt, wenn der Tausch eine Ruhezeit neu unter 11 h drueckt", async () => {
        const admin = fakeAdmin({
            shifts: [
                shift("s-nacht", "2026-09-10", "nacht", "22:00", "06:00"),
                shift("s-anna", "2026-09-12", "spaet", "14:00", "22:00"),
                shift("s-bea", "2026-09-11", "frueh", "06:00", "14:00"),
            ],
            shift_assignments: [
                zuteilung("s-nacht", "Anna", "id-anna"),
                zuteilung("s-anna", "Anna", "id-anna"),
                zuteilung("s-bea", "Bea", "id-bea"),
            ],
        });
        const r = await assessSwapRuhezeit(admin, "Haus A", PARAMS);
        expect(r.warn).toBe(true);
        expect(r.verstoesse[0].staffName).toBe("Anna");
        expect(r.verstoesse[0].restMinutes).toBe(0);
        expect(r.verstoesse[0].unterAbsatz2).toBe(true);
        expect(r.reason).toContain("§ 5 ArbZG");
        expect(r.reason).toContain("auch unter den 10 h");
    });
    it("nennt bei 10–11 h den Ausgleich nach § 5 Abs. 2 ArbZG statt eines Verbots", async () => {
        const admin = fakeAdmin({
            shifts: [
                shift("s-nacht", "2026-09-10", "nacht", "22:00", "06:00"),
                shift("s-anna", "2026-09-12", "frueh", "06:00", "14:00"),
                shift("s-bea", "2026-09-11", "spaet", "16:30", "22:00"),
            ],
            shift_assignments: [
                zuteilung("s-nacht", "Anna", "id-anna"),
                zuteilung("s-anna", "Anna", "id-anna"),
                zuteilung("s-bea", "Bea", "id-bea"),
            ],
        });
        const r = await assessSwapRuhezeit(admin, "Haus A", PARAMS);
        expect(r.warn).toBe(true);
        expect(r.verstoesse[0].restMinutes).toBe(630);
        expect(r.verstoesse[0].unterAbsatz2).toBe(false);
        expect(r.reason).toContain("§ 5 Abs. 2 ArbZG");
        expect(r.reason).toContain("ausgeglichen");
    });
    it("warnt NICHT, wenn die knappe Ruhezeit schon vor dem Tausch bestand", async () => {
        const admin = fakeAdmin({
            shifts: [
                shift("s-nacht", "2026-09-10", "nacht", "22:00", "06:00"),
                shift("s-anna", "2026-09-13", "frueh", "06:00", "14:00"),
                shift("s-bea", "2026-09-11", "frueh", "06:00", "14:00"),
            ],
            shift_assignments: [
                zuteilung("s-nacht", "Bea", "id-bea"),
                zuteilung("s-anna", "Anna", "id-anna"),
                zuteilung("s-bea", "Bea", "id-bea"),
            ],
        });
        const r = await assessSwapRuhezeit(admin, "Haus A", PARAMS);
        expect(r.warn).toBe(false);
        expect(r.reason).toBe("");
    });
    it("warnt nicht bei einem unauffaelligen Tausch", async () => {
        const admin = fakeAdmin({
            shifts: [
                shift("s-anna", "2026-09-11", "frueh", "06:00", "14:00"),
                shift("s-bea", "2026-09-12", "frueh", "06:00", "14:00"),
            ],
            shift_assignments: [
                zuteilung("s-anna", "Anna", "id-anna"),
                zuteilung("s-bea", "Bea", "id-bea"),
            ],
        });
        const r = await assessSwapRuhezeit(admin, "Haus A", PARAMS);
        expect(r.warn).toBe(false);
        expect(r.verstoesse).toEqual([]);
    });
    it("schweigt, wenn die Datengrundlage fehlt — keine Warnung ohne Substanz", async () => {
        const leer = fakeAdmin({ shifts: [], shift_assignments: [] });
        expect((await assessSwapRuhezeit(leer, "Haus A", PARAMS)).warn).toBe(false);
        const halb = fakeAdmin({
            shifts: [shift("s-anna", "2026-09-11", "frueh", "06:00", "14:00")],
            shift_assignments: [zuteilung("s-anna", "Anna", "id-anna")],
        });
        expect((await assessSwapRuhezeit(halb, "Haus A", PARAMS)).warn).toBe(false);
    });
});
