import { describe, it, expect } from "vitest";
import { planeBereitschaftNach, type NachplanEingabe } from "./bereitschaft-nachplanen";
const basis = (over: Partial<NachplanEingabe> = {}): NachplanEingabe => ({
    tage: ["2026-10-12", "2026-10-13", "2026-10-14"],
    personen: [
        { id: "a", name: "Anna", noSundayWork: false, station: null, einsatzStationen: [] },
        { id: "b", name: "Bert", noSundayWork: false, station: null, einsatzStationen: [] },
    ],
    stationen: new Set(["Station 1"]),
    dienstTage: new Map(),
    abwesenheiten: [],
    verfuegbarkeit: [],
    wuensche: [],
    schonBelegt: new Set(),
    bisher: {},
    ...over,
});
describe("planeBereitschaftNach", () => {
    it("vergibt je Tag genau eine Bereitschaft und verteilt fair", () => {
        const r = planeBereitschaftNach(basis());
        expect(r.bereitschaften.map(b => `${b.date}:${b.staff_name}`)).toEqual(["2026-10-12:Anna", "2026-10-13:Bert", "2026-10-14:Anna"]);
        expect(r.ohneKandidat).toEqual([]);
    });
    it("lässt Tage mit vorhandener Bereitschaft unberührt", () => {
        const r = planeBereitschaftNach(basis({ schonBelegt: new Set(["2026-10-13"]) }));
        expect(r.bereitschaften.map(b => b.date)).toEqual(["2026-10-12", "2026-10-14"]);
    });
    it("niemand mit Dienst, Abwesenheit, „nicht verfügbar“ oder Wunsch „kann nicht“", () => {
        const r = planeBereitschaftNach(basis({
            tage: ["2026-10-12"],
            personen: [
                { id: "a", name: "Anna", noSundayWork: false, station: null, einsatzStationen: [] },
                { id: "b", name: "Bert", noSundayWork: false, station: null, einsatzStationen: [] },
                { id: "c", name: "Carl", noSundayWork: false, station: null, einsatzStationen: [] },
                { id: "d", name: "Dora", noSundayWork: false, station: null, einsatzStationen: [] },
                { id: "e", name: "Emil", noSundayWork: false, station: null, einsatzStationen: [] },
            ],
            dienstTage: new Map([["a", new Set(["2026-10-12"])]]),
            abwesenheiten: [{ staff_id: "b", from: "2026-10-10", to: "2026-10-20", kind: "krank" }],
            verfuegbarkeit: [{ staff_id: "c", day_of_week: 1, available: false }],
            wuensche: [{ full_name: "Dora", wish_type: "unavailable", status: "offen", date_from: "2026-10-12", date_to: "2026-10-12" }],
        }));
        expect(r.bereitschaften).toEqual([{ date: "2026-10-12", staff_id: "e", staff_name: "Emil" }]);
    });
    it("Sonntagsverbot gilt, und ein Tag ohne Freie wird gemeldet", () => {
        const r = planeBereitschaftNach(basis({
            tage: ["2026-10-18"],
            personen: [{ id: "a", name: "Anna", noSundayWork: true, station: null, einsatzStationen: [] }],
        }));
        expect(r.bereitschaften).toEqual([]);
        expect(r.ohneKandidat).toEqual(["2026-10-18"]);
    });
    it("wer bisher öfter Bereitschaft hatte, kommt später dran", () => {
        const r = planeBereitschaftNach(basis({ tage: ["2026-10-12"], bisher: { a: 3 } }));
        expect(r.bereitschaften[0].staff_name).toBe("Bert");
    });
    it("Ärztinnen und Bereichskräfte sind keine Pflege-Bereitschaft, Einspringer schon", () => {
        const r = planeBereitschaftNach(basis({
            tage: ["2026-10-12", "2026-10-13"],
            personen: [
                { id: "d", name: "Dr. Demir", noSundayWork: false, station: "Ärztlicher Dienst", einsatzStationen: [] },
                { id: "r", name: "Reinigung", noSundayWork: false, station: "Funktionsdienste", einsatzStationen: [] },
                { id: "p", name: "Pia", noSundayWork: false, station: "Station 1", einsatzStationen: [] },
                { id: "x", name: "Xaver", noSundayWork: false, station: "Station 9", einsatzStationen: ["Station 1"] },
            ],
        }));
        expect(new Set(r.bereitschaften.map(b => b.staff_name))).toEqual(new Set(["Pia", "Xaver"]));
    });
});
