import { describe, it, expect } from "vitest";
import { istFachkraft, qualifikationVon, stufeAusRolle, ungepruefteAngaben, STUFEN_LABEL, QUALIFIKATIONSSTUFEN, } from "./qualifikation";
const alteRegel = (role: string) => {
    const r = role.toLowerCase();
    return r.includes("fachkraft") || r.includes("stationsleitung") || r.includes("examiniert");
};
describe("Was die alte Regel übersehen hat", () => {
    const uebersehen = [
        "Pflegefachfrau",
        "Pflegefachmann",
        "Gesundheits- und Krankenpflegerin",
        "Gesundheits- und Kinderkrankenpfleger",
        "exam. Altenpflegerin",
        "Altenpfleger",
        "Krankenschwester",
        "PFK",
        "GKP",
        "Wohnbereichsleitung",
        "Pflegedienstleitung",
    ];
    for (const rolle of uebersehen) {
        it(`erkennt „${rolle}" als Fachkraft`, () => {
            expect(stufeAusRolle(rolle)).toBe("fachkraft");
            expect(alteRegel(rolle)).toBe(false);
        });
    }
});
describe("Was die alte Regel falsch mitgezählt hat", () => {
    it("zählt eine Hilfskraft in Ausbildung NICHT als Fachkraft", () => {
        const rolle = "Pflegehilfskraft in Ausbildung zur Fachkraft";
        expect(stufeAusRolle(rolle)).toBe("hilfskraft_ohne");
        expect(alteRegel(rolle)).toBe(true);
    });
});
describe("Was weiterhin stimmt", () => {
    it("erkennt die Schreibweisen, die schon vorher funktioniert haben", () => {
        for (const rolle of ["Pflegefachkraft", "Stationsleitung", "Examinierte Pflegekraft"]) {
            expect(stufeAusRolle(rolle)).toBe("fachkraft");
            expect(alteRegel(rolle)).toBe(true);
        }
    });
});
describe("Die übrigen Stufen", () => {
    it("trennt Hilfskraft mit Ausbildung von Hilfskraft ohne", () => {
        expect(stufeAusRolle("Pflegeassistentin")).toBe("hilfskraft_1j");
        expect(stufeAusRolle("Krankenpflegehelferin")).toBe("hilfskraft_1j");
        expect(stufeAusRolle("Pflegehelfer")).toBe("hilfskraft_ohne");
        expect(stufeAusRolle("Betreuungskraft")).toBe("hilfskraft_ohne");
    });
    it("nimmt heraus, was gar nicht zur Pflege zählt", () => {
        for (const rolle of ["Verwaltung", "Hauswirtschaft", "Reinigung", "Ärztlicher Dienst", "Sozialdienst"]) {
            expect(stufeAusRolle(rolle)).toBe("sonstige");
        }
    });
    it("behandelt eine leere Rolle als „nicht in der Pflege", () => {
        expect(stufeAusRolle("")).toBe("sonstige");
        expect(stufeAusRolle(null)).toBe("sonstige");
    });
});
describe("Woher die Angabe kommt", () => {
    it("nimmt das gesetzte Feld und nennt es bestätigt", () => {
        const a = qualifikationVon({ role: "Verwaltung", qualifikation: "fachkraft", qualifikation_bestaetigt: true });
        expect(a).toEqual({ stufe: "fachkraft", quelle: "bestaetigt", belastbar: true });
    });
    it("nimmt das gesetzte Feld auch ohne Bestätigung — aber nennt es nicht belastbar", () => {
        const a = qualifikationVon({ role: "Verwaltung", qualifikation: "fachkraft", qualifikation_bestaetigt: false });
        expect(a).toMatchObject({ stufe: "fachkraft", quelle: "gesetzt", belastbar: false });
    });
    it("fällt ohne Feld auf die Ableitung zurück und sagt das", () => {
        const a = qualifikationVon({ role: "Pflegefachfrau" });
        expect(a).toEqual({ stufe: "fachkraft", quelle: "abgeleitet", belastbar: false });
    });
    it("ignoriert einen unbekannten Wert im Feld und leitet ab", () => {
        const a = qualifikationVon({ role: "Pflegefachfrau", qualifikation: "irgendwas" });
        expect(a.quelle).toBe("abgeleitet");
        expect(a.stufe).toBe("fachkraft");
    });
    it("das gesetzte Feld schlägt die Rolle — auch wenn beide sich widersprechen", () => {
        expect(istFachkraft({ role: "Pflegefachkraft", qualifikation: "hilfskraft_ohne" })).toBe(false);
    });
});
describe("Wie viel davon geraten ist", () => {
    it("zählt jede nicht bestätigte Angabe", () => {
        const belegschaft = [
            { role: "Pflegefachkraft" },
            { role: "x", qualifikation: "fachkraft", qualifikation_bestaetigt: false },
            { role: "x", qualifikation: "fachkraft", qualifikation_bestaetigt: true },
        ];
        expect(ungepruefteAngaben(belegschaft)).toBe(2);
    });
});
describe("Vollständigkeit", () => {
    it("hat für jede Stufe eine Beschriftung", () => {
        for (const s of QUALIFIKATIONSSTUFEN)
            expect(STUFEN_LABEL[s]).toBeTruthy();
    });
});
