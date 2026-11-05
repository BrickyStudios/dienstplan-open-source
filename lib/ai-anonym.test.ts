import { describe, expect, it } from "vitest";
import { AusgangsschrankeError, erstelleAnonymisierung, istAllgemeinesWort, pruefeAusgang } from "@/lib/ai-anonym";
import { NAMENSGLEICH, NOMEN, WOERTER } from "@/lib/ai-wortliste";
const stamm = {
    personen: [
        { id: "a", name: "Sarah Lorenz" },
        { id: "b", name: "Mehmet Yılmaz" },
        { id: "c", name: "Sarah Vogt" },
        { id: "d", name: "Mai Nguyen" },
        { id: "e", name: "Anna von Berg" },
        { id: "f", name: "Li Wang" },
        { id: "g", name: "Petra Lange" },
    ],
    schichten: [
        { id: "0b8e2c1a-1111-4c2d-9e7f-000000000001", date: "2026-10-12", shift_type: "frueh", station: "Kardiologie 3B" },
    ],
    stationen: ["Kardiologie 3B", "Station 2", "Wohnbereich Rosengarten"],
    qualifikationen: ["examiniert", "Wundexperte ICW"],
    sondertage: ["Stadtfest Lindenau", "Karneval"],
    einrichtung: ["Marien-Klinikum Lindenau", "Lindenau"],
};
const an = erstelleAnonymisierung(stamm);
const neu = () => erstelleAnonymisierung(stamm);
describe("bekannt() — alles aus den Stammdaten wird zum Kürzel", () => {
    it("ersetzt den vollen Namen samt Gesundheitsangabe", () => {
        expect(an.bekannt("Sarah Lorenz ist mit Grippe ausgefallen.")).toBe("P01 ist mit Grippe ausgefallen.");
    });
    it("ersetzt Nachnamen allein, auch klein geschrieben und mit Sonderzeichen", () => {
        expect(an.bekannt("lorenz fehlt, Yılmaz springt ein")).toBe("P01 fehlt, P02 springt ein");
    });
    it("macht einen geteilten Vornamen nicht eindeutig", () => {
        expect(an.bekannt("keine Überstunden für Sarah")).toBe("keine Überstunden für P01 oder P03");
    });
    it("nimmt das Genitiv-s mit und greift nicht mitten in ein Wort", () => {
        expect(an.bekannt("Mehmets Nachtdienst")).toBe("P02 Nachtdienst");
        expect(an.bekannt("Annahme der Bergung")).toBe("Annahme der Bergung");
    });
    it("lässt einen Monat in der Datumsangabe stehen, ersetzt aber die Person „Mai\"", () => {
        expect(an.bekannt("am 1. Mai fehlt Mai")).toBe("am 1. Mai fehlt P04");
        expect(an.bekannt("Ende Mai fehlt Mai Nguyen")).toBe("Ende Mai fehlt P04");
    });
    it("ersetzt auch Namen mit zwei Buchstaben — aber nur so geschrieben", () => {
        expect(an.bekannt("Li hat frei, live dabei")).toBe("P06 hat frei, live dabei");
    });
    it("kodiert Stationen, Qualifikationen und Sondertage, auch über einen Namensteil", () => {
        expect(an.bekannt("Kardiologie 3B und die Kardiologie")).toBe("S01 und die S01");
        expect(an.bekannt("Rosengarten braucht Wundexperte ICW")).toBe("S03 braucht Q02");
        expect(an.bekannt("zum Stadtfest Lindenau")).toBe("zum T01");
    });
    it("schwärzt die Einrichtung", () => {
        expect(an.bekannt("Marien-Klinikum Lindenau, Haus in Lindenau")).toBe("[Einrichtung], Haus in [Einrichtung]");
    });
});
describe("freitext() — nur Wörter, die sicher kein Name sind", () => {
    it("schwärzt Patienten, Orte und Leasingkräfte, die in keiner Liste stehen", () => {
        const t = neu().freitext("Sarah Lorenz fällt aus, Frau Kowalski aus Brühl übernimmt morgen den Frühdienst.");
        expect(t).toBe("P01 fällt aus, Frau […1] aus […2] übernimmt morgen den Frühdienst.");
    });
    it("fasst einen mehrteiligen unbekannten Namen zu einer Stelle zusammen", () => {
        expect(neu().freitext("Gül-Ayşe Kowalski-Brandt ist krank")).toBe("[…1] ist krank");
    });
    it("schwärzt Diagnosen und andere Gesundheitsangaben — „krank\" reicht für die Planung", () => {
        expect(neu().freitext("P01 ist krank: Grippe, dazu schwanger und in Quarantäne")).toBe("P01 ist krank: […1], dazu […2] und in […3]");
    });
    it("lässt einen Nachnamen, der zugleich ein Wort ist, nur klein durch", () => {
        expect(neu().freitext("die Schicht dauert zu lange")).toBe("die Schicht dauert zu lange");
        expect(neu().freitext("Herr Klein fehlt")).toBe("Herr […1] fehlt");
        expect(neu().freitext("Klein fehlt heute")).toBe("[…1] fehlt heute");
        expect(neu().freitext("heute fehlt Klein")).toBe("heute fehlt […1]");
    });
    it("lässt Monatsnamen nur als Datum stehen", () => {
        expect(neu().freitext("im Juli fehlen zwei")).toBe("im Juli fehlen zwei");
        expect(neu().freitext("am 3. August fehlt August")).toBe("am 3. August fehlt […1]");
    });
    it("schwärzt Postleitzahl, Telefonnummer, Vorwahl und Zimmernummern mit Buchstaben", () => {
        expect(neu().freitext("Rückruf 0221 4711815, 50354, Zimmer 3B")).toBe("[…1], […2], […3]");
    });
    it("lässt Datum, Uhrzeit und Anzahl stehen", () => {
        expect(neu().freitext("am 12.10.2026 um 06:00 fehlen 3 Pflegekräfte")).toBe("am 12.10.2026 um 06:00 fehlen 3 Pflegekräfte");
    });
    it("schwärzt E-Mail-Adressen", () => {
        expect(neu().freitext("Mail an jonas@nurvo.de")).toBe("[…1] an […2]@[…3].[…4]");
    });
    it("akzeptiert nur Kürzel, die dieser Lauf vergeben hat", () => {
        expect(neu().freitext("P01 statt P77")).toBe("P01 statt […1]");
    });
    it("kennt Wörter auch ohne Umlaute", () => {
        expect(neu().freitext("Fruehdienst ohne Ueberstunden")).toBe("Fruehdienst ohne Ueberstunden");
    });
});
describe("zurueckText() — die Leitung liest wieder Klartext", () => {
    it("übersetzt Kürzel und Schwärzungen zurück", () => {
        const lauf = erstelleAnonymisierung(stamm);
        lauf.freitext("Frau Kowalski übernimmt");
        expect(lauf.zurueckText("P01 tauscht mit […1] auf S01, D001")).toBe("Sarah Lorenz tauscht mit Kowalski auf Kardiologie 3B, Kardiologie 3B, Frühdienst am 12.10.");
    });
    it("lässt fremde Kürzel stehen und geht durch ganze Objekte", () => {
        expect(an.zurueckAlles({ a: ["P99 und P01"], n: 8 })).toEqual({ a: ["P99 und Sarah Lorenz"], n: 8 });
    });
    it("übersetzt Kürzel in IDs", () => {
        expect(an.personId("P02")).toBe("b");
        expect(an.schichtId("D001")).toBe("0b8e2c1a-1111-4c2d-9e7f-000000000001");
        expect(an.personId("D001")).toBeNull();
        expect(an.schicht("0b8e2c1a-1111-4c2d-9e7f-000000000001")).toBe("D001");
    });
});
describe("pruefeAusgang() — die Schranke vor dem Senden", () => {
    const sicher = (t: string) => () => pruefeAusgang([t], an.schranke);
    it("lässt eine sauber anonymisierte Nachricht durch", () => {
        expect(sicher(an.freitext("Sarah Lorenz fällt im Frühdienst auf der Kardiologie aus, Frau Kowalski kommt."))).not.toThrow();
    });
    it("hält Namen, Stationen, Sondertage, Einrichtung und Ort auf", () => {
        for (const t of ["Sarah Lorenz", "Yılmaz", "Kardiologie 3B", "Rosengarten", "Stadtfest Lindenau", "Klinikum", "Lindenau", "Wundexperte ICW"]) {
            expect(sicher(`Text mit ${t} darin`)).toThrow(AusgangsschrankeError);
        }
    });
    it("hält IDs, E-Mail-Adressen und lange Ziffernfolgen auf", () => {
        expect(sicher("staffId=0b8e2c1a-1111-4c2d-9e7f-000000000001")).toThrow(AusgangsschrankeError);
        expect(sicher("an a.b@example.org")).toThrow(AusgangsschrankeError);
        expect(sicher("Tel 02233 12345")).toThrow(AusgangsschrankeError);
    });
    it("hält ein einmal geschwärztes Wort auch auf dem Rückweg auf", () => {
        const lauf = erstelleAnonymisierung(stamm);
        const raus = lauf.freitext("Frau Kowalski übernimmt");
        const zurueck = lauf.zurueckText(raus);
        expect(() => pruefeAusgang([zurueck], lauf.schranke)).toThrow(AusgangsschrankeError);
        expect(() => pruefeAusgang([lauf.freitext(zurueck)], lauf.schranke)).not.toThrow();
    });
    it("stört sich nicht an allgemeinen Wörtern, die zugleich Teil eines Namens sind", () => {
        expect(sicher("die Schicht dauert zu lange, Station 2, examiniert")).not.toThrow();
        expect(sicher("Petra Lange")).toThrow(AusgangsschrankeError);
    });
    it("meldet nie den gefundenen Text selbst", () => {
        try {
            pruefeAusgang(["Sarah Lorenz"], an.schranke);
        }
        catch (e) {
            expect((e as Error).message).not.toContain("Sarah");
        }
    });
});
describe("Wortliste — kein Name darf darin stehen", () => {
    const NAMEN = `
    Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer
    Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt
    Werner Schmitz Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber
    Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Schubert Vogel Friedrich Keller Günther Frank
    Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht Schuster Simon Ludwig Böhm Winter Kraus
    Martin Schumacher Krämer Vogt Stein Jäger Otto Sommer Groß Seidel Heinrich Brandt Haas Schreiber
    Graf Schulte Dietrich Ziegler Kuhn Kühn Pohl Engel Horn Busch Bergmann Thomas Voigt Sauer Arnold
    Wolff Pfeiffer Kraft Zimmer Wunsch Kind Heim Haus Mittag Schüler Ernst Kurz Frei Fröhlich Bach
    Maria Anna Sophie Marie Laura Lena Julia Sarah Lisa Lea Hannah Leonie Emma Mia Sabine Petra Andrea
    Claudia Susanne Monika Ursula Karin Stefanie Nicole Katharina Christina Thomas Michael Andreas Stefan
    Peter Klaus Jürgen Frank Uwe Wolfgang Jan Lukas Leon Paul Felix Jonas Tim Max Ben Elias Noah Finn
    Mehmet Ahmet Ali Fatma Ayşe Emine Olga Natalia Anja Tanja Sandra Melanie Daniela Birgit Heike
    Köln Hürth Berlin Hamburg München Bonn Essen Brühl Frechen Kerpen Aachen Düsseldorf Dortmund
  `.trim().split(/\s+/);
    it("kein Name ist ein erlaubtes Hauptwort", () => {
        const treffer = NAMEN.filter(n => NOMEN.has(n.toLowerCase()));
        expect(treffer).toEqual([]);
    });
    it("ein Name, der zugleich ein Wort ist, steht in NAMENSGLEICH und geht nur klein hinaus", () => {
        const treffer = NAMEN.filter(n => WOERTER.has(n.toLowerCase()) && !NAMENSGLEICH.has(n.toLowerCase()));
        expect(treffer).toEqual([]);
    });
    it("jeder dieser Namen wird im Freitext geschwärzt — mitten im Satz und am Anfang", () => {
        for (const n of NAMEN) {
            expect(erstelleAnonymisierung({}).freitext(`heute fehlt ${n}`), n).toBe("heute fehlt […1]");
            expect(erstelleAnonymisierung({}).freitext(`${n} fehlt heute`), n).toBe("[…1] fehlt heute");
        }
    });
    it("die Wortliste deckt eine typische Anfrage ab", () => {
        const anfrage = "Morgen fällt im Spätdienst eine examinierte Kraft aus, bitte ohne Überstunden planen und nicht die Nachtdienste vom Wochenende";
        const ungedeckt = anfrage.split(/[^\p{L}]+/u).filter(Boolean).filter(w => !istAllgemeinesWort(w));
        expect(ungedeckt).toEqual(["Kraft"]);
    });
});
describe("dokument() — Text eines hochgeladenen Dienstplans", () => {
    const plan = "Mitarbeiter | Mo | Di\nJana Hoffmann | F 7:30-12:30 | S\nTim Kraus | U | krank";
    it("lässt Kürzel und Zeiten stehen und schwärzt die Namen", () => {
        expect(neu().dokument(plan)).toBe("Mitarbeiter | Mo | Di\n[…1] | F 7:30-12:30 | S\n[…2] | U | krank");
    });
    it("freitext() schwärzt dieselben Kürzel weiterhin", () => {
        expect(neu().freitext("F und S")).toBe("[…1] und […2]");
    });
    it("setzt die Namen aus der Modellantwort wieder ein", () => {
        const an = neu();
        an.dokument(plan);
        expect(an.zurueckAlles({ mitarbeitende: [{ name: "[…1]" }, { name: "[…2]" }] })).toEqual({ mitarbeitende: [{ name: "Jana Hoffmann" }, { name: "Tim Kraus" }] });
    });
    it("die Schranke hält die geschwärzten Namen auf", () => {
        const an = neu();
        an.dokument(plan);
        expect(() => pruefeAusgang(["Jana Hoffmann arbeitet früh"], an.schranke)).toThrow(AusgangsschrankeError);
    });
});
