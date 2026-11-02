import { describe, it, expect } from "vitest";
import { pruefeWeitereArbeitszeit, type SchichtEintrag } from "./arbzg-weitere";
const P = "Mara Vogt";
const s = (id: string, date: string, shift_type: string, start?: string, end?: string): SchichtEintrag => ({ id, date, shift_type, start_time: start ?? null, end_time: end ?? null });
const alle = (liste: SchichtEintrag[]) => Object.fromEntries(liste.map(x => [x.id, [P]]));
const pruefe = (liste: SchichtEintrag[]) => pruefeWeitereArbeitszeit(liste, alle(liste));
const regeln = (liste: SchichtEintrag[]) => pruefe(liste).map(b => b.regel);
describe("§ 5 Abs. 2 — Ausgleich verkürzter Ruhezeiten", () => {
    it("meldet eine verkürzte Ruhezeit ohne Ausgleich im selben Monat", () => {
        const befunde = pruefe([s("a", "2026-10-05", "spaet"), s("b", "2026-10-06", "frueh")]);
        const b = befunde.find(x => x.regel === "ruhezeit-ausgleich");
        expect(b).toBeTruthy();
        expect(b!.schwere).toBe("blocker");
        expect(b!.norm).toBe("§ 5 Abs. 1 ArbZG");
    });
    it("nennt eine Verkürzung auf 10,5 Stunden nur eine Warnung — die Ausnahme deckt sie", () => {
        const befunde = pruefe([
            s("a", "2026-10-05", "spaet", "14:00", "22:00"),
            s("b", "2026-10-06", "frueh", "08:30", "16:30"),
        ]);
        const b = befunde.find(x => x.regel === "ruhezeit-ausgleich");
        expect(b?.schwere).toBe("warnung");
        expect(b?.norm).toBe("§ 5 Abs. 2 ArbZG");
    });
    it("schweigt, wenn im selben Monat eine Ruhezeit von 12 Stunden gegenübersteht", () => {
        const befunde = pruefe([
            s("a", "2026-10-05", "spaet", "14:00", "22:00"),
            s("b", "2026-10-06", "frueh", "08:30", "16:30"),
            s("c", "2026-10-09", "frueh", "06:00", "14:00"),
        ]);
        expect(befunde.map(b => b.regel)).not.toContain("ruhezeit-ausgleich");
    });
});
describe("§ 3 — werktägliche Arbeitszeit", () => {
    it("meldet eine einzelne Schicht über zehn Stunden als Verstoß", () => {
        const b = pruefe([s("a", "2026-10-05", "frueh", "06:00", "17:00")]).find(x => x.regel === "tagesarbeitszeit-schnitt" && x.schwere === "blocker");
        expect(b).toBeTruthy();
        expect(b!.text).toContain("11");
    });
    it("meldet einen zu hohen Schnitt über einen Monat nur als Hinweis — das Fenster ist zu kurz", () => {
        const liste = Array.from({ length: 12 }, (_, i) => s(`x${i}`, `2026-10-${String(i * 2 + 1).padStart(2, "0")}`, "frueh", "06:00", "15:30"));
        const b = pruefe(liste).find(x => x.regel === "tagesarbeitszeit-schnitt");
        expect(b?.schwere).toBe("hinweis");
        expect(b?.text).toContain("sechs Kalendermonate");
    });
    it("schweigt bei acht Stunden", () => {
        const liste = Array.from({ length: 10 }, (_, i) => s(`x${i}`, `2026-10-${String(i * 2 + 1).padStart(2, "0")}`, "frueh"));
        expect(regeln(liste)).not.toContain("tagesarbeitszeit-schnitt");
    });
});
describe("§ 6 Abs. 2 — Nachtarbeitszeit", () => {
    it("meldet einen Nachtdienst über zehn Stunden", () => {
        const b = pruefe([s("a", "2026-10-05", "nacht", "20:00", "07:00")]).find(x => x.regel === "nachtarbeitszeit" && x.schwere === "blocker");
        expect(b).toBeTruthy();
    });
    it("meldet einen Monatsschnitt über acht Stunden bei Nachtarbeit", () => {
        const liste = Array.from({ length: 8 }, (_, i) => s(`n${i}`, `2026-10-${String(i * 3 + 1).padStart(2, "0")}`, "nacht", "21:00", "06:00"));
        const b = pruefe(liste).find(x => x.regel === "nachtarbeitszeit" && x.schwere === "warnung");
        expect(b).toBeTruthy();
    });
    it("schweigt, wenn dieselbe Person gar keine Nachtdienste hat", () => {
        const liste = Array.from({ length: 8 }, (_, i) => s(`f${i}`, `2026-10-${String(i * 3 + 1).padStart(2, "0")}`, "frueh", "06:00", "15:30"));
        expect(regeln(liste)).not.toContain("nachtarbeitszeit");
    });
});
describe("§ 11 Abs. 3 — Ersatzruhetag", () => {
    it("meldet Sonntagsarbeit ohne freien Tag in den folgenden zwei Wochen", () => {
        const liste = [s("so", "2026-10-04", "frueh")];
        for (let i = 1; i <= 15; i++) {
            liste.push(s(`d${i}`, `2026-10-${String(4 + i).padStart(2, "0")}`, "frueh"));
        }
        const b = pruefe(liste).find(x => x.regel === "ersatzruhetag");
        expect(b?.schwere).toBe("blocker");
        expect(b?.norm).toBe("§ 11 Abs. 3 ArbZG");
    });
    it("schweigt für den Sonntag, auf den ein freier Tag folgt", () => {
        const liste = [s("so", "2026-10-04", "frueh")];
        for (let i = 1; i <= 15; i++) {
            if (i === 3)
                continue;
            liste.push(s(`d${i}`, `2026-10-${String(4 + i).padStart(2, "0")}`, "frueh"));
        }
        const befunde = pruefe(liste);
        expect(befunde.filter(b => b.regel === "ersatzruhetag" && b.datum === "2026-10-04")).toEqual([]);
        expect(befunde.filter(b => b.regel === "ersatzruhetag" && b.schwere === "blocker")).toEqual([]);
    });
    it("sagt Hinweis statt Verstoß, wenn der geladene Zeitraum nicht bis zum Fristende reicht", () => {
        const liste = [
            s("so", "2026-10-04", "frueh"),
            s("d1", "2026-10-05", "frueh"),
            s("d2", "2026-10-06", "frueh"),
        ];
        const b = pruefe(liste).find(x => x.regel === "ersatzruhetag");
        expect(b?.schwere).toBe("hinweis");
    });
});
describe("§ 11 Abs. 1 — sonntagsfreie Sonntage", () => {
    it("schweigt über einen Monat, weil ein Monat über ein Jahr nichts sagt", () => {
        const liste = [s("a", "2026-10-04", "frueh"), s("b", "2026-10-11", "frueh")];
        expect(regeln(liste)).not.toContain("sonntagsfreie-sonntage");
    });
    it("meldet über ein volles Jahr, wenn weniger als 15 Sonntage frei bleiben", () => {
        const liste: SchichtEintrag[] = [];
        const d = new Date(2026, 0, 4);
        for (let i = 0; i < 52; i++) {
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            liste.push(s(`so${i}`, iso, "frueh"));
            d.setDate(d.getDate() + 7);
        }
        const b = pruefe(liste).find(x => x.regel === "sonntagsfreie-sonntage");
        expect(b?.schwere).toBe("blocker");
        expect(b?.text).toContain("0 von");
    });
});
describe("Zuordnung", () => {
    it("trennt die Personen — der Dienst der einen belastet die andere nicht", () => {
        const liste = [s("a", "2026-10-05", "spaet"), s("b", "2026-10-06", "frueh")];
        const befunde = pruefeWeitereArbeitszeit(liste, { a: ["Mara Vogt"], b: ["Jonas Reh"] });
        expect(befunde).toEqual([]);
    });
    it("kommt mit einer leeren Zuteilung zurecht", () => {
        expect(pruefeWeitereArbeitszeit([s("a", "2026-10-05", "frueh")], {})).toEqual([]);
    });
});
