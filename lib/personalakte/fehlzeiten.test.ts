import { describe, it, expect } from "vitest";
import { FEHLZEIT_GRUENDE, fehlzeitLabel, kalendertage, zuAbwesenheiten } from "./fehlzeiten";
import { abwesenheitenNachTag } from "@/lib/ai-guard-daten";
describe("kalendertage", () => {
    it("zählt beide Enden mit, auch über den Monatswechsel", () => {
        expect(kalendertage("2026-10-01", "2026-10-14")).toBe(14);
        expect(kalendertage("2026-09-29", "2026-10-02")).toBe(4);
    });
    it("ohne Ende oder mit Ende vor dem Anfang: ein Tag", () => {
        expect(kalendertage("2026-10-01", null)).toBe(1);
        expect(kalendertage("2026-10-05", "2026-10-01")).toBe(1);
    });
});
describe("zuAbwesenheiten", () => {
    const zeile = (art: string, grund: string | null, bis: string | null = "2026-10-14") => ({ staff_id: "p1", art, datum: "2026-10-01", datum_bis: bis, grund });
    it("Krankschreibung sperrt den ganzen Zeitraum und zählt als krank", () => {
        expect(zuAbwesenheiten([zeile("krankschreibung", null)])).toEqual([
            { staff_id: "p1", von: "2026-10-01", bis: "2026-10-14", label: "Krankschreibung", krank: true },
        ]);
    });
    it("Elternzeit sperrt, ist aber keine Krankheit", () => {
        const [a] = zuAbwesenheiten([zeile("fehlzeit", "elternzeit")]);
        expect(a).toMatchObject({ label: "Elternzeit", krank: false, bis: "2026-10-14" });
    });
    it("Arbeitsunfall und Kind krank zählen wie eine Krankmeldung", () => {
        expect(zuAbwesenheiten([zeile("fehlzeit", "arbeitsunfall"), zeile("fehlzeit", "kind_krank")]).map(a => a.krank)).toEqual([true, true]);
    });
    it("unentschuldigtes Fehlen sperrt im Dienstplan nichts", () => {
        expect(FEHLZEIT_GRUENDE.unentschuldigt.plan).toBe(false);
        expect(zuAbwesenheiten([zeile("fehlzeit", "unentschuldigt")])).toEqual([]);
    });
    it("andere Eintragsarten und Einträge ohne Ende", () => {
        expect(zuAbwesenheiten([zeile("abmahnung", null)])).toEqual([]);
        expect(zuAbwesenheiten([zeile("krankschreibung", null, null)])[0].bis).toBe("2026-10-01");
    });
    it("Bezeichnungen", () => {
        expect(fehlzeitLabel("krankschreibung", null)).toBe("Krankschreibung");
        expect(fehlzeitLabel("fehlzeit", "kur")).toBe("Kur / Reha");
        expect(fehlzeitLabel("fehlzeit", "gibtsnicht")).toBe("Abwesenheit");
    });
});
describe("abwesenheitenNachTag — Akte", () => {
    it("rollt eine Krankschreibung auf Einzeltage aus und beschneidet aufs Fenster", () => {
        const tage = abwesenheitenNachTag({
            urlaube: [], krankmeldungen: [],
            akte: [
                { staff_id: "p1", von: "2026-10-01", bis: "2026-10-14", label: "Krankschreibung", krank: true },
                { staff_id: "p2", von: "2026-10-05", bis: "2026-10-06", label: "Elternzeit", krank: false },
            ],
            nameByStaffId: new Map([["p1", "Anna"], ["p2", "Bert"]]),
            von: "2026-10-12", bis: "2026-10-20",
        });
        expect(tage.get("Anna")).toEqual({ "2026-10-12": "Krankmeldung", "2026-10-13": "Krankmeldung", "2026-10-14": "Krankmeldung" });
        expect(tage.has("Bert")).toBe(false);
    });
    it("eine Krankschreibung schlägt Urlaub am selben Tag", () => {
        const tage = abwesenheitenNachTag({
            urlaube: [{ staff_id: "p1", from_date: "2026-10-01", to_date: "2026-10-03" }],
            krankmeldungen: [],
            akte: [{ staff_id: "p1", von: "2026-10-02", bis: "2026-10-02", label: "Krankschreibung", krank: true }],
            nameByStaffId: new Map([["p1", "Anna"]]),
            von: "2026-10-01", bis: "2026-10-03",
        });
        expect(tage.get("Anna")).toEqual({ "2026-10-01": "Urlaub", "2026-10-02": "Krankmeldung", "2026-10-03": "Urlaub" });
    });
});
