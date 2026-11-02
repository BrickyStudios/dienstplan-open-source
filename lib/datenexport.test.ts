import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alsCsv, AUSGENOMMEN, EXPORT, zeileBereinigen } from "./datenexport";
function tabellenMitEinrichtung(): Set<string> {
    const ordner = join(process.cwd(), "supabase", "migrations");
    const gefunden = new Set<string>();
    for (const datei of readdirSync(ordner).filter((d) => d.endsWith(".sql"))) {
        const sql = readFileSync(join(ordner, datei), "utf8");
        for (const m of sql.matchAll(/create table if not exists\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
            if (/^\s*(facility_name|facility)\s/m.test(m[2]))
                gefunden.add(m[1]);
        }
        for (const m of sql.matchAll(/alter table\s+(?:if exists\s+)?(?:public\.)?(\w+)\s+add column\s+(?:if not exists\s+)?(facility_name|facility)\b/gi)) {
            gefunden.add(m[1]);
        }
    }
    return gefunden;
}
describe("Gesamtexport — die Liste ist geschlossen", () => {
    it("jede Tabelle mit Einrichtungsspalte wird exportiert oder ist mit Grund ausgenommen", () => {
        const bekannt = new Set([...EXPORT.map((t) => t.tabelle), ...Object.keys(AUSGENOMMEN)]);
        const vergessen = [...tabellenMitEinrichtung()].filter((t) => !bekannt.has(t));
        expect(vergessen, "Neue Tabelle(n) in lib/datenexport.ts eintragen: EXPORT oder AUSGENOMMEN").toEqual([]);
    });
    it("keine Tabelle steht doppelt", () => {
        const namen = EXPORT.map((t) => t.tabelle);
        expect(new Set(namen).size).toBe(namen.length);
        for (const n of namen)
            expect(AUSGENOMMEN[n]).toBeUndefined();
    });
    it("Zugangsgeheimnisse gehen nie mit", () => {
        expect(AUSGENOMMEN.invite_codes).toBeDefined();
        expect(AUSGENOMMEN.checkin_tokens).toBeDefined();
        expect(EXPORT.find((t) => t.tabelle === "anbindungen")?.ohne).toEqual(expect.arrayContaining(["geheimnis", "hl7_token_hash", "kalender_token_hash"]));
        expect(EXPORT.find((t) => t.tabelle === "user_profiles")?.ohne).toContain("recovery_phrase_hash");
    });
});
describe("zeileBereinigen", () => {
    it("lässt ausgenommene Spalten weg", () => {
        const t = EXPORT.find((x) => x.tabelle === "anbindungen")!;
        const z = zeileBereinigen(t, { id: "1", name: "ORBIS", geheimnis: "xyz", hl7_token_hash: "h" });
        expect(z).toEqual({ id: "1", name: "ORBIS" });
    });
});
describe("alsCsv", () => {
    it("setzt BOM und Semikolon und maskiert Sonderzeichen", () => {
        const csv = alsCsv([{ a: 1, b: 'x;"y"' }, { a: 2, c: null }]);
        expect(csv.startsWith("﻿")).toBe(true);
        const [kopf, z1, z2] = csv.slice(1).split("\r\n");
        expect(kopf).toBe("a;b;c");
        expect(z1).toBe('1;"x;""y""";');
        expect(z2).toBe("2;;");
    });
    it("schreibt Objekte als JSON", () => {
        expect(alsCsv([{ j: { x: 1 } }]).split("\r\n")[1]).toBe('"{""x"":1}"');
    });
});
