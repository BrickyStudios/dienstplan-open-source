import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { aiDisclosureDocument } from "@/lib/ai-transparency";
const WURZEL = process.cwd();
const LIB = path.join(WURZEL, "lib");
const SEITE = path.join(WURZEL, "app", "ki-transparenz", "page.tsx");
const MODELL_AUFRUF = /\b(aiStructured|aiComplete|aiText)\s*[<(]/;
const KEIN_EIGENES_SYSTEM = new Set([
    "ai.ts",
    "ai-minimierung.ts",
    "ai-guardrails.ts",
    "ai-guard-daten.ts",
    "ai-transparency.ts",
]);
function moduleMitModellaufruf(): string[] {
    return fs.readdirSync(LIB)
        .filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .filter(f => !KEIN_EIGENES_SYSTEM.has(f))
        .filter(f => MODELL_AUFRUF.test(fs.readFileSync(path.join(LIB, f), "utf8")));
}
describe("Art. 50 — die Offenlegung ist vollständig", () => {
    const dok = aiDisclosureDocument("https://www.nurvo.de");
    const systeme = dok.aiSystemsInProduct;
    it("führt jedes Modul, das ein Modell aufruft, im Register", () => {
        const genannt = systeme.flatMap(s => s.module.split(",").map(m => m.trim()));
        const fehlend = moduleMitModellaufruf()
            .map(f => `lib/${f}`)
            .filter(m => !genannt.includes(m));
        expect(fehlend, `Diese Module erreichen ein Sprachmodell, stehen aber in keinem Eintrag von ` +
            `aiSystemsInProduct (lib/ai-transparency.ts). Wer ein KI-System ergänzt, ergänzt ` +
            `die Offenlegung — Art. 50 KI-VO gilt seit dem 02.08.2026.`).toEqual([]);
    });
    it("nennt jedes Register-System auch auf der Seite für Menschen", () => {
        const seite = fs.readFileSync(SEITE, "utf8");
        const kennwort: Record<string, string> = {
            monatsanalyse: "Monatsanalyse",
            copilot: "Copilot",
            notfallplan: "Notfallplan",
            "notfall-vorlage-entwurf": "Notfall-Vorlagen",
            "praxis-raster-onboarding": "Dienstplanrasters",
            "ki-chat": "KI-Assistent",
        };
        for (const s of systeme) {
            const wort = kennwort[s.id];
            expect(wort, `Für „${s.id}" fehlt das Kennwort in diesem Test`).toBeTruthy();
            expect(seite.includes(wort), `/ki-transparenz nennt „${wort}" nicht, obwohl das Register das System führt.`).toBe(true);
        }
    });
    it("gibt zu jedem System an, ob es läuft und wie es eingestuft ist", () => {
        for (const s of systeme) {
            expect(s.status, `${s.id}: status fehlt`).toBeTruthy();
            expect(s.riskClassification, `${s.id}: riskClassification fehlt`).toBeTruthy();
            expect(s.humanOversight, `${s.id}: humanOversight fehlt`).toBeTruthy();
            expect(s.neverProcesses.length, `${s.id}: neverProcesses ist leer`).toBeGreaterThan(0);
        }
    });
    it("verschweigt bei keinem System, dass Nachnamen nicht übermittelt werden", () => {
        for (const s of systeme.filter(x => x.id !== "monatsanalyse")) {
            expect(s.neverProcesses.some(n => n.toLowerCase().includes("nachnamen")), `${s.id}: Die Zusage zu Nachnamen fehlt.`).toBe(true);
        }
    });
});
