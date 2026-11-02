import { describe, expect, it } from "vitest";
import { demoSzenario } from "@/lib/copilot-demo-data";
import { shiftMinutes, validateProposal, type GuardAssignment } from "@/lib/ai-guardrails";
const S = demoSzenario(new Date("2026-08-16T09:00:00Z"));
const spaet = "S-SPAET-3";
const pruefe = (vorschlag: GuardAssignment[], vorgaben?: Parameters<typeof validateProposal>[0]["vorgaben"]) => validateProposal({
    shifts: S.shifts, staff: S.staff, bestehend: S.bestehend, vorschlag, vorgaben,
});
describe("shiftMinutes", () => {
    it("rechnet die Nachtschicht über Mitternacht korrekt", () => {
        expect(shiftMinutes(S.shifts.find(s => s.id === "S-NACHT-3")!)).toBe(8 * 60);
    });
    it("rechnet eine normale Schicht korrekt", () => {
        expect(shiftMinutes(S.shifts.find(s => s.id === spaet)!)).toBe(8 * 60);
    });
});
describe("validateProposal — die zulässige Lösung", () => {
    it("lässt die beiden einzig regelkonformen Personen durch", () => {
        const r = pruefe([
            { shiftId: spaet, staffId: "P-SAID" },
            { shiftId: spaet, staffId: "P-LORENZ" },
        ]);
        expect(r.blocker).toEqual([]);
        expect(r.ok).toBe(true);
    });
    it("meldet Unterbesetzung als Warnung, nicht als Blocker", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-SAID" }]);
        expect(r.ok).toBe(true);
        expect(r.warnungen.some(w => w.regel === "mindestbesetzung")).toBe(true);
    });
});
describe("validateProposal — jede Falle blockt einzeln", () => {
    it("§ 5 ArbZG: Nachtdienst bis 06:00 lässt nur 8 h Ruhezeit bis zum Spätdienst", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-KRAUSE" }]);
        expect(r.ok).toBe(false);
        const f = r.blocker.find(b => b.regel === "ruhezeit");
        expect(f?.norm).toBe("§ 5 ArbZG");
    });
    it("§ 3 ArbZG: Frühdienst + Spätdienst am selben Tag sind 16 h", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-YILMAZ" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "hoechstarbeitszeit_tag")).toBe(true);
    });
    it("Fachkraftquote: Pflegehelfer erfüllt „examiniert\" nicht", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-BRANDT" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "qualifikation")).toBe(true);
    });
    it("Abwesenheit: Urlaub blockt die Einplanung", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-WEBER" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "verfuegbarkeit")).toBe(true);
    });
    it("Doppelbelegung: wer schon auf der Schicht steht, kann nicht nochmal drauf", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-HOFFMANN" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "mindestbesetzung" && b.text.includes("doppelt"))).toBe(true);
    });
    it("Halluzination: eine erfundene Person wird als Blocker abgefangen", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-GIBT-ES-NICHT" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "unbekannte_person")).toBe(true);
    });
});
describe("validateProposal — Überstunden und Nutzer-Vorgaben", () => {
    it("Überstunden allein sind nur eine Warnung", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-VOGT" }]);
        expect(r.ok).toBe(true);
        expect(r.warnungen.some(w => w.text.includes("Überstunden"))).toBe(true);
    });
    it("„keine Überstunden für Sarah\" macht daraus einen Blocker", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-VOGT" }], [{ art: "keine_ueberstunden", staffId: "P-VOGT" }]);
        expect(r.ok).toBe(false);
        const f = r.blocker.find(b => b.regel === "vorgabe");
        expect(f?.norm).toBe("Vorgabe aus der Anfrage");
    });
    it("„nicht einplanen\" wird respektiert", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-SAID" }], [{ art: "nicht_einplanen", staffId: "P-SAID" }]);
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "vorgabe")).toBe(true);
    });
});
describe("validateProposal — Abgrenzung", () => {
    it("meldet KEINE Ruhezeit-Altlast, die der Vorschlag gar nicht verursacht hat", () => {
        const r = pruefe([{ shiftId: spaet, staffId: "P-SAID" }]);
        expect(r.befunde.some(f => f.regel === "ruhezeit")).toBe(false);
    });
});
describe("validateProposal — Abwesenheit gilt je Kalendertag", () => {
    const person = (abwesendeTage: Record<string, string>) => [{
            id: "P-X", name: "Test Person", qualifikationen: ["examiniert"],
            verplanteMinutenWoche: 0, vertragsMinutenWoche: 40 * 60, abwesendeTage,
        }];
    const schicht = (id: string, date: string) => ({
        id, date, shift_type: "frueh", start_time: "06:00", end_time: "14:00",
        station: "Station 3", benoetigteQualifikation: null, sollBesetzung: 1,
    });
    const lauf = (abwesendeTage: Record<string, string>, ziel: string) => validateProposal({
        shifts: [schicht("A", "2026-09-21"), schicht("B", "2026-10-09")],
        staff: person(abwesendeTage), bestehend: [],
        vorschlag: [{ shiftId: ziel, staffId: "P-X" }],
    });
    it("blockt den Tag, an dem die Person wirklich fehlt", () => {
        const r = lauf({ "2026-09-21": "Urlaub" }, "A");
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "verfuegbarkeit")).toBe(true);
        expect(r.blocker[0].text).toContain("21.09.");
    });
    it("blockt NICHT wegen eines Urlaubstags drei Wochen später", () => {
        const r = lauf({ "2026-10-09": "Urlaub" }, "A");
        expect(r.befunde.some(f => f.regel === "verfuegbarkeit")).toBe(false);
        expect(r.ok).toBe(true);
    });
    it("fällt auf den alten Schalter zurück, wenn keine Tagesliste vorliegt", () => {
        const r = validateProposal({
            shifts: [schicht("A", "2026-09-21")],
            staff: [{
                    id: "P-X", name: "Test Person", qualifikationen: ["examiniert"],
                    verplanteMinutenWoche: 0, vertragsMinutenWoche: 40 * 60,
                    abwesend: true, abwesenheitsgrund: "Urlaub",
                }],
            bestehend: [], vorschlag: [{ shiftId: "A", staffId: "P-X" }],
        });
        expect(r.blocker.some(b => b.regel === "verfuegbarkeit")).toBe(true);
    });
});
describe("validateProposal — Tageshöchstarbeitszeit nur für berührte Tage", () => {
    const lang = (id: string, date: string) => ({
        id, date, shift_type: "frueh", start_time: "06:00", end_time: "17:00",
        station: "Station 3", benoetigteQualifikation: null, sollBesetzung: 1,
    });
    const kurz = (id: string, date: string) => ({
        id, date, shift_type: "frueh", start_time: "06:00", end_time: "12:00",
        station: "Station 3", benoetigteQualifikation: null, sollBesetzung: 1,
    });
    const staff = [{
            id: "P-X", name: "Test Person", qualifikationen: ["examiniert"],
            verplanteMinutenWoche: 0, vertragsMinutenWoche: 40 * 60, abwesendeTage: {},
        }];
    it("meldet KEINE Altlast an einem Tag, den der Vorschlag nicht berührt", () => {
        const r = validateProposal({
            shifts: [lang("ALT", "2026-09-21"), kurz("NEU", "2026-09-22")],
            staff, bestehend: [{ shiftId: "ALT", staffId: "P-X" }],
            vorschlag: [{ shiftId: "NEU", staffId: "P-X" }],
        });
        expect(r.befunde.some(f => f.regel === "hoechstarbeitszeit_tag")).toBe(false);
        expect(r.ok).toBe(true);
    });
    it("meldet sehr wohl, was der Vorschlag am selben Tag verursacht", () => {
        const r = validateProposal({
            shifts: [kurz("ALT", "2026-09-22"), { ...kurz("NEU", "2026-09-22"), start_time: "12:00", end_time: "18:00" }],
            staff, bestehend: [{ shiftId: "ALT", staffId: "P-X" }],
            vorschlag: [{ shiftId: "NEU", staffId: "P-X" }],
        });
        expect(r.ok).toBe(false);
        expect(r.blocker.some(b => b.regel === "hoechstarbeitszeit_tag")).toBe(true);
    });
});
