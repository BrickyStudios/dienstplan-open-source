import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { REGELN, darfSchnittstelle, darfSeite, leseRechte, selbstWirksam } from "@/lib/rechte";
describe("Rechte je Mitarbeiter — Schnittstellen", () => {
    it("ohne Rechte nichts, auch nicht der Kontext", () => {
        expect(darfSchnittstelle([], "/api/leitung/context", "GET")).toBe(false);
        expect(darfSchnittstelle([], "/api/leitung/shifts", "GET")).toBe(false);
    });
    it("fail closed: nicht zugeordnete Wege bleiben bei der Leitung", () => {
        const alle = leseRechte(["dienstplan", "ausfall", "team", "zeiten", "lohn", "einstellungen", "rechte"]);
        for (const pfad of ["/api/leitung/reset-recovery", "/api/leitung/view-as", "/api/leitung/access-log", "/api/leitung/konto-sicherheit", "/api/leitung/irgendwas-neues"]) {
            expect(darfSchnittstelle(alle, pfad, "POST")).toBe(false);
            expect(darfSchnittstelle(alle, pfad, "GET")).toBe(false);
        }
    });
    it("Dienstplan: planen ja, Lohn nein", () => {
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/shifts/assign", "POST")).toBe(true);
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/praxis-raster", "POST")).toBe(true);
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/lohnabrechnung", "GET")).toBe(false);
    });
    it("Stammdaten: lesen für viele, ändern nur mit dem passenden Recht", () => {
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/staff", "GET")).toBe(true);
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/staff", "PATCH")).toBe(false);
        expect(darfSchnittstelle(["team"], "/api/leitung/staff", "PATCH")).toBe(true);
        expect(darfSchnittstelle(["dienstplan"], "/api/leitung/facility-settings", "PATCH")).toBe(false);
        expect(darfSchnittstelle(["einstellungen"], "/api/leitung/facility-settings", "PATCH")).toBe(true);
    });
    it("Segmentgrenze: /staff deckt nicht /staff-availability ab, das hat eine eigene Regel", () => {
        expect(darfSchnittstelle(["team"], "/api/leitung/staffing-needs", "GET")).toBe(false);
    });
    it("Rechte vergeben nur mit dem Recht dazu", () => {
        expect(darfSchnittstelle(["team"], "/api/leitung/mitarbeiter-rechte", "PUT")).toBe(false);
        expect(darfSchnittstelle(["rechte"], "/api/leitung/mitarbeiter-rechte", "PUT")).toBe(true);
    });
    it("jede zugeordnete Schnittstelle gibt es wirklich", () => {
        for (const r of REGELN) {
            expect(existsSync(join(process.cwd(), "app", r.pfad)), r.pfad).toBe(true);
        }
    });
});
describe("Rechte je Mitarbeiter — Seiten", () => {
    it("Leiste: nur, was zum Recht gehört", () => {
        expect(darfSeite(["dienstplan"], "/schichtplan")).toBe(true);
        expect(darfSeite(["dienstplan"], "/lohnabrechnung")).toBe(false);
        expect(darfSeite(["ausfall"], "/aufgaben")).toBe(true);
        expect(darfSeite(["lohn"], "/aufgaben")).toBe(false);
    });
});
describe("Selbstbedienung", () => {
    it("Person vor Praxis vor erlaubt", () => {
        const w = selbstWirksam({ krank: false, urlaub: false }, { urlaub: true });
        expect(w).toEqual({ krank: false, urlaub: true, wuensche: true, tausch: true, abgabe: true });
    });
    it("liest nur bekannte Rechte", () => {
        expect(leseRechte(["dienstplan", "admin", "dienstplan"])).toEqual(["dienstplan"]);
    });
});
