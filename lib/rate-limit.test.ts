import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
type Aufruf = {
    art: string;
    args: unknown[];
};
const aufrufe: Aufruf[] = [];
const antwort = {
    rpcFehler: null as {
        code?: string;
        message?: string;
    } | null,
    rpcErlaubt: true,
    zaehlFehler: null as {
        code?: string;
        message?: string;
    } | null,
    anzahl: 0,
};
vi.mock("@/lib/admin-client", () => ({
    admin: () => ({
        rpc: async (fn: string, args: unknown) => {
            aufrufe.push({ art: "rpc", args: [fn, args] });
            if (antwort.rpcFehler)
                return { data: null, error: antwort.rpcFehler };
            return { data: { erlaubt: antwort.rpcErlaubt, anzahl: antwort.anzahl }, error: null };
        },
        from: () => {
            const kette: Record<string, unknown> = {};
            const weiter = (art: string) => (...args: unknown[]) => { aufrufe.push({ art, args }); return kette; };
            for (const m of ["select", "eq", "gte", "lt", "delete", "insert"])
                kette[m] = weiter(m);
            kette.then = (aufloesen: (w: unknown) => void) => {
                const geschrieben = aufrufe.some(a => a.art === "insert");
                return aufloesen(geschrieben
                    ? { data: null, error: antwort.zaehlFehler }
                    : { count: antwort.anzahl, error: antwort.zaehlFehler });
            };
            return kette;
        },
    }),
}));
const anfrage = () => ({ headers: new Headers({ "x-real-ip": "203.0.113.7" }) }) as never;
async function laden() {
    const mod = await import("./rate-limit");
    return mod;
}
beforeAll(async () => { await laden(); }, 30000);
beforeEach(() => {
    aufrufe.length = 0;
    antwort.rpcFehler = null;
    antwort.rpcErlaubt = true;
    antwort.zaehlFehler = null;
    antwort.anzahl = 0;
});
describe("checkRateLimit — der Weg über die Datenbankfunktion", () => {
    it("lässt durch, wenn die Funktion 'erlaubt' sagt", async () => {
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res).toBeNull();
    });
    it("sperrt mit 429, wenn die Funktion 'erlaubt: false' sagt", async () => {
        antwort.rpcErlaubt = false;
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res?.status).toBe(429);
    });
    it("prüft und zählt in EINEM Aufruf — nicht erst lesen, dann schreiben", async () => {
        const { checkRateLimit } = await laden();
        await checkRateLimit(anfrage(), "ki-demo", { limit: 2, windowMs: 1000 });
        expect(aufrufe.filter(a => a.art === "rpc")).toHaveLength(1);
        expect(aufrufe.some(a => a.art === "select")).toBe(false);
        expect(aufrufe.some(a => a.art === "insert")).toBe(false);
    });
    it("übergibt Fenster und Limit an die Funktion, nicht an den Zufall", async () => {
        const { checkRateLimit } = await laden();
        await checkRateLimit(anfrage(), "ki-demo", { limit: 2, windowMs: 30 * 24 * 3600000 });
        const [fn, args] = aufrufe[0].args as [
            string,
            Record<string, unknown>
        ];
        expect(fn).toBe("rate_limit_pruefen");
        expect(args.p_limit).toBe(2);
        expect(args.p_fenster_sekunden).toBe(2592000);
        expect(args.p_key).toBe("ki-demo:203.0.113.7");
    });
});
describe("checkRateLimit — wenn die Prüfung nicht stattfinden kann", () => {
    it("antwortet mit 503 statt durchzulassen, wenn die Tabelle fehlt (Befund 6)", async () => {
        antwort.rpcFehler = { code: "PGRST202", message: "rate_limit_pruefen not found" };
        antwort.zaehlFehler = { code: "PGRST205", message: "Could not find the table 'public.demo_rate_limit'" };
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res?.status).toBe(503);
    });
    it("antwortet mit 503, wenn die Funktion aus einem anderen Grund scheitert", async () => {
        antwort.rpcFehler = { code: "42501", message: "permission denied" };
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res?.status).toBe(503);
    });
});
describe("checkRateLimit — Rückfallweg, solange die Migration nicht gelaufen ist", () => {
    beforeEach(() => { antwort.rpcFehler = { code: "PGRST202", message: "rate_limit_pruefen not found" }; });
    it("zählt und lässt durch, wenn das Limit nicht erreicht ist", async () => {
        antwort.anzahl = 1;
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res).toBeNull();
        expect(aufrufe.some(a => a.art === "insert")).toBe(true);
    });
    it("räumt NUR den eigenen Schlüssel ab (Befund 1)", async () => {
        const { checkRateLimit } = await laden();
        await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        const abIndex = aufrufe.findIndex(a => a.art === "delete");
        expect(abIndex, "es wird aufgeräumt").toBeGreaterThanOrEqual(0);
        const danach = aufrufe.slice(abIndex);
        const eqAufIp = danach.find(a => a.art === "eq" && a.args[0] === "ip");
        expect(eqAufIp, "delete ohne eq('ip', …) loescht fremde Zaehler").toBeTruthy();
        expect(eqAufIp!.args[1]).toBe("demo-login:203.0.113.7");
    });
    it("sperrt mit 429, wenn das Limit erreicht ist — und schreibt dann nichts", async () => {
        antwort.anzahl = 10;
        const { checkRateLimit } = await laden();
        const res = await checkRateLimit(anfrage(), "demo-login", { limit: 10, windowMs: 3600000 });
        expect(res?.status).toBe(429);
        expect(aufrufe.some(a => a.art === "insert")).toBe(false);
    });
});
