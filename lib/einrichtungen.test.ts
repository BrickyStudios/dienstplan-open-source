import { describe, it, expect } from "vitest";
import { nameBelegt, pruefeEinrichtungsname, wechsleEinrichtung } from "./einrichtungen";
type Antwort = {
    data: unknown;
    error: {
        code?: string;
        message?: string;
    } | null;
};
function fakeAdmin(antworten: Record<string, Antwort>) {
    const log: {
        tabelle: string;
        op: string;
        args: unknown[];
    }[] = [];
    const from = (tabelle: string) => {
        const kette: Record<string, unknown> = {};
        for (const op of ["select", "eq", "ilike", "limit", "in", "order", "update", "maybeSingle"]) {
            kette[op] = (...args: unknown[]) => { log.push({ tabelle, op, args }); return kette; };
        }
        kette.then = (ok: (a: Antwort) => unknown) => Promise.resolve(antworten[tabelle] ?? { data: [], error: null }).then(ok);
        return kette;
    };
    return { admin: { from } as never, log };
}
describe("pruefeEinrichtungsname", () => {
    it("bereinigt Leerraum", () => {
        expect(pruefeEinrichtungsname("  Praxis   Kalk ")).toEqual({ ok: true, name: "Praxis Kalk" });
    });
    it("lehnt zu kurz, zu lang, Steuerzeichen und Nicht-Text ab", () => {
        expect(pruefeEinrichtungsname("ab").ok).toBe(false);
        expect(pruefeEinrichtungsname("x".repeat(81)).ok).toBe(false);
        expect(pruefeEinrichtungsname("Praxis\u0000Kalk").ok).toBe(false);
        expect(pruefeEinrichtungsname(42).ok).toBe(false);
    });
});
describe("nameBelegt — der Name ist der Mandantenschlüssel", () => {
    it("frei, wenn keine Tabelle ihn kennt", async () => {
        const { admin } = fakeAdmin({});
        expect(await nameBelegt(admin, "Praxis Neu")).toBe(false);
    });
    it("belegt, sobald eine Tabelle ihn kennt", async () => {
        const { admin } = fakeAdmin({ facility_staff: { data: [{ id: "x" }], error: null } });
        expect(await nameBelegt(admin, "Klinik Fremd")).toBe(true);
    });
    it("fail closed: ein anderer Fehler als ‚Tabelle fehlt' zählt als belegt", async () => {
        const { admin } = fakeAdmin({ stations: { data: null, error: { code: "57014", message: "timeout" } } });
        expect(await nameBelegt(admin, "Praxis Neu")).toBe(true);
    });
    it("eine fehlende Tabelle sagt nichts aus", async () => {
        const { admin } = fakeAdmin({ facilities: { data: null, error: { code: "PGRST205" } } });
        expect(await nameBelegt(admin, "Praxis Neu")).toBe(false);
    });
    it("entschärft ILIKE-Platzhalter, damit „%“ nicht jede Einrichtung trifft", async () => {
        const { admin, log } = fakeAdmin({});
        await nameBelegt(admin, "100%_Praxis");
        const muster = log.filter(l => l.op === "ilike").map(l => l.args[1]);
        expect(muster.length).toBeGreaterThan(0);
        for (const m of muster)
            expect(m).toBe("100\\%\\_Praxis");
    });
});
describe("wechsleEinrichtung", () => {
    it("verweigert ohne Mitgliedschaft und schreibt das Profil nicht um", async () => {
        const { admin, log } = fakeAdmin({
            user_profiles: { data: { role: "leitung", facility: "A", onboarding_completed_at: "2026-01-01" }, error: null },
            leitung_einrichtungen: { data: [], error: null },
        });
        const r = await wechsleEinrichtung(admin, "u1", "Fremde Klinik");
        expect(r).toMatchObject({ ok: false, status: 403 });
        expect(log.some(l => l.tabelle === "user_profiles" && l.op === "update")).toBe(false);
    });
    it("verweigert Mitarbeiter-Konten", async () => {
        const { admin } = fakeAdmin({ user_profiles: { data: { role: "mitarbeiter", facility: "A" }, error: null } });
        expect(await wechsleEinrichtung(admin, "u1", "A")).toMatchObject({ ok: false, status: 403 });
    });
    it("wechselt bei Mitgliedschaft und übernimmt deren Onboarding-Stand", async () => {
        const { admin, log } = fakeAdmin({
            user_profiles: { data: { role: "leitung", facility: "A", onboarding_completed_at: "2026-01-01" }, error: null },
            leitung_einrichtungen: { data: [{ facility_name: "B", onboarding_completed_at: null }], error: null },
        });
        expect(await wechsleEinrichtung(admin, "u1", "B")).toEqual({ ok: true });
        const update = log.find(l => l.tabelle === "user_profiles" && l.op === "update");
        expect(update?.args[0]).toEqual({ facility: "B", onboarding_completed_at: null });
        const sicherung = log.find(l => l.tabelle === "leitung_einrichtungen" && l.op === "update");
        expect(sicherung?.args[0]).toEqual({ onboarding_completed_at: "2026-01-01" });
    });
});
