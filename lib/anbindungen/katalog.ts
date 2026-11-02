import type { KatalogEintrag } from "./typen";
const KIS_VORAUSSETZUNG = "Ihre IT schaltet einen Zugang frei: entweder einen FHIR-Endpunkt (R4, lesend) " +
    "oder eine HL7-v2-Strecke, die ADT-Nachrichten an Nurvo schickt. Nurvo spricht " +
    "beides; welches davon Ihr Haus lizenziert hat, weiß Ihre IT.";
const KIS_ZWECK = "Personalstamm und Stationen einmalig übernehmen, danach die Belegung täglich — " +
    "die Zahl, aus der die Soll-Besetzung folgt.";
export const KATALOG: KatalogEintrag[] = [
    {
        id: "orbis",
        name: "ORBIS",
        hersteller: "Dedalus HealthCare",
        kategorie: "kis",
        wege: ["fhir", "hl7"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
    },
    {
        id: "ishmed",
        name: "i.s.h.med",
        hersteller: "Oracle Health / SAP",
        kategorie: "kis",
        wege: ["hl7", "fhir"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
        einschraenkung: "In SAP-Häusern liegt der Personalstamm meist nicht im KIS, sondern in der " +
            "Personalwirtschaft daneben. Dann kommen über diesen Weg Stationen und " +
            "Belegung, und die Mitarbeiterliste einmalig über den Dateiweg.",
    },
    {
        id: "nexus",
        name: "NEXUS / KIS",
        hersteller: "NEXUS AG",
        kategorie: "kis",
        wege: ["fhir", "hl7"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
    },
    {
        id: "medico",
        name: "MEDICO",
        hersteller: "CompuGroup Medical",
        kategorie: "kis",
        wege: ["hl7", "fhir"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
    },
    {
        id: "mkis",
        name: "M-KIS",
        hersteller: "MEIERHOFER AG",
        kategorie: "kis",
        wege: ["hl7", "fhir"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
    },
    {
        id: "clinicenter",
        name: "CliniCenter",
        hersteller: "KCC — Krammer Clinic Consulting GmbH",
        kategorie: "kis",
        wege: ["hl7", "fhir"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik"],
        zweck: KIS_ZWECK,
        vorausgesetzt: KIS_VORAUSSETZUNG,
        einschraenkung: "CliniCenter kommt aus Österreich und ist dort auf ELGA ausgerichtet. Für die " +
            "Belegungszahl ändert das nichts — eine ADT-Nachricht sagt Aufnahme, Verlegung, " +
            "Entlassung, und mehr braucht sie nicht. Die PPBV-Rechnung selbst gilt nur in " +
            "Deutschland; ein österreichisches Haus nutzt die Soll-/Ist-Auswertung ohne " +
            "diesen Rechtsrahmen.",
    },
    {
        id: "kis-anderes",
        name: "Anderes KIS",
        hersteller: "beliebig",
        kategorie: "kis",
        wege: ["fhir", "hl7"],
        stand: "bereit",
        richtung: "rein",
        datenarten: ["personal", "einheiten", "belegung"],
        fuerPlan: ["klinik", "pflege"],
        zweck: "Für jedes System, das HL7 v2 oder FHIR R4 spricht — auch die Eigenentwicklung " +
            "einer Universitätsklinik.",
        vorausgesetzt: KIS_VORAUSSETZUNG,
    },
    {
        id: "vivendi",
        name: "Vivendi",
        hersteller: "Connext Communication",
        kategorie: "pflegesoftware",
        wege: ["datei"],
        stand: "nur_datei",
        richtung: "rein",
        datenarten: ["personal", "einheiten"],
        fuerPlan: ["pflege"],
        zweck: "Mitarbeiterliste und Wohnbereiche übernehmen, statt sie abzutippen.",
        vorausgesetzt: "Mitarbeiterliste exportieren oder in Excel öffnen, markieren, kopieren — Nurvo " +
            "liest den eingefügten Text und erkennt die Spalten selbst.",
        einschraenkung: "Keine laufende Verbindung: Was sich in Vivendi ändert, ändert sich in Nurvo " +
            "nicht mit. Der Weg taugt für die Einführung, nicht für den Dauerbetrieb.",
    },
    {
        id: "medifox",
        name: "MediFox DAN",
        hersteller: "MediFox DAN GmbH",
        kategorie: "pflegesoftware",
        wege: ["datei"],
        stand: "nur_datei",
        richtung: "rein",
        datenarten: ["personal", "einheiten"],
        fuerPlan: ["pflege"],
        zweck: "Mitarbeiterliste und Wohnbereiche übernehmen, statt sie abzutippen.",
        vorausgesetzt: "Mitarbeiterliste exportieren oder aus der Tabellenansicht kopieren und in Nurvo " +
            "einfügen.",
        einschraenkung: "Keine laufende Verbindung — siehe Vivendi. Für die Einführung reicht es, für " +
            "den Dauerbetrieb nicht.",
    },
    {
        id: "myneva",
        name: "myneva",
        hersteller: "myneva Group",
        kategorie: "pflegesoftware",
        wege: ["datei"],
        stand: "nur_datei",
        richtung: "rein",
        datenarten: ["personal", "einheiten"],
        fuerPlan: ["pflege"],
        zweck: "Mitarbeiterliste und Wohnbereiche übernehmen, statt sie abzutippen.",
        vorausgesetzt: "Export als Liste, danach in Nurvo einfügen.",
        einschraenkung: "Keine laufende Verbindung — siehe Vivendi.",
    },
    {
        id: "doctolib",
        name: "Doctolib",
        hersteller: "Doctolib GmbH",
        kategorie: "terminbuchung",
        wege: ["ics"],
        stand: "zugang_noetig",
        richtung: "raus",
        datenarten: ["dienstplan"],
        fuerPlan: ["praxis", "klinik"],
        zweck: "Wer wann da ist, steht in Nurvo. Doctolib soll keine Sprechstunde anbieten, " +
            "für die niemand eingeteilt ist.",
        vorausgesetzt: "Heute: das Kalenderabo — Doctolib-Kalender und Nurvo-Plan nebeneinander im " +
            "selben Kalenderprogramm. Für die beidseitige Anbindung braucht es eine " +
            "Partnerschaft mit Doctolib.",
        einschraenkung: "Doctolib öffnet seine Partner-API für Praxisverwaltungssysteme (tomedo, " +
            "Evident, tinana und andere). Nurvo ist keines — wir planen Dienste, nicht " +
            "Behandlungen. Solange diese Partnerschaft nicht steht, gibt es keinen " +
            "Schreibzugriff auf einen Doctolib-Kalender, und alles andere hier wäre eine " +
            "Behauptung. Der Kalenderweg läuft ohne jede Freigabe.",
    },
    {
        id: "samedi",
        name: "samedi",
        hersteller: "samedi GmbH",
        kategorie: "terminbuchung",
        wege: ["ics"],
        stand: "zugang_noetig",
        richtung: "raus",
        datenarten: ["dienstplan"],
        fuerPlan: ["praxis", "klinik"],
        zweck: "Dienstplan und Terminkalender nebeneinanderlegen — siehe Doctolib.",
        vorausgesetzt: "Kalenderabo. Für mehr: Zugang beim Hersteller erfragen.",
        einschraenkung: "Wie bei Doctolib: kein offener Schreibzugriff ohne Vertrag.",
    },
    {
        id: "doctari",
        name: "doctari",
        hersteller: "doctari GmbH",
        kategorie: "vermittler",
        wege: ["vermittler"],
        stand: "bereit",
        richtung: "raus",
        datenarten: ["anfragen"],
        fuerPlan: ["klinik", "pflege", "praxis"],
        zweck: "Bei Ausfall automatisch anfragen — mit Datum, Schicht und Station, ohne den " +
            "Namen der kranken Person.",
        vorausgesetzt: "Die Ansprechadresse Ihres doctari-Kontakts. Anfragen gehen nur an Dienste, die " +
            "Sie selbst eingetragen haben.",
        einschraenkung: "Der Weg ist E-Mail mit Zusage-/Absage-Link, keine Systemanbindung: doctari " +
            "bietet öffentlich keine Schnittstelle an (geprüft 20.09.2026). Das ist weniger " +
            "schlimm, als es klingt — die Antwort kommt von einem Menschen, und der Link " +
            "führt ihn in zwei Klicks durch.",
    },
    {
        id: "pacura",
        name: "Pacura med",
        hersteller: "Pacura med GmbH",
        kategorie: "vermittler",
        wege: ["vermittler"],
        stand: "bereit",
        richtung: "raus",
        datenarten: ["anfragen"],
        fuerPlan: ["klinik", "pflege"],
        zweck: "Zweiter Dienst in der Reihe — wer zuerst zusagt, bekommt die Schicht.",
        vorausgesetzt: "Ansprechadresse eintragen.",
        einschraenkung: "E-Mail-Weg wie bei doctari.",
    },
    {
        id: "vermittler-eigen",
        name: "Eigener Personaldienstleister",
        hersteller: "beliebig",
        kategorie: "vermittler",
        wege: ["vermittler"],
        stand: "bereit",
        richtung: "raus",
        datenarten: ["anfragen"],
        fuerPlan: ["klinik", "pflege", "praxis"],
        zweck: "Die meisten Häuser arbeiten mit einem Dienst vor Ort, den kein Katalog kennt.",
        vorausgesetzt: "Name und E-Mail-Adresse.",
    },
    {
        id: "kalender-abo",
        name: "Kalenderabo (Outlook, Google, Apple)",
        hersteller: "—",
        kategorie: "kalender",
        wege: ["ics"],
        stand: "bereit",
        richtung: "raus",
        datenarten: ["dienstplan"],
        fuerPlan: ["klinik", "pflege", "praxis"],
        zweck: "Der Dienstplan im Kalender, in dem ohnehin alles andere steht — er " +
            "aktualisiert sich selbst.",
        vorausgesetzt: "Nichts. Nurvo gibt eine Adresse aus, die im Kalenderprogramm als Abo " +
            "eingetragen wird.",
        einschraenkung: "Nur lesend und nur in eine Richtung: Ein Termin, der im Outlook-Kalender " +
            "verschoben wird, verschiebt keine Schicht in Nurvo.",
    },
];
export function katalogEintrag(id: string): KatalogEintrag | null {
    return KATALOG.find((e) => e.id === id) ?? null;
}
export function katalogFuerPlan(plan: "klinik" | "pflege" | "praxis"): KatalogEintrag[] {
    return KATALOG.filter((e) => e.fuerPlan.includes(plan));
}
export const KATEGORIE_TEXT: Record<string, string> = {
    kis: "Krankenhausinformationssystem",
    pflegesoftware: "Pflegesoftware",
    terminbuchung: "Terminbuchung",
    vermittler: "Personaldienstleister",
    kalender: "Kalender",
};
export const STAND_TEXT: Record<string, string> = {
    bereit: "Einsatzbereit",
    zugang_noetig: "Zugang beim Hersteller nötig",
    nur_datei: "Nur über Datei",
};
