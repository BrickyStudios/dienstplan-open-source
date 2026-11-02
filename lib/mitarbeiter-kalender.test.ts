import { describe, expect, it } from "vitest";
import { icsBauen } from "@/lib/anbindungen/ics";
import { aboAdressen, neuerKalenderToken, persoenlicheTermine } from "@/lib/mitarbeiter-kalender";
const schicht = (id: string, date: string, shift_type: string, station: string | null = "Station 3", start: string | null = null, end: string | null = null) => ({ id, date, shift_type, start_time: start, end_time: end, station });
describe("persoenlicheTermine", () => {
    it("lässt den Nachtdienst am Folgetag enden", () => {
        const [t] = persoenlicheTermine([schicht("n", "2026-10-12", "nacht")]);
        expect(t.beginn).toBe("2026-10-12T22:00:00");
        expect(t.ende).toBe("2026-10-13T06:00:00");
    });
    it("nimmt die Zeiten der Schicht, wenn sie dranstehen", () => {
        const [t] = persoenlicheTermine([schicht("f", "2026-10-12", "frueh", "Innere 1", "06:30:00", "14:45")]);
        expect([t.beginn, t.ende, t.titel]).toEqual(["2026-10-12T06:30:00", "2026-10-12T14:45:00", "Frühdienst — Innere 1"]);
    });
    it("trägt Bereitschaften mit ein und sortiert nach Beginn", () => {
        const termine = persoenlicheTermine([schicht("s", "2026-10-13", "spaet")], [{ on_call_date: "2026-10-12", shift_type: "frueh" }]);
        expect(termine.map(t => t.titel)).toEqual(["Bereitschaft — Frühdienst", "Spätdienst — Station 3"]);
    });
    it("hält die Termin-Kennung über alle Abrufe gleich", () => {
        const a = persoenlicheTermine([schicht("x1", "2026-10-12", "frueh")]);
        const b = persoenlicheTermine([schicht("x1", "2026-10-12", "frueh")]);
        expect(a[0].uid).toBe(b[0].uid);
    });
});
describe("Datenschutz — eine gefundene Adresse verrät niemanden", () => {
    it("das fertige Abo enthält weder Personennamen noch Einrichtung", () => {
        const ics = icsBauen(persoenlicheTermine([schicht("f", "2026-10-12", "frueh", "Innere 1")]), { name: "Meine Dienste (Nurvo)" });
        expect(ics).toContain("Frühdienst — Innere 1");
        expect(ics).not.toMatch(/Besetzung/);
    });
});
describe("Adressen", () => {
    it("bietet https, webcal und den Google-Link", () => {
        const a = aboAdressen("https://www.nurvo.de/", "abc_DEF-123456789012345");
        expect(a.https).toBe("https://www.nurvo.de/api/kalender/abc_DEF-123456789012345.ics");
        expect(a.webcal).toBe("webcal://www.nurvo.de/api/kalender/abc_DEF-123456789012345.ics");
        expect(a.google).toBe("https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(a.webcal));
    });
    it("erzeugt lange, zufällige Token", () => {
        const t1 = neuerKalenderToken(), t2 = neuerKalenderToken();
        expect(t1).not.toBe(t2);
        expect(t1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});
