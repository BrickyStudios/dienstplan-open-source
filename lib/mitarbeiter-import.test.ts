import { describe, expect, it } from "vitest";
import { beschaeftigungLesen, mitarbeiterListeLesen, nameZerlegen, zahlLesen, } from "@/lib/mitarbeiter-import";
describe("nameZerlegen", () => {
    it("trennt „Nachname, Vorname\"", () => {
        expect(nameZerlegen("Meier, Anna")).toEqual({ vorname: "Anna", nachname: "Meier" });
    });
    it("nimmt bei „Vorname Nachname\" das erste Wort als Vornamen", () => {
        expect(nameZerlegen("Anna Meier")).toEqual({ vorname: "Anna", nachname: "Meier" });
    });
    it("lässt mehrteilige Nachnamen zusammen", () => {
        expect(nameZerlegen("Anna von der Heide")).toEqual({ vorname: "Anna", nachname: "von der Heide" });
    });
    it("rät bei einem einzelnen Wort nicht", () => {
        expect(nameZerlegen("Meier")).toEqual({ vorname: "", nachname: "Meier" });
    });
});
describe("zahlLesen", () => {
    it("liest die deutsche Dezimalform", () => expect(zahlLesen("38,5")).toBe(38.5));
    it("entfernt das Eurozeichen", () => expect(zahlLesen("18,50 €")).toBe(18.5));
    it("gibt bei leerer Zelle null", () => expect(zahlLesen("   ")).toBeNull());
    it("gibt bei Text null", () => expect(zahlLesen("k. A.")).toBeNull());
});
describe("beschaeftigungLesen", () => {
    it("versteht Kürzel", () => {
        expect(beschaeftigungLesen("VZ")).toBe("Vollzeit");
        expect(beschaeftigungLesen("TZ")).toBe("Teilzeit");
    });
    it("versteht geringfügig und die Verdienstgrenze", () => {
        expect(beschaeftigungLesen("geringfügig")).toBe("Minijob");
        expect(beschaeftigungLesen("556 €")).toBe("Minijob");
    });
    it("gibt null zurück, statt zu raten", () => expect(beschaeftigungLesen("Praktikum")).toBeNull());
});
describe("mitarbeiterListeLesen — Excel-Einfügen mit Kopfzeile", () => {
    const text = [
        "Nachname\tVorname\tStation\tBeschäftigung\tWochenstunden",
        "Meier\tAnna\tStation 3\tVollzeit\t40",
        "Kral\tBert\tStation 3\tTeilzeit\t20",
        "Sadik\tCem\tStation 1\tMinijob\t10",
    ].join("\n");
    it("erkennt Tabulator und Kopfzeile", () => {
        const r = mitarbeiterListeLesen(text);
        expect(r.trenner).toBe("\t");
        expect(r.kopfzeileErkannt).toBe(true);
        expect(r.zeilen).toHaveLength(3);
    });
    it("setzt Namen richtig zusammen", () => {
        const r = mitarbeiterListeLesen(text);
        expect(r.zeilen[0].name).toBe("Anna Meier");
        expect(r.zeilen[0].vorname).toBe("Anna");
        expect(r.zeilen[0].nachname).toBe("Meier");
    });
    it("übernimmt Station, Beschäftigung und Stunden", () => {
        const r = mitarbeiterListeLesen(text);
        expect(r.zeilen[1]).toMatchObject({
            station: "Station 3", beschaeftigung: "Teilzeit", stundenWoche: 20,
        });
    });
});
describe("mitarbeiterListeLesen — deutsches CSV mit Semikolon", () => {
    it("liest Semikolon und deutsche Dezimalzahlen", () => {
        const r = mitarbeiterListeLesen([
            "Name;E-Mail;Std/Woche;Stundenlohn",
            "Meier, Anna;anna.meier@klinik.de;38,5;19,80",
        ].join("\n"));
        expect(r.trenner).toBe(";");
        expect(r.zeilen[0]).toMatchObject({
            name: "Anna Meier", email: "anna.meier@klinik.de", stundenWoche: 38.5, stundenlohn: 19.8,
        });
    });
});
describe("mitarbeiterListeLesen — ohne Kopfzeile", () => {
    it("rät die Spalten aus dem Inhalt", () => {
        const r = mitarbeiterListeLesen([
            "Meier\tAnna\tanna@klinik.de\t0151 2345678\tVollzeit",
            "Kral\tBert\tbert@klinik.de\t0151 8765432\tTeilzeit",
        ].join("\n"));
        expect(r.kopfzeileErkannt).toBe(false);
        expect(r.zeilen[0]).toMatchObject({
            name: "Anna Meier", email: "anna@klinik.de", telefon: "0151 2345678", beschaeftigung: "Vollzeit",
        });
    });
    it("nimmt eine reine Namensliste an", () => {
        const r = mitarbeiterListeLesen("Anna Meier\nBert Kral\nCem Sadik");
        expect(r.zeilen).toHaveLength(3);
        expect(r.zeilen.map(z => z.name)).toEqual(["Anna Meier", "Bert Kral", "Cem Sadik"]);
        expect(r.zeilen[0].beschaeftigung).toBe("Vollzeit");
        expect(r.zeilen[0].stundenWoche).toBe(40);
    });
});
describe("mitarbeiterListeLesen — die Vorgabe der Leitung", () => {
    it("füllt Station und Beschäftigung, wenn die Liste sie nicht hat", () => {
        const r = mitarbeiterListeLesen("Anna Meier\nBert Kral", {
            station: "Wohnbereich Nord", beschaeftigung: "Teilzeit",
        });
        expect(r.zeilen[0]).toMatchObject({
            station: "Wohnbereich Nord", beschaeftigung: "Teilzeit", stundenWoche: 20,
        });
    });
    it("lässt sich von der Vorgabe nicht überschreiben, was in der Liste steht", () => {
        const r = mitarbeiterListeLesen([
            "Name;Station;Beschäftigung",
            "Anna Meier;Station 3;Minijob",
        ].join("\n"), { station: "Wohnbereich Nord", beschaeftigung: "Teilzeit" });
        expect(r.zeilen[0]).toMatchObject({ station: "Station 3", beschaeftigung: "Minijob" });
    });
});
describe("mitarbeiterListeLesen — was auffallen muss", () => {
    it("rechnet Monatsstunden auf die Woche und sagt es", () => {
        const r = mitarbeiterListeLesen([
            "Name;Stunden",
            "Anna Meier;173",
        ].join("\n"));
        expect(r.zeilen[0].stundenWoche).toBe(40);
        expect(r.zeilen[0].hinweise.join(" ")).toContain("Monatswert");
    });
    it("meldet einen doppelten Namen, statt ihn zweimal anzulegen", () => {
        const r = mitarbeiterListeLesen("Anna Meier\nBert Kral\nAnna Meier");
        expect(r.zeilen).toHaveLength(3);
        expect(r.zeilen[2].hinweise.join(" ")).toContain("Zeile 1");
    });
    it("überspringt Zeilen ohne Namen mit Begründung", () => {
        const r = mitarbeiterListeLesen([
            "Name;Station",
            "Anna Meier;Station 3",
            ";Station 3",
        ].join("\n"));
        expect(r.zeilen).toHaveLength(1);
        expect(r.uebersprungen).toHaveLength(1);
        expect(r.uebersprungen[0].grund).toContain("Kein Name");
    });
    it("meldet eine kaputte E-Mail, verwirft die Zeile aber nicht", () => {
        const r = mitarbeiterListeLesen([
            "Name;E-Mail",
            "Anna Meier;anna(at)klinik.de",
        ].join("\n"));
        expect(r.zeilen).toHaveLength(1);
        expect(r.zeilen[0].email).toBe("");
        expect(r.zeilen[0].hinweise.join(" ")).toContain("E-Mail");
    });
    it("meldet eine unbekannte Beschäftigungsart und nimmt die Vorgabe", () => {
        const r = mitarbeiterListeLesen([
            "Name;Beschäftigung",
            "Anna Meier;Praktikum",
        ].join("\n"));
        expect(r.zeilen[0].beschaeftigung).toBe("Vollzeit");
        expect(r.zeilen[0].hinweise.join(" ")).toContain("Praktikum");
    });
    it("verträgt leere Zeilen mittendrin und zählt die Zeilennummern trotzdem richtig", () => {
        const r = mitarbeiterListeLesen("Anna Meier\n\n\nBert Kral");
        expect(r.zeilen).toHaveLength(2);
        expect(r.zeilen[1].zeile).toBe(4);
    });
    it("gibt bei leerer Eingabe ein leeres Ergebnis statt eines Fehlers", () => {
        const r = mitarbeiterListeLesen("   \n  ");
        expect(r.zeilen).toHaveLength(0);
        expect(r.uebersprungen).toHaveLength(0);
    });
    it("hält ein Komma im Namen von einem Trennkomma auseinander", () => {
        const r = mitarbeiterListeLesen("Meier, Anna\nKral, Bert");
        expect(r.zeilen.map(z => z.name)).toEqual(["Anna Meier", "Bert Kral"]);
    });
});
