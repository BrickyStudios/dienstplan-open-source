import { describe, it, expect } from "vitest";
import { berechneAutomatikLauf, loeseVorlaufzeiten, monatsbeginnNach, tageZwischen, } from "./monats-automatik";
const heute = (iso: string) => new Date(`${iso}T09:00:00`);
describe("Vorlaufzeiten auflösen", () => {
    it("nimmt die neuen Tageswerte, wenn sie gesetzt sind", () => {
        const z = loeseVorlaufzeiten({ plan_create_days_before: 10, wish_reminder_days_before: 30 });
        expect(z).toEqual({ planTage: 10, erinnerungTage: 30, quelle: "tage" });
    });
    it("hält die Erinnerung immer mindestens einen Tag vor der Planerstellung", () => {
        const z = loeseVorlaufzeiten({ plan_create_days_before: 20, wish_reminder_days_before: 5 });
        expect(z.planTage).toBe(20);
        expect(z.erinnerungTage).toBe(21);
    });
    it("rechnet den Altbestand in dieselbe Tages-Sprache um (2 Monate / 14 Tage)", () => {
        const z = loeseVorlaufzeiten({ plan_lead_months: 2, wish_deadline_days: 14 });
        expect(z).toEqual({ planTage: 44, erinnerungTage: 58, quelle: "alt" });
    });
    it("Altbestand mit einem Monat Vorlauf entspricht genau der Wunschfrist", () => {
        const z = loeseVorlaufzeiten({ plan_lead_months: 1, wish_deadline_days: 14 });
        expect(z.planTage).toBe(14);
        expect(z.quelle).toBe("alt");
    });
    it("ohne jede Einstellung gelten die alten Standardwerte, nicht die neuen", () => {
        expect(loeseVorlaufzeiten(null)).toEqual({ planTage: 44, erinnerungTage: 58, quelle: "alt" });
    });
    it("klemmt unsinnige Werte statt sie zu übernehmen", () => {
        const z = loeseVorlaufzeiten({ plan_create_days_before: 9999, wish_reminder_days_before: -5 });
        expect(z.planTage).toBe(120);
        expect(z.erinnerungTage).toBe(121);
    });
});
describe("Kalenderrechnung", () => {
    it("zählt volle Tage unabhängig von der Uhrzeit", () => {
        expect(tageZwischen(new Date("2026-09-09T23:30:00"), new Date("2026-09-10T00:30:00"))).toBe(1);
    });
    it("liefert den nächsten Monatsbeginn mit Start, Ende und Abstand", () => {
        const m = monatsbeginnNach(heute("2026-09-09"), 1);
        expect(m).toMatchObject({ jahr: 2026, monat: 10, key: "2026-10", start: "2026-10-01", ende: "2026-10-31", tageBisBeginn: 22 });
    });
    it("rechnet über den Jahreswechsel", () => {
        const m = monatsbeginnNach(heute("2026-12-20"), 1);
        expect(m).toMatchObject({ jahr: 2027, monat: 1, key: "2027-01", ende: "2027-01-31" });
    });
    it("kennt den Februar im Schaltjahr", () => {
        expect(monatsbeginnNach(heute("2028-01-05"), 1).ende).toBe("2028-02-29");
    });
});
describe("Was ist heute fällig", () => {
    const einstellung = { plan_create_days_before: 14, wish_reminder_days_before: 28 };
    it("erstellt nichts, solange der Monatsbeginn weiter weg ist als die Vorlaufzeit", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-09"), einstellung);
        expect(lauf.planKandidaten).toEqual([]);
        expect(lauf.erinnerung).toEqual({ monat: expect.objectContaining({ key: "2026-10" }), stufe: "vorlauf" });
    });
    it("erstellt den Plan, sobald die Vorlaufzeit erreicht ist", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-17"), einstellung);
        expect(lauf.planKandidaten.map(m => m.key)).toEqual(["2026-10"]);
    });
    it("erinnert nicht mehr für einen Monat, der heute geschrieben wird", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-17"), einstellung);
        expect(lauf.erinnerung?.monat.key).not.toBe("2026-10");
        expect(lauf.erinnerung).toBeNull();
    });
    it("schickt am letzten Tag vor der Planerstellung die letzte Erinnerung", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-16"), einstellung);
        expect(lauf.erinnerung).toEqual({ monat: expect.objectContaining({ key: "2026-10" }), stufe: "letzte" });
    });
    it("schweigt, solange der nächste offene Monat noch außerhalb der Erinnerungszeit liegt", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-01"), einstellung);
        expect(lauf.erinnerung).toBeNull();
        expect(lauf.planKandidaten).toEqual([]);
    });
    it("langer Vorlauf plant mehrere Monate — frühester zuerst", () => {
        const lauf = berechneAutomatikLauf(heute("2026-09-09"), { plan_create_days_before: 70, wish_reminder_days_before: 90 });
        expect(lauf.planKandidaten.map(m => m.key)).toEqual(["2026-10", "2026-11"]);
    });
    it("Altbestand ohne neue Spalten verhält sich wie der bisherige Cron", () => {
        const alt = { plan_lead_months: 2, wish_deadline_days: 14 };
        expect(berechneAutomatikLauf(heute("2026-09-16"), alt).planKandidaten.map(m => m.key)).toEqual(["2026-10"]);
        expect(berechneAutomatikLauf(heute("2026-09-18"), alt).planKandidaten.map(m => m.key)).toEqual(["2026-10", "2026-11"]);
    });
});
