import { describe, expect, it } from "vitest";
import { belegungsaenderung, fallSchluessel, feldWert, hl7Lesen, hl7ZeitZuIso, quittung, segment, } from "./hl7";
const AUFNAHME = [
    "MSH|^~\\&|KIS|KLINIKUM|NURVO|NURVO|20260920143000||ADT^A01|MSG00001|P|2.5",
    "EVN|A01|20260920143000",
    "PID|1||4711^^^KIS^MR||Mustermann^Erika^^^^^L||19800101|W",
    "PV1|1|I|STAT1A^193^1^KLINIKUM||||1234^Arzt^Anna|||CHI|||||||||V0815|||||||||||||||||||||||||20260920143000",
].join("\r");
const VERLEGUNG = [
    "MSH|^~\\&|KIS|KLINIKUM|NURVO|NURVO|20260920180000||ADT^A02|MSG00002|P|2.5",
    "EVN|A02|20260920180000",
    "PID|1||4711^^^KIS^MR||Mustermann^Erika",
    "PV1|1|I|STAT3B^301^2||||||||||||||||V0815",
].join("\r");
const ENTLASSUNG = [
    "MSH|^~\\&|KIS|KLINIKUM|NURVO|NURVO|20260922090000||ADT^A03|MSG00003|P|2.5",
    "PID|1||4711^^^KIS^MR||Mustermann^Erika",
    "PV1|1|I|STAT3B^301^2||||||||||||||||V0815|||||||||||||||||||||||||20260920143000|20260922090000",
].join("\r");
const SALZ = "salz-der-einrichtung";
describe("hl7Lesen", () => {
    it("zerlegt eine Aufnahme in Art, Ereignis und Segmente", () => {
        const n = hl7Lesen(AUFNAHME)!;
        expect(n.art).toBe("ADT");
        expect(n.ereignis).toBe("A01");
        expect(n.nummer).toBe("MSG00001");
        expect(n.version).toBe("2.5");
        expect(n.segmente.map((s) => s.name)).toEqual(["MSH", "EVN", "PID", "PV1"]);
    });
    it("zählt MSH-Felder wie der Standard — MSH-9 ist der Nachrichtentyp", () => {
        const n = hl7Lesen(AUFNAHME)!;
        expect(feldWert(segment(n, "MSH")!, 9)).toBe("ADT^A01");
        expect(feldWert(segment(n, "MSH")!, 1)).toBe("|");
    });
    it("nimmt CRLF und LF genauso wie CR", () => {
        const mitCrlf = AUFNAHME.split("\r").join("\r\n");
        const mitLf = AUFNAHME.split("\r").join("\n");
        expect(hl7Lesen(mitCrlf)?.segmente).toHaveLength(4);
        expect(hl7Lesen(mitLf)?.segmente).toHaveLength(4);
    });
    it("gibt null, wenn es keine HL7-Nachricht ist", () => {
        expect(hl7Lesen("{\"resourceType\":\"Bundle\"}")).toBeNull();
        expect(hl7Lesen("")).toBeNull();
    });
    it("folgt eigenen Trennzeichen, wenn die Nachricht welche ansagt", () => {
        const eigen = "MSH#@~\\&#KIS#HAUS#NURVO#NURVO#20260920143000##ADT@A01#X1#P#2.5";
        const n = hl7Lesen(eigen)!;
        expect(n.art).toBe("ADT");
        expect(n.ereignis).toBe("A01");
    });
    it("löst Entwertungen auf, damit Stationsnamen lesbar bleiben", () => {
        const roh = [
            "MSH|^~\\&|KIS|HAUS|NURVO|NURVO|20260920143000||ADT^A01|X2|P|2.5",
            "PID|1||9|",
            "PV1|1|I|Station\\S\\1^^^||||||||||||||||V1",
        ].join("\r");
        const aenderung = belegungsaenderung(hl7Lesen(roh)!, SALZ)!;
        expect(aenderung.station).toBe("Station^1");
    });
});
describe("belegungsaenderung", () => {
    it("macht aus einer Aufnahme einen Zugang auf die genannte Station", () => {
        const a = belegungsaenderung(hl7Lesen(AUFNAHME)!, SALZ)!;
        expect(a.art).toBe("zugang");
        expect(a.station).toBe("STAT1A");
        expect(a.aufenthalt).toBe("I");
        expect(a.zeitpunkt).toBe("2026-09-20T14:30:00");
    });
    it("macht aus einer Verlegung einen Wechsel — derselbe Fall, andere Station", () => {
        const auf = belegungsaenderung(hl7Lesen(AUFNAHME)!, SALZ)!;
        const ver = belegungsaenderung(hl7Lesen(VERLEGUNG)!, SALZ)!;
        expect(ver.art).toBe("wechsel");
        expect(ver.station).toBe("STAT3B");
        expect(ver.fallSchluessel).toBe(auf.fallSchluessel);
    });
    it("nimmt bei der Entlassung den Entlasszeitpunkt, nicht den Aufnahmezeitpunkt", () => {
        const e = belegungsaenderung(hl7Lesen(ENTLASSUNG)!, SALZ)!;
        expect(e.art).toBe("abgang");
        expect(e.zeitpunkt).toBe("2026-09-22T09:00:00");
    });
    it("verwirft Ereignisse, die die Belegung nicht ändern", () => {
        const stammdaten = AUFNAHME.replace("ADT^A01", "ADT^A31").replace("EVN|A01", "EVN|A31");
        expect(belegungsaenderung(hl7Lesen(stammdaten)!, SALZ)).toBeNull();
    });
    it("verwirft alles, was keine ADT-Nachricht ist", () => {
        const labor = AUFNAHME.replace("ADT^A01", "ORU^R01");
        expect(belegungsaenderung(hl7Lesen(labor)!, SALZ)).toBeNull();
    });
    it("wirft eine Korrektur ohne neue Station nicht aus der Zählung", () => {
        const korrektur = [
            "MSH|^~\\&|KIS|HAUS|NURVO|NURVO|20260920143000||ADT^A08|X3|P|2.5",
            "PID|1||4711",
            "PV1|1|I|||||||||||||||||V0815",
        ].join("\r");
        expect(belegungsaenderung(hl7Lesen(korrektur)!, SALZ)).toBeNull();
    });
});
describe("fallSchluessel", () => {
    it("gibt die Fallnummer nirgends preis", () => {
        const a = belegungsaenderung(hl7Lesen(AUFNAHME)!, SALZ)!;
        const alsText = JSON.stringify(a);
        expect(alsText).not.toContain("4711");
        expect(alsText).not.toContain("V0815");
        expect(alsText).not.toContain("Mustermann");
        expect(alsText).not.toContain("19800101");
    });
    it("ist zwischen zwei Einrichtungen nicht vergleichbar", () => {
        expect(fallSchluessel("V0815", "salz-a")).not.toBe(fallSchluessel("V0815", "salz-b"));
    });
    it("ist innerhalb einer Einrichtung stabil", () => {
        expect(fallSchluessel("V0815", SALZ)).toBe(fallSchluessel("V0815", SALZ));
        expect(fallSchluessel("V0815", SALZ)).toHaveLength(32);
    });
    it("verweigert die Arbeit ohne Salz, statt ein schwaches Pseudonym zu bauen", () => {
        expect(() => belegungsaenderung(hl7Lesen(AUFNAHME)!, "")).toThrow(/Salz/);
    });
});
describe("hl7ZeitZuIso", () => {
    it("liest den vollen Stempel als Ortszeit", () => {
        expect(hl7ZeitZuIso("20260920143000")).toBe("2026-09-20T14:30:00");
    });
    it("kommt mit einem Datum ohne Uhrzeit zurecht", () => {
        expect(hl7ZeitZuIso("20260920")).toBe("2026-09-20T00:00:00");
    });
    it("rechnet eine angegebene Zone nach UTC", () => {
        expect(hl7ZeitZuIso("20260920143000+0200")).toBe("2026-09-20T12:30:00.000Z");
    });
    it("gibt null bei Unsinn", () => {
        expect(hl7ZeitZuIso("morgen")).toBeNull();
        expect(hl7ZeitZuIso("")).toBeNull();
    });
});
describe("quittung", () => {
    it("bestätigt mit der Nachrichtennummer des Senders", () => {
        const q = quittung(hl7Lesen(AUFNAHME), "AA");
        expect(q).toContain("MSA|AA|MSG00001");
        expect(q.split("\r")[0]).toMatch(/^MSH\|\^~\\&\|NURVO/);
    });
    it("quittiert auch eine Nachricht, die sich nicht lesen ließ", () => {
        expect(quittung(null, "AR", "Kein MSH")).toContain("MSA|AR|UNBEKANNT|Kein MSH");
    });
    it("lässt keine Trennzeichen aus dem Fehlertext in die Antwort", () => {
        const q = quittung(hl7Lesen(AUFNAHME), "AE", "kaputt|an\rStelle 3");
        expect(q.split("\r")).toHaveLength(2);
        expect(q).toContain("MSA|AE|MSG00001|kaputt an Stelle 3");
    });
});
