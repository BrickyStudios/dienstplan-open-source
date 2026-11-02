import { describe, expect, it } from "vitest";
import { icsBauen, schichtenZuTerminen, type SchichtFuerKalender } from "./ics";
const SCHICHTEN: SchichtFuerKalender[] = [
    { id: "s1", date: "2026-09-21", shift_type: "frueh", start_time: "06:00:00", end_time: "14:00:00", station: "Station 1", planned_staff: 4, actual_staff: 3 },
    { id: "s2", date: "2026-09-21", shift_type: "nacht", start_time: "22:00:00", end_time: "06:00:00", station: "Station 1", planned_staff: 2, actual_staff: 2 },
];
describe("schichtenZuTerminen", () => {
    it("legt das Ende des Nachtdiensts auf den Folgetag", () => {
        const [, nacht] = schichtenZuTerminen(SCHICHTEN, "Klinikum Beispiel");
        expect(nacht.beginn).toBe("2026-09-21T22:00:00");
        expect(nacht.ende).toBe("2026-09-22T06:00:00");
    });
    it("lässt den Frühdienst am selben Tag enden", () => {
        const [frueh] = schichtenZuTerminen(SCHICHTEN, "Klinikum Beispiel");
        expect(frueh.beginn).toBe("2026-09-21T06:00:00");
        expect(frueh.ende).toBe("2026-09-21T14:00:00");
    });
    it("nimmt Vorgabezeiten, wenn an der Schicht keine stehen", () => {
        const ohne = schichtenZuTerminen([{ id: "s3", date: "2026-09-21", shift_type: "spaet", start_time: null, end_time: null, station: null }], "Haus");
        expect(ohne[0].beginn).toBe("2026-09-21T14:00:00");
        expect(ohne[0].ende).toBe("2026-09-21T22:00:00");
    });
    it("gibt jeder Schicht eine Kennung, die über Abrufe gleich bleibt", () => {
        const a = schichtenZuTerminen(SCHICHTEN, "Haus");
        const b = schichtenZuTerminen(SCHICHTEN, "Haus");
        expect(a[0].uid).toBe(b[0].uid);
        expect(a[0].uid).not.toBe(a[1].uid);
    });
    it("schreibt Station und Besetzung in den Termin", () => {
        const [frueh] = schichtenZuTerminen(SCHICHTEN, "Klinikum Beispiel");
        expect(frueh.titel).toBe("Frühdienst — Station 1");
        expect(frueh.beschreibung).toContain("Besetzung: 3 von 4");
        expect(frueh.beschreibung).toContain("Klinikum Beispiel");
    });
});
describe("icsBauen", () => {
    const kalender = icsBauen(schichtenZuTerminen(SCHICHTEN, "Klinikum Beispiel"), {
        name: "Nurvo — Station 1",
    });
    it("baut einen vollständigen Kalender mit Zeitzone", () => {
        expect(kalender).toContain("BEGIN:VCALENDAR");
        expect(kalender).toContain("END:VCALENDAR");
        expect(kalender).toContain("BEGIN:VTIMEZONE");
        expect(kalender).toContain("TZID:Europe/Berlin");
        expect(kalender.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    });
    it("hängt die Zeitzone an jeden Termin statt auf UTC auszuweichen", () => {
        expect(kalender).toContain("DTSTART;TZID=Europe/Berlin:20260921T060000");
        expect(kalender).toContain("DTEND;TZID=Europe/Berlin:20260922T060000");
    });
    it("trennt Zeilen mit CRLF, wie der Standard es verlangt", () => {
        expect(kalender.endsWith("\r\n")).toBe(true);
        expect(/[^\r]\n/.test(kalender)).toBe(false);
    });
    it("entwertet Komma, Semikolon und Backslash", () => {
        const k = icsBauen([{ uid: "x@nurvo.de", beginn: "2026-09-21T06:00:00", ende: "2026-09-21T14:00:00", titel: "Früh; Station 1, Haus C\\Nord" }], { name: "T" });
        expect(k).toContain("SUMMARY:Früh\\; Station 1\\, Haus C\\\\Nord");
    });
    it("macht aus einem Zeilenumbruch in der Beschreibung ein \\n", () => {
        const k = icsBauen([{ uid: "x@nurvo.de", beginn: "2026-09-21T06:00:00", ende: "2026-09-21T14:00:00", titel: "T", beschreibung: "Zeile 1\nZeile 2" }], { name: "T" });
        expect(k).toContain("DESCRIPTION:Zeile 1\\nZeile 2");
    });
    it("faltet lange Zeilen, ohne einen Umlaut zu zerschneiden", () => {
        const langerTitel = "Frühdienst über den Dächern von Köln — Station für Anästhesie und Intensivmedizin, Häuser A bis D";
        const k = icsBauen([{ uid: "lang@nurvo.de", beginn: "2026-09-21T06:00:00", ende: "2026-09-21T14:00:00", titel: langerTitel }], { name: "T" });
        for (const z of k.split("\r\n")) {
            expect(Buffer.from(z, "utf8").length).toBeLessThanOrEqual(75);
        }
        expect(k).not.toContain("�");
        const wiederZusammen = k
            .split("\r\n")
            .map((z) => (z.startsWith(" ") ? z.slice(1) : `\n${z}`))
            .join("")
            .replace(/\\,/g, ",")
            .replace(/\\;/g, ";");
        expect(wiederZusammen).toContain(langerTitel);
    });
    it("sagt dem Kalender, wie oft er nachsehen soll", () => {
        expect(kalender).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT60M");
    });
});
