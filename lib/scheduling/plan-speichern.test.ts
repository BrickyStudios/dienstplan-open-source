import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ersetzeZuweisungen, type ZuweisungsZeile } from "./plan-speichern";
type Fehler = {
    code?: string;
    message?: string;
} | null;
function fake(opts: {
    rpcFehler?: Fehler;
    insertFehler?: Fehler[];
}) {
    let tabelle: Record<string, unknown>[] = [
        { id: "alt-1", shift_id: "s1", facility_name: "Haus", staff_name: "Anna", status: "confirmed" },
        { id: "alt-2", shift_id: "s2", facility_name: "Haus", staff_name: "Ben", status: "manual" },
    ];
    const insertFehler = [...(opts.insertFehler ?? [])];
    const protokoll: string[] = [];
    const admin = {
        rpc: async (fn: string) => { protokoll.push(`rpc:${fn}`); return { data: null, error: opts.rpcFehler ?? null }; },
        from: () => {
            let art = "";
            let nutzlast: Record<string, unknown>[] = [];
            const q = {
                select: () => { art = art || "select"; return q; },
                delete: () => { art = "delete"; return q; },
                insert: (r: Record<string, unknown>[]) => { art = "insert"; nutzlast = r; return q; },
                eq: () => q, in: () => q,
                then: (ok: (v: unknown) => unknown) => {
                    protokoll.push(art);
                    if (art === "select")
                        return Promise.resolve({ data: tabelle.map(z => ({ ...z })), error: null }).then(ok);
                    if (art === "delete") {
                        tabelle = [];
                        return Promise.resolve({ error: null }).then(ok);
                    }
                    const f = insertFehler.shift() ?? null;
                    if (!f)
                        tabelle.push(...nutzlast);
                    return Promise.resolve({ error: f }).then(ok);
                },
            };
            return q;
        },
    };
    return { admin: admin as unknown as SupabaseClient, stand: () => tabelle, protokoll };
}
const neu: ZuweisungsZeile[] = [
    { shift_id: "s1", facility_name: "Haus", staff_id: null, staff_name: "Clara", status: "confirmed", is_overtime: false, understaffing_decision: null, is_springer: false },
];
describe("ersetzeZuweisungen", () => {
    it("nimmt die Postgres-Funktion, wenn es sie gibt — und fasst die Tabelle sonst nicht an", async () => {
        const f = fake({});
        const r = await ersetzeZuweisungen(f.admin, "Haus", ["s1", "s2"], neu);
        expect(r).toMatchObject({ error: null, weg: "rpc" });
        expect(f.protokoll).toEqual(["rpc:replace_shift_assignments"]);
    });
    it("echter Fehler in der Funktion: kein Ersatzweg, kein Löschen", async () => {
        const f = fake({ rpcFehler: { code: "23514", message: "check constraint" } });
        const r = await ersetzeZuweisungen(f.admin, "Haus", ["s1", "s2"], neu);
        expect(r.error?.code).toBe("23514");
        expect(f.protokoll).not.toContain("delete");
        expect(f.stand()).toHaveLength(2);
    });
    it("ohne Migration: Einfügen scheitert → alter Plan steht wieder da", async () => {
        const f = fake({ rpcFehler: { code: "PGRST202" }, insertFehler: [{ code: "57014", message: "timeout" }] });
        const r = await ersetzeZuweisungen(f.admin, "Haus", ["s1", "s2"], neu);
        expect(r).toMatchObject({ weg: "ersatz", wiederhergestellt: true });
        expect(r.error?.code).toBe("57014");
        expect(f.stand().map(z => z.id).sort()).toEqual(["alt-1", "alt-2"]);
    });
    it("ohne Migration, alles gut: neuer Plan ersetzt den alten", async () => {
        const f = fake({ rpcFehler: { code: "PGRST202" } });
        const r = await ersetzeZuweisungen(f.admin, "Haus", ["s1", "s2"], neu);
        expect(r).toMatchObject({ error: null, weg: "ersatz" });
        expect(f.stand().map(z => z.staff_name)).toEqual(["Clara"]);
    });
});
