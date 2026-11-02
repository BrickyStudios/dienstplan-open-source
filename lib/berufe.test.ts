import { describe, expect, it } from "vitest";
import { BERUFE, berufeFuer, berufsgruppeVon, istNichtPflegeStation, standardBeruf, stationsdienst } from "@/lib/berufe";
describe("Berufe-Katalog", () => {
    it("kennt die Arztarten im Krankenhaus, darunter Stationsarzt und Notarzt", () => {
        const aerzte = berufeFuer("klinik").find(g => g.gruppe === "aerztlich")!.berufe;
        expect(aerzte).toContain("Stationsärztin / Stationsarzt");
        expect(aerzte).toContain("Notärztin / Notarzt");
        expect(aerzte.length).toBeGreaterThanOrEqual(6);
    });
    it("zeigt jedem Einrichtungstyp nur, was dort vorkommt", () => {
        const heim = berufeFuer("pflege").flatMap(g => g.berufe);
        expect(heim).toContain("Betreuungskraft");
        expect(heim).not.toContain("Notärztin / Notarzt");
        const praxis = berufeFuer("praxis").flatMap(g => g.berufe);
        expect(praxis).toContain("Medizinische Fachangestellte (MFA)");
        expect(praxis).not.toContain("Pflegefachkraft");
    });
    it("die Vorbelegung steht im Katalog des jeweiligen Typs", () => {
        for (const typ of ["klinik", "pflege", "praxis"] as const) {
            expect(berufeFuer(typ).flatMap(g => g.berufe)).toContain(standardBeruf(typ));
        }
    });
    it("jeder Beruf ist eindeutig benannt", () => {
        const namen = BERUFE.map(b => b.name.toLowerCase());
        expect(new Set(namen).size).toBe(namen.length);
    });
});
describe("berufsgruppeVon / stationsdienst", () => {
    it("ordnet Katalogberufe genau zu", () => {
        expect(berufsgruppeVon("Oberärztin / Oberarzt")).toBe("aerztlich");
        expect(berufsgruppeVon("Reinigungskraft")).toBe("hauswirtschaft");
        expect(berufsgruppeVon("Pflegefachkraft")).toBe("pflege");
    });
    it("erkennt Freitext aus Bestand und Import", () => {
        expect(berufsgruppeVon("Arzt")).toBe("aerztlich");
        expect(berufsgruppeVon("Reinigung")).toBe("hauswirtschaft");
        expect(berufsgruppeVon("Stationsleitung")).toBe("pflege");
        expect(berufsgruppeVon("")).toBe("pflege");
        expect(berufsgruppeVon(null)).toBe("pflege");
    });
    it("nur Pflege und Praxisteam kommen in reguläre Stationsschichten", () => {
        expect(stationsdienst("Pflegehilfskraft")).toBe(true);
        expect(stationsdienst("Praxisärztin / Praxisarzt")).toBe(true);
        expect(stationsdienst("Stationsärztin / Stationsarzt")).toBe(false);
        expect(stationsdienst("Haustechnik")).toBe(false);
        expect(stationsdienst(undefined)).toBe(true);
    });
    it("Nicht-Pflege-Stationen: Häkchen zuerst, Name als Rückfall", () => {
        expect(istNichtPflegeStation("Ärztlicher Dienst")).toBe(true);
        expect(istNichtPflegeStation("Saal 4", new Set(["Saal 4"]))).toBe(true);
        expect(istNichtPflegeStation("Kardiologie")).toBe(false);
        expect(istNichtPflegeStation("Wohnbereich A")).toBe(false);
    });
});
