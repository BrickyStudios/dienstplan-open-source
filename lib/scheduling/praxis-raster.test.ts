import { describe, expect, it } from "vitest";
import { andereHaelfteOffen, einstellungenAusRaster, ersatzAmTag, ersatzSchwelle, leseBesetzung, sollAmTag, startwocheVon, rasterAusEinstellungen, turnusBehalten, zeitAmWochentag, personalbedarf, findetStatt, leseTurnus, naechsterWochentag, istGeschlossen, leseMittagspause, mitMittagspause, leseClosedSlots, mindestbesetzungFuer, leseMitarbeiterImport, leseTagesZeiten, normalisiereRasterVorschlag, wochentagVon, zeitFuerTag, } from "@/lib/scheduling/praxis-raster";
describe("wochentagVon", () => {
    it("rechnet ohne Zeitzone", () => {
        expect(wochentagVon("2026-10-16")).toBe(5);
        expect(wochentagVon("2026-10-18")).toBe(0);
    });
});
describe("istGeschlossen", () => {
    const zu = { "0": ["frueh", "spaet"], "3": ["spaet"] };
    it("schließt nur die genannte Schicht am genannten Tag", () => {
        expect(istGeschlossen(zu, "2026-10-18", "frueh")).toBe(true);
        expect(istGeschlossen(zu, "2026-10-21", "spaet")).toBe(true);
        expect(istGeschlossen(zu, "2026-10-21", "frueh")).toBe(false);
        expect(istGeschlossen(zu, "2026-10-20", "spaet")).toBe(false);
    });
    it("ohne Raster ist nie etwas geschlossen", () => {
        expect(istGeschlossen(null, "2026-10-18", "frueh")).toBe(false);
    });
});
describe("ersatzSchwelle", () => {
    it("ohne Mindestbesetzung gilt der Soll", () => {
        expect(ersatzSchwelle(5, null)).toBe(5);
    });
    it("mit Mindestbesetzung wird erst darunter gesucht", () => {
        expect(ersatzSchwelle(5, 4)).toBe(4);
    });
    it("ein Mindestwert über dem Soll wird auf den Soll gedeckelt", () => {
        expect(ersatzSchwelle(3, 9)).toBe(3);
    });
    it("0 heißt: nie Ersatz suchen", () => {
        expect(ersatzSchwelle(3, 0)).toBe(0);
    });
});
describe("mindestbesetzungFuer", () => {
    it("liest nur gültige Werte", () => {
        const m = { Praxis: { frueh: 2 } };
        expect(mindestbesetzungFuer(m, "Praxis", "frueh")).toBe(2);
        expect(mindestbesetzungFuer(m, "Praxis", "spaet")).toBeNull();
        expect(mindestbesetzungFuer(null, "Praxis", "frueh")).toBeNull();
    });
});
describe("leseClosedSlots", () => {
    it("verwirft unbekannte Tage und Schichtarten", () => {
        expect(leseClosedSlots({ "6": ["frueh", "quatsch", "frueh"], "9": ["frueh"], x: 1 })).toEqual({ "6": ["frueh"] });
        expect(leseClosedSlots([])).toBeNull();
        expect(leseClosedSlots(null)).toBeNull();
    });
});
describe("normalisiereRasterVorschlag", () => {
    const antwort = {
        schichten: [
            { name: "Vormittag", start: "7:30", ende: "13:00", bedarf: 5, mindestens: 4 },
            { name: "Nachmittag", start: "14:00", ende: "18:30", bedarf: 3, mindestens: 9 },
            { name: "Labor früh", start: "07:00", ende: "11:00", bedarf: 1, mindestens: 1 },
        ],
        wochenplan: [
            { tag: "Montag", offen: ["Vormittag", "Nachmittag"] },
            { tag: "Mittwoch", offen: ["Vormittag"] },
            { tag: "Samstag", offen: [] },
            { tag: "Sonntag", offen: [] },
        ],
        rueckfragen: ["Arbeiten Azubis mit?", "", "b", "c", "d"],
        annahmen: ["Freitag wie Montag"],
        hinweise: [],
    };
    const v = normalisiereRasterVorschlag(antwort);
    it("normalisiert Zeiten und ordnet nach Schichtart", () => {
        expect(v.schichten.map(s => [s.name, s.start, s.art])).toEqual([
            ["Vormittag", "07:30", "frueh"],
            ["Nachmittag", "14:00", "spaet"],
        ]);
    });
    it("verwirft eine zweite Schicht im selben Fenster und sagt es", () => {
        expect(v.hinweise.some(h => h.includes("Labor früh"))).toBe(true);
    });
    it("deckelt Mindestens auf den Soll", () => {
        expect(v.schichten[1]).toMatchObject({ bedarf: 3, mindestens: 3 });
    });
    it("übersetzt den Wochenplan in geschlossene Schichten", () => {
        expect(v.geschlossen).toEqual({ "3": ["spaet"], "6": ["frueh", "spaet"], "0": ["frueh", "spaet"] });
    });
    it("begrenzt Rückfragen auf drei nicht-leere", () => {
        expect(v.rueckfragen).toEqual(["Arbeiten Azubis mit?", "b", "c"]);
    });
    it("übersteht Müll", () => {
        expect(normalisiereRasterVorschlag("kaputt")).toEqual({ schichten: [], geschlossen: {}, zeitenJeTag: {}, mitarbeitende: [], rueckfragen: [], annahmen: [], hinweise: [] });
    });
});
describe("Zeiten je Wochentag aus dem Vorschlag", () => {
    const tag = (t: string, vm: [
        string,
        string
    ] | null, nm: [
        string,
        string
    ] | null) => ({
        tag: t,
        schichten: [
            ...(vm ? [{ name: "Vormittag", start: vm[0], ende: vm[1] }] : []),
            ...(nm ? [{ name: "Nachmittag", start: nm[0], ende: nm[1] }] : []),
        ],
    });
    const v = normalisiereRasterVorschlag({
        schichten: [
            { name: "Vormittag", start: "07:00", ende: "12:00", bedarf: 4, mindestens: 3 },
            { name: "Nachmittag", start: "14:00", ende: "18:00", bedarf: 3, mindestens: 3 },
        ],
        wochenplan: [
            tag("mo", ["07:00", "12:00"], ["14:00", "18:00"]),
            tag("di", ["08:00", "13:00"], ["14:00", "18:00"]),
            tag("mi", ["08:00", "13:00"], null),
            tag("do", ["08:00", "13:00"], ["14:00", "19:00"]),
            tag("fr", ["08:00", "13:00"], ["14:00", "18:00"]),
            tag("sa", null, null),
            tag("so", null, null),
        ],
        rueckfragen: [], annahmen: [], hinweise: [],
    });
    it("nimmt als Schichtzeit die häufigste Zeit, nicht die genannte", () => {
        expect(v.schichten.map(s => [s.name, s.start, s.end])).toEqual([
            ["Vormittag", "08:00", "13:00"],
            ["Nachmittag", "14:00", "18:00"],
        ]);
    });
    it("hält nur die abweichenden Tage fest", () => {
        expect(v.zeitenJeTag).toEqual({
            "1": { frueh: { start: "07:00", end: "12:00" } },
            "4": { spaet: { start: "14:00", end: "19:00" } },
        });
    });
    it("schließt Tage ohne Schicht wie bisher", () => {
        expect(v.geschlossen).toEqual({ "3": ["spaet"], "6": ["frueh", "spaet"], "0": ["frueh", "spaet"] });
    });
    it("hängt die Schichtart am Namen, nicht an der Uhrzeit des Tages", () => {
        const n = normalisiereRasterVorschlag({
            schichten: [{ name: "Nachmittag", start: "14:00", ende: "18:00", bedarf: 2, mindestens: 2 }],
            wochenplan: [tag("mo", null, ["13:30", "18:00"])],
            rueckfragen: [], annahmen: [], hinweise: [],
        });
        expect(n.zeitenJeTag).toEqual({ "1": { spaet: { start: "13:30", end: "18:00" } } });
    });
});
describe("leseTagesZeiten / zeitFuerTag", () => {
    it("verwirft unbekannte Tage, Schichtarten und kaputte Zeiten", () => {
        expect(leseTagesZeiten({
            "1": { frueh: { start: "7:00", end: "12:00" }, mittag: { start: "12:00", end: "13:00" } },
            "9": { frueh: { start: "07:00", end: "12:00" } },
            "2": { spaet: { start: "x", end: "18:00" } },
        })).toEqual({ "1": { frueh: { start: "07:00", end: "12:00" } } });
        expect(leseTagesZeiten(null)).toBeNull();
        expect(leseTagesZeiten([])).toBeNull();
    });
    it("findet die Zeit des Wochentags eines Datums", () => {
        const tz = { "1": { frueh: { start: "07:00", end: "12:00" } } };
        expect(zeitFuerTag(tz, "2026-10-19", "frueh")).toEqual({ start: "07:00", end: "12:00" });
        expect(zeitFuerTag(tz, "2026-10-20", "frueh")).toBeNull();
        expect(zeitFuerTag(null, "2026-10-19", "frueh")).toBeNull();
    });
});
describe("Mitarbeitende aus dem Plan", () => {
    const v = normalisiereRasterVorschlag({
        schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00", bedarf: 3, mindestens: 3 }],
        wochenplan: [],
        mitarbeitende: [
            { name: "Anna Schmidt", beruf: "mfa", wochenstunden: 38 },
            { name: "anna schmidt", beruf: "mfa", wochenstunden: 0 },
            { name: "Dr. Weber", beruf: "arzt", wochenstunden: 0 },
            { name: "[…7]", beruf: "mfa", wochenstunden: 0 },
            { name: "Montag", beruf: "mfa", wochenstunden: 0 },
            { name: "Lea Kurz", beruf: "erfunden", wochenstunden: 99 },
        ],
        rueckfragen: [], annahmen: [], hinweise: [],
    });
    it("nimmt jede Person einmal und verwirft Platzhalter und Wochentage", () => {
        expect(v.mitarbeitende.map(p => p.name)).toEqual(["Anna Schmidt", "Dr. Weber", "Lea Kurz"]);
    });
    it("übernimmt auch Ärztinnen und Ärzte (gleicher Plan) und übersetzt die Berufe", () => {
        expect(v.mitarbeitende[0]).toEqual({ name: "Anna Schmidt", beruf: "Medizinische Fachangestellte (MFA)", wochenstunden: 38, vorausgewaehlt: true });
        expect(v.mitarbeitende[1]).toMatchObject({ beruf: "Praxisärztin / Praxisarzt", wochenstunden: null, vorausgewaehlt: true });
        expect(v.mitarbeitende[2]).toMatchObject({ beruf: "Medizinische Fachangestellte (MFA)", wochenstunden: 60 });
    });
    it("prüft beim Abschluss noch einmal", () => {
        expect(leseMitarbeiterImport([
            { name: " Anna  Schmidt ", beruf: "Auszubildende MFA/ZFA", wochenstunden: 20 },
            { name: "Anna Schmidt", beruf: "Auszubildende MFA/ZFA", wochenstunden: 20 },
            { name: "X", beruf: "Pflegekraft", wochenstunden: 20 },
            { name: "Tom Berg", beruf: "Pflegekraft", wochenstunden: null },
        ])).toEqual([
            { name: "Anna Schmidt", beruf: "Auszubildende MFA/ZFA", wochenstunden: 20 },
            { name: "Tom Berg", beruf: "Medizinische Fachangestellte (MFA)", wochenstunden: null },
        ]);
        expect(leseMitarbeiterImport("kaputt")).toEqual([]);
    });
});
describe("Mittagspause", () => {
    const pause = { start: "12:00", end: "13:00" };
    it("Vormittag endet mit der Pause, Nachmittag beginnt mit ihrem Ende", () => {
        expect(mitMittagspause({ start: "07:30", end: "13:00" }, pause, "frueh", true)).toEqual({ start: "07:30", end: "12:00" });
        expect(mitMittagspause({ start: "14:00", end: "18:30" }, pause, "spaet", true)).toEqual({ start: "13:00", end: "18:30" });
    });
    it("greift nicht, wenn die andere Hälfte an dem Tag fehlt (Mittwochnachmittag zu)", () => {
        expect(mitMittagspause({ start: "07:30", end: "13:00" }, pause, "frueh", false)).toEqual({ start: "07:30", end: "13:00" });
        const closed = { "3": ["spaet"] };
        expect(andereHaelfteOffen(closed, "2026-10-21", "frueh")).toBe(false);
        expect(andereHaelfteOffen(closed, "2026-10-20", "frueh")).toBe(true);
    });
    it("liest die Pause aus day_shift_times und lässt die Tage unberührt", () => {
        const raw = { mittag: { start: "12:30", end: "14:00" }, "1": { frueh: { start: "07:00", end: "12:30" } } };
        expect(leseMittagspause(raw)).toEqual({ start: "12:30", end: "14:00" });
        expect(leseTagesZeiten(raw)).toEqual({ "1": { frueh: { start: "07:00", end: "12:30" } } });
        expect(leseMittagspause({ mittag: { start: "13:00", end: "12:00" } })).toBeNull();
        expect(leseMittagspause(null)).toBeNull();
    });
    it("KI-Vorschlag: Pause wird übernommen, ihre Tageszeiten sind keine Abweichung", () => {
        const tag = (n: string) => ({ tag: n, schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00" }, { name: "Nachmittag", start: "13:00", ende: "18:00" }] });
        const v = normalisiereRasterVorschlag({
            schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00", bedarf: 3, mindestens: 2 }, { name: "Nachmittag", start: "14:00", ende: "18:00", bedarf: 2, mindestens: 2 }],
            wochenplan: [...["mo", "di", "mi", "do", "fr"].map(tag), { tag: "sa", schichten: [] }, { tag: "so", schichten: [] }],
            mittagspause: { geschlossen: true, start: "12:00", ende: "13:00" },
            rueckfragen: [], annahmen: [], hinweise: [],
        });
        expect(v.mittagspause).toEqual({ start: "12:00", end: "13:00" });
        expect(v.zeitenJeTag).toEqual({});
    });
    it("ohne gemeinsame Pause kein Feld", () => {
        const v = normalisiereRasterVorschlag({ schichten: [], wochenplan: [], mittagspause: { geschlossen: false, start: "", ende: "" }, rueckfragen: [], annahmen: [], hinweise: [] });
        expect(v.mittagspause).toBeUndefined();
    });
});
describe("Turnus: nur jede zweite Woche", () => {
    const turnus = { "0": { frueh: { alle: 2, ab: "2026-10-25" } } };
    it("findet in den Wochen im Takt statt, dazwischen nicht", () => {
        expect(findetStatt(turnus, "2026-10-25", "frueh")).toBe(true);
        expect(findetStatt(turnus, "2026-11-01", "frueh")).toBe(false);
        expect(findetStatt(turnus, "2026-11-08", "frueh")).toBe(true);
        expect(findetStatt(turnus, "2026-10-18", "frueh")).toBe(false);
        expect(findetStatt(turnus, "2026-11-01", "spaet")).toBe(true);
        expect(findetStatt(null, "2026-11-01", "frueh")).toBe(true);
    });
    it("zählt über den Jahreswechsel in Kalenderwochen", () => {
        expect(findetStatt(turnus, "2027-01-03", "frueh")).toBe(true);
        expect(findetStatt(turnus, "2027-01-10", "frueh")).toBe(false);
    });
    it("liest nur gültige Einträge", () => {
        expect(leseTurnus({ turnus, "1": {} })).toEqual(turnus);
        expect(leseTurnus({ turnus: { "0": { frueh: { alle: 1, ab: "2026-10-25" } } } })).toBeNull();
        expect(leseTurnus({ turnus: { "9": { frueh: { alle: 2, ab: "2026-10-25" } } } })).toBeNull();
        expect(leseTagesZeiten({ turnus })).toBeNull();
    });
    it("naechsterWochentag", () => {
        expect(naechsterWochentag(0, "2026-10-21")).toBe("2026-10-25");
        expect(naechsterWochentag(3, "2026-10-21")).toBe("2026-10-21");
    });
    it("KI: „jeden zweiten Sonntag 8–12“ wird Turnus, Sonntag bleibt offen", () => {
        const werktag = (n: string) => ({ tag: n, schichten: [{ name: "Vormittag", start: "07:00", ende: "13:00", jedeWoche: 1 }] });
        const v = normalisiereRasterVorschlag({
            schichten: [{ name: "Vormittag", start: "07:00", ende: "13:00", bedarf: 4, mindestens: 2 }],
            wochenplan: [...["mo", "di", "mi", "do", "fr"].map(werktag), { tag: "sa", schichten: [] },
                { tag: "so", schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00", jedeWoche: 2 }] }],
            rueckfragen: [], annahmen: [], hinweise: [],
        }, "2026-10-21");
        expect(v.turnus).toEqual({ "0": { frueh: { alle: 2, ab: "2026-10-25" } } });
        expect(v.geschlossen["0"]).toBeUndefined();
        expect(v.zeitenJeTag["0"]).toEqual({ frueh: { start: "08:00", end: "12:00" } });
    });
});
describe("personalbedarf", () => {
    const schichten = [
        { start: "08:00", end: "13:00", art: "frueh", bedarf: 4, mindestens: 2 },
        { start: "14:00", end: "18:00", art: "spaet", bedarf: 2, mindestens: 2 },
    ];
    const wochenende = { "6": ["frueh", "spaet"], "0": ["frueh", "spaet"] };
    it("rechnet Stunden × Besetzung über die offene Woche", () => {
        const b = personalbedarf({ schichten, geschlossen: wochenende });
        expect(b.stundenRegulaer).toBe(140);
        expect(b.stundenMinimum).toBe(90);
        expect(b.vzRegulaer).toBe(3.5);
        expect(b.vzMinimum).toBe(2.5);
        expect(b.vzEmpfohlen).toBe(4.5);
    });
    it("Turnus zählt anteilig, Mittagspause verkürzt", () => {
        const sonntag = personalbedarf({
            schichten: [{ start: "08:00", end: "12:00", art: "frueh", bedarf: 2 }],
            geschlossen: { "1": ["frueh"], "2": ["frueh"], "3": ["frueh"], "4": ["frueh"], "5": ["frueh"], "6": ["frueh"] },
            turnus: { "0": { frueh: { alle: 2, ab: "2026-10-25" } } },
        });
        expect(sonntag.stundenRegulaer).toBe(4);
        const mitPause = personalbedarf({ schichten, geschlossen: wochenende, mittagspause: { start: "12:00", end: "13:00" } });
        expect(mitPause.stundenRegulaer).toBe(130);
    });
});
describe("gespeichertes Raster", () => {
    it("liest Vorlagen, Soll, geschlossene Tage — Nachtdienst ab 20 Uhr ist Nacht", () => {
        const r = rasterAusEinstellungen({
            vorlagen: [{ name: "Tagdienst", start_time: "06:30", end_time: "18:30" }, { name: "Nachtdienst", start_time: "20:00", end_time: "06:30" }],
            einheit: "Praxis",
            shiftDemand: { Praxis: { frueh: 5, nacht: 1 } },
            replacementMin: { Praxis: { frueh: 3, nacht: 1 } },
            closedSlots: { "6": ["frueh", "nacht"], "0": ["nacht"] },
            dayShiftTimes: { "0": { frueh: { start: "09:00", end: "13:00" } }, turnus: { "0": { frueh: { alle: 2, ab: "2026-10-25" } } } },
        });
        expect(r.schichten.map(s => [s.name, s.art, s.bedarf, s.mindestens])).toEqual([["Tagdienst", "frueh", 5, 3], ["Nachtdienst", "nacht", 1, 1]]);
        expect(zeitAmWochentag(r, 0, "frueh")).toEqual({ start: "09:00", end: "13:00" });
        expect(zeitAmWochentag(r, 3, "frueh")).toEqual({ start: "06:30", end: "18:30" });
        expect(r.turnus).toEqual({ "0": { frueh: { alle: 2, ab: "2026-10-25" } } });
    });
    it("turnusBehalten: gleicher Takt behält den Beginn, neuer Takt nicht", () => {
        const alt = { "0": { frueh: { alle: 2, ab: "2026-10-25" } } };
        expect(turnusBehalten({ "0": { frueh: { alle: 2, ab: "2026-11-01" } } }, alt)).toEqual(alt);
        expect(turnusBehalten({ "0": { frueh: { alle: 3, ab: "2026-11-01" } } }, alt)).toEqual({ "0": { frueh: { alle: 3, ab: "2026-11-01" } } });
        expect(turnusBehalten(undefined, alt)).toBeUndefined();
    });
});
describe("Ärzte und Praxisteam getrennt", () => {
    it("liest die Ärztezahl aus der Modellantwort", () => {
        const v = normalisiereRasterVorschlag({
            schichten: [{ name: "Vormittag", start: "07:30", ende: "12:30", aerzte: 1, bedarf: 4, mindestens: 3 }],
            wochenplan: [],
        });
        expect(v.schichten[0]).toMatchObject({ aerzte: 1, bedarf: 4, mindestens: 3 });
        expect(normalisiereRasterVorschlag({ schichten: [{ name: "V", start: "07:30", ende: "12:30", bedarf: 3, mindestens: 3 }], wochenplan: [] }).schichten[0].aerzte).toBe(0);
    });
    it("speichert Summen und den ärztlichen Anteil — und liest sie zurück", () => {
        const schichten = [
            { art: "frueh", bedarf: 4, mindestens: 3, aerzte: 1 },
            { art: "nacht", bedarf: 2, mindestens: 2, aerzte: 0 },
        ];
        const w = einstellungenAusRaster(schichten);
        expect(w).toEqual({
            shiftDemand: { frueh: 5, nacht: 2 },
            doctorDemand: { frueh: 1, nacht: 0 },
            replacementMin: { frueh: 4, nacht: 2 },
        });
        const r = rasterAusEinstellungen({
            vorlagen: [{ name: "Vormittag", start_time: "07:30", end_time: "12:30" }, { name: "Nachtdienst", start_time: "20:00", end_time: "06:30" }],
            einheit: "Praxis",
            shiftDemand: { Praxis: w.shiftDemand }, doctorDemand: { Praxis: w.doctorDemand }, replacementMin: { Praxis: w.replacementMin },
        });
        expect(r.schichten.map(s => [s.art, s.aerzte, s.bedarf, s.mindestens])).toEqual([["frueh", 1, 4, 3], ["nacht", 0, 2, 2]]);
    });
    it("Bestand ohne doctor_demand: alles ist Praxisteam", () => {
        const r = rasterAusEinstellungen({
            vorlagen: [{ name: "Vormittag", start_time: "07:30", end_time: "12:30" }],
            einheit: "Praxis", shiftDemand: { Praxis: { frueh: 5 } }, replacementMin: { Praxis: { frueh: 4 } },
        });
        expect(r.schichten[0]).toMatchObject({ aerzte: 0, bedarf: 5, mindestens: 4 });
    });
    it("Personalbedarf zählt Ärzte getrennt vom Team", () => {
        const b = personalbedarf({
            schichten: [{ start: "08:00", end: "18:00", art: "frueh", bedarf: 4, mindestens: 4, aerzte: 1 }],
            geschlossen: { "6": ["frueh"], "0": ["frueh"] },
        });
        expect(b.stundenRegulaer).toBe(200);
        expect(b.stundenAerzte).toBe(50);
        expect(b.vzAerzte).toBe(1.5);
    });
});
describe("Turnus versetzt: Samstag und Sonntag im Wechsel", () => {
    const heute = "2026-10-22";
    const tag = (n: string, startwoche: number) => ({ tag: n, schichten: [{ name: "Wochenende", start: "09:00", ende: "13:00", jedeWoche: 2, startwoche }] });
    const roh = (sa: number, so: number) => ({
        schichten: [{ name: "Wochenende", start: "09:00", ende: "13:00", bedarf: 2, mindestens: 2 }],
        wochenplan: [tag("sa", sa), tag("so", so)],
    });
    it("verschiedene Startwochen liegen in verschiedenen Wochen", () => {
        const v = normalisiereRasterVorschlag(roh(1, 2), heute);
        expect(v.turnus).toEqual({ "6": { frueh: { alle: 2, ab: "2026-10-24" } }, "0": { frueh: { alle: 2, ab: "2026-11-01" } } });
        expect(findetStatt(v.turnus, "2026-10-24", "frueh")).toBe(true);
        expect(findetStatt(v.turnus, "2026-10-25", "frueh")).toBe(false);
        expect(findetStatt(v.turnus, "2026-10-31", "frueh")).toBe(false);
        expect(findetStatt(v.turnus, "2026-11-01", "frueh")).toBe(true);
    });
    it("gleiche Startwoche: dasselbe Wochenende", () => {
        const v = normalisiereRasterVorschlag(roh(1, 1), heute);
        expect(findetStatt(v.turnus, "2026-10-24", "frueh")).toBe(true);
        expect(findetStatt(v.turnus, "2026-10-25", "frueh")).toBe(true);
    });
    it("startwocheVon zählt ab der laufenden Woche", () => {
        expect(startwocheVon({ alle: 2, ab: "2026-11-01" }, heute)).toBe(2);
        expect(startwocheVon({ alle: 2, ab: "2026-10-24" }, heute)).toBe(1);
        expect(startwocheVon({ alle: 2, ab: "2026-10-17" }, heute)).toBe(2);
    });
    it("turnusBehalten: von der Praxis verschobener Wechsel bleibt, neuer Wechsel der KI gilt", () => {
        const neu = normalisiereRasterVorschlag(roh(1, 2), heute).turnus;
        const alt = { "6": { frueh: { alle: 2, ab: "2026-10-31" } }, "0": { frueh: { alle: 2, ab: "2026-10-25" } } };
        expect(turnusBehalten(neu, alt)).toEqual(alt);
        const vorher = { "6": { frueh: { alle: 2, ab: "2026-10-24" } }, "0": { frueh: { alle: 2, ab: "2026-10-25" } } };
        expect(turnusBehalten(neu, vorher)).toEqual(neu);
    });
});
describe("Besetzung je Wochentag", () => {
    it("KI: sonntags 3 statt 5 wird eine Abweichung, Werktage nicht", () => {
        const tag = (n: string, aerzte: number, bedarf: number, mindestens: number) => ({ tag: n, schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00", jedeWoche: 1, startwoche: 1, aerzte, bedarf, mindestens }] });
        const v = normalisiereRasterVorschlag({
            schichten: [{ name: "Vormittag", start: "08:00", ende: "12:00", aerzte: 1, bedarf: 4, mindestens: 3 }],
            wochenplan: [...["mo", "di", "mi", "do", "fr"].map(n => tag(n, 1, 4, 3)), { tag: "sa", schichten: [] }, tag("so", 1, 2, 2)],
        });
        expect(v.besetzungJeTag).toEqual({ "0": { frueh: { aerzte: 1, bedarf: 2, mindestens: 2 } } });
    });
    it("Soll und Ersatzgrenze am Tag: Summe aus Team und Ärzten", () => {
        const tb = leseBesetzung({ besetzung: { "0": { frueh: { aerzte: 1, bedarf: 2, mindestens: 1 } }, "9": { frueh: { bedarf: 1 } } } });
        expect(tb).toEqual({ "0": { frueh: { aerzte: 1, bedarf: 2, mindestens: 1 } } });
        expect(sollAmTag(tb, "2026-11-22", "frueh")).toBe(3);
        expect(ersatzAmTag(tb, "2026-11-22", "frueh")).toBe(2);
        expect(sollAmTag(tb, "2026-11-20", "frueh")).toBeNull();
    });
    it("gespeichertes Raster liest sie zurück, Personalbedarf rechnet je Tag", () => {
        const r = rasterAusEinstellungen({
            vorlagen: [{ name: "Vormittag", start_time: "08:00", end_time: "12:00" }],
            einheit: "P", shiftDemand: { P: { frueh: 5 } }, doctorDemand: { P: { frueh: 1 } }, replacementMin: { P: { frueh: 4 } },
            closedSlots: { "6": ["frueh"] },
            dayShiftTimes: { besetzung: { "0": { frueh: { aerzte: 1, bedarf: 2, mindestens: 2 } }, "3": { frueh: { aerzte: 1, bedarf: 4, mindestens: 3 } } } },
        });
        expect(r.besetzungJeTag).toEqual({ "0": { frueh: { aerzte: 1, bedarf: 2, mindestens: 2 } } });
        const b = personalbedarf({ ...r, schichten: r.schichten });
        expect(b.stundenRegulaer).toBe(5 * 4 * 4 + 4 * 2);
        expect(b.stundenAerzte).toBe(6 * 4);
    });
});
