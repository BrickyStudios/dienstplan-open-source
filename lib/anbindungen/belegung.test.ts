import { describe, expect, it } from "vitest";
import { entscheiden, type OffenerAbschnitt } from "./belegung";
import { belegungsaenderung, hl7Lesen } from "./hl7";
const OFFEN: OffenerAbschnitt[] = [
    { id: "ab-1", fall_schluessel: "aaa", station: "Station 1", seit: "2026-09-20T08:00:00Z" },
    { id: "ab-2", fall_schluessel: "bbb", station: "Station 3", seit: "2026-09-19T22:00:00Z" },
];
describe("entscheiden", () => {
    it("ein unbekannter Fall ist eine Aufnahme", () => {
        expect(entscheiden(OFFEN, "ccc", "Station 1")).toEqual({ art: "neu" });
    });
    it("derselbe Fall am selben Ort ändert nichts", () => {
        expect(entscheiden(OFFEN, "aaa", "Station 1")).toEqual({ art: "unveraendert" });
    });
    it("derselbe Fall woanders schließt den alten Abschnitt", () => {
        expect(entscheiden(OFFEN, "aaa", "Station 3")).toEqual({
            art: "verlegt",
            altenAbschnittSchliessen: "ab-1",
        });
    });
    it("ohne offene Abschnitte ist jeder Fall neu", () => {
        expect(entscheiden([], "aaa", "Station 1")).toEqual({ art: "neu" });
    });
});
describe("Verlegung, durchgespielt vom Ereignis bis zur Entscheidung", () => {
    const SALZ = "salz";
    function aenderungAus(ereignis: string, station: string, fallNummer = "V0815") {
        const roh = [
            `MSH|^~\\&|KIS|HAUS|NURVO|NURVO|20260920143000||ADT^${ereignis}|X|P|2.5`,
            "PID|1||4711",
            `PV1|1|I|${station}||||||||||||||||${fallNummer}`,
        ].join("\r");
        return belegungsaenderung(hl7Lesen(roh)!, SALZ)!;
    }
    it("Aufnahme und Verlegung betreffen denselben Abschnitt, nicht zwei", () => {
        const auf = aenderungAus("A01", "STAT1");
        const nachAufnahme: OffenerAbschnitt[] = [
            { id: "ab-neu", fall_schluessel: auf.fallSchluessel, station: "STAT1", seit: auf.zeitpunkt },
        ];
        const ver = aenderungAus("A02", "STAT3");
        expect(entscheiden(nachAufnahme, ver.fallSchluessel, ver.station)).toEqual({
            art: "verlegt",
            altenAbschnittSchliessen: "ab-neu",
        });
    });
    it("eine wiederholte Aufnahme desselben Falls legt keinen zweiten Abschnitt an", () => {
        const auf = aenderungAus("A01", "STAT1");
        const bestand: OffenerAbschnitt[] = [
            { id: "ab-neu", fall_schluessel: auf.fallSchluessel, station: "STAT1", seit: auf.zeitpunkt },
        ];
        expect(entscheiden(bestand, auf.fallSchluessel, auf.station)).toEqual({ art: "unveraendert" });
    });
    it("zwei verschiedene Fälle auf derselben Station bleiben zwei", () => {
        const a = aenderungAus("A01", "STAT1", "V0815");
        const b = aenderungAus("A01", "STAT1", "V0816");
        expect(a.fallSchluessel).not.toBe(b.fallSchluessel);
        const bestand: OffenerAbschnitt[] = [
            { id: "ab-a", fall_schluessel: a.fallSchluessel, station: "STAT1", seit: a.zeitpunkt },
        ];
        expect(entscheiden(bestand, b.fallSchluessel, b.station)).toEqual({ art: "neu" });
    });
});
