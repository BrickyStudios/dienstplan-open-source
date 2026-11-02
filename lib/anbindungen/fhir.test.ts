import { describe, expect, it } from "vitest";
import { belegungAus, nameAus, personalAus, stationenAus, stationsNamen, zieladresseErlaubt, } from "./fhir";
const ORTE = [
    { resourceType: "Location", id: "l1", name: "Station 1A", physicalType: { coding: [{ code: "wa" }] } },
    { resourceType: "Location", id: "l2", name: "Station 3B", physicalType: { coding: [{ code: "wa" }] } },
    { resourceType: "Location", id: "l3", name: "Zimmer 193", physicalType: { coding: [{ code: "ro" }] } },
    { resourceType: "Location", id: "l4", name: "Bett 1", physicalType: { coding: [{ code: "bd" }] } },
    { resourceType: "Location", id: "l5", name: "Alte Station", status: "inactive", physicalType: { coding: [{ code: "wa" }] } },
];
describe("zieladresseErlaubt", () => {
    it("lässt eine gewöhnliche KIS-Adresse durch", () => {
        expect(zieladresseErlaubt("https://kis.klinikum.example/fhir").ok).toBe(true);
    });
    it("lässt das Hausnetz durch — dort steht das KIS", () => {
        expect(zieladresseErlaubt("http://10.4.1.20:8080/fhir").ok).toBe(true);
        expect(zieladresseErlaubt("https://192.168.5.9/fhir").ok).toBe(true);
    });
    it("sperrt den Metadatendienst der Cloud", () => {
        expect(zieladresseErlaubt("http://169.254.169.254/latest/meta-data/").ok).toBe(false);
        expect(zieladresseErlaubt("http://metadata.google.internal/").ok).toBe(false);
    });
    it("sperrt die Rückschleife — das wäre unser eigener Server", () => {
        expect(zieladresseErlaubt("http://127.0.0.1:3000/api").ok).toBe(false);
        expect(zieladresseErlaubt("http://localhost/fhir").ok).toBe(false);
        expect(zieladresseErlaubt("http://[::1]/fhir").ok).toBe(false);
    });
    it("sperrt alles, was kein http ist", () => {
        expect(zieladresseErlaubt("file:///etc/passwd").ok).toBe(false);
        expect(zieladresseErlaubt("gopher://x/").ok).toBe(false);
        expect(zieladresseErlaubt("kein-url").ok).toBe(false);
    });
});
describe("nameAus", () => {
    it("bevorzugt den amtlichen Namen vor dem Geburtsnamen", () => {
        const p = {
            name: [
                { use: "maiden", family: "Schmidt", given: ["Erika"] },
                { use: "official", family: "Mustermann", given: ["Erika"] },
            ],
        };
        expect(nameAus(p)).toBe("Erika Mustermann");
    });
    it("nimmt `text`, wenn das System ihn mitliefert", () => {
        expect(nameAus({ name: [{ text: "Dr. med. Anna Arzt" }] })).toBe("Dr. med. Anna Arzt");
    });
    it("gibt leeren Text zurück statt zu raten", () => {
        expect(nameAus({})).toBe("");
    });
});
describe("stationenAus", () => {
    it("nimmt Stationen und lässt Zimmer und Betten liegen", () => {
        expect(stationenAus(ORTE).map((s) => s.name)).toEqual(["Station 1A", "Station 3B"]);
    });
    it("überspringt stillgelegte Orte", () => {
        expect(stationenAus(ORTE).map((s) => s.name)).not.toContain("Alte Station");
    });
});
describe("personalAus", () => {
    const LEUTE = [
        { resourceType: "Practitioner", id: "p1", name: [{ family: "Mustermann", given: ["Erika"] }] },
        { resourceType: "Practitioner", id: "p2", name: [{ family: "Krank", given: ["Karl"] }], active: false },
        { resourceType: "Practitioner", id: "p3", name: [{ family: "Ohnerolle", given: ["Otto"] }] },
    ];
    const ROLLEN = [
        {
            resourceType: "PractitionerRole",
            practitioner: { reference: "Practitioner/p1" },
            location: [{ reference: "Location/l1" }],
            code: [{ coding: [{ display: "Pflegefachkraft" }] }],
        },
        {
            resourceType: "PractitionerRole",
            practitioner: { reference: "Practitioner/p1" },
            location: [{ reference: "Location/l2" }],
            code: [{ coding: [{ display: "Praxisanleitung" }] }],
        },
    ];
    it("verbindet Person, Rolle und Station", () => {
        const liste = personalAus(LEUTE, ROLLEN, stationsNamen(ORTE));
        const erika = liste.find((p) => p.name === "Erika Mustermann")!;
        expect(erika.rolle).toBe("Pflegefachkraft");
        expect(erika.station).toBe("Station 1A");
    });
    it("führt eine Person einmal, auch wenn sie zwei Rollen hat", () => {
        const liste = personalAus(LEUTE, ROLLEN, stationsNamen(ORTE));
        expect(liste.filter((p) => p.name === "Erika Mustermann")).toHaveLength(1);
    });
    it("lässt ausgeschiedene Personen weg", () => {
        const liste = personalAus(LEUTE, ROLLEN, stationsNamen(ORTE));
        expect(liste.map((p) => p.name)).not.toContain("Karl Krank");
    });
    it("nimmt Personen ohne Rolle mit — ohne Station statt gar nicht", () => {
        const liste = personalAus(LEUTE, ROLLEN, stationsNamen(ORTE));
        const otto = liste.find((p) => p.name === "Otto Ohnerolle")!;
        expect(otto.station).toBeNull();
        expect(otto.rolle).toBeNull();
    });
});
describe("belegungAus", () => {
    const namen = stationsNamen(ORTE);
    it("zählt nur laufende Aufenthalte", () => {
        const faelle = [
            { status: "in-progress", location: [{ location: { reference: "Location/l1" } }] },
            { status: "in-progress", location: [{ location: { reference: "Location/l1" } }] },
            { status: "finished", location: [{ location: { reference: "Location/l1" } }] },
            { status: "planned", location: [{ location: { reference: "Location/l2" } }] },
        ];
        expect(belegungAus(faelle, namen)).toEqual([{ station: "Station 1A", anzahl: 2 }]);
    });
    it("zählt einen verlegten Fall an seinem aktuellen Ort, nicht an beiden", () => {
        const faelle = [
            {
                status: "in-progress",
                location: [
                    { location: { reference: "Location/l1" }, status: "completed" },
                    { location: { reference: "Location/l2" }, status: "active" },
                ],
            },
        ];
        expect(belegungAus(faelle, namen)).toEqual([{ station: "Station 3B", anzahl: 1 }]);
    });
    it("überspringt Fälle, deren Ort nicht auflösbar ist", () => {
        const faelle = [{ status: "in-progress", location: [{ location: { reference: "Location/unbekannt" } }] }];
        expect(belegungAus(faelle, namen)).toEqual([]);
    });
    it("nimmt aus einem Fall nichts als Ort und Zahl", () => {
        const faelle = [
            {
                status: "in-progress",
                subject: { reference: "Patient/4711", display: "Erika Mustermann" },
                location: [{ location: { reference: "Location/l1" } }],
            },
        ];
        expect(JSON.stringify(belegungAus(faelle, namen))).not.toContain("Mustermann");
    });
});
