export type AnbindungsWeg = "fhir" | "hl7" | "ics" | "vermittler" | "datei";
export type AnbindungsKategorie = "kis" | "pflegesoftware" | "terminbuchung" | "vermittler" | "kalender";
export type AnbindungsStand = "bereit" | "zugang_noetig" | "nur_datei";
export type Richtung = "rein" | "raus" | "beides";
export type Datenart = "personal" | "einheiten" | "belegung" | "abwesenheiten" | "dienstplan" | "anfragen";
export const DATENART_TEXT: Record<Datenart, string> = {
    personal: "Personalstamm",
    einheiten: "Stationen / Wohnbereiche",
    belegung: "Belegung",
    abwesenheiten: "Abwesenheiten",
    dienstplan: "Dienstplan",
    anfragen: "Ausfall-Anfragen",
};
export type KatalogEintrag = {
    id: string;
    name: string;
    hersteller: string;
    kategorie: AnbindungsKategorie;
    wege: AnbindungsWeg[];
    stand: AnbindungsStand;
    richtung: Richtung;
    datenarten: Datenart[];
    fuerPlan: ("klinik" | "pflege" | "praxis")[];
    zweck: string;
    vorausgesetzt: string;
    einschraenkung?: string;
};
export type Anbindung = {
    id: string;
    facility_name: string;
    katalog_id: string;
    name: string;
    weg: AnbindungsWeg;
    aktiv: boolean;
    konfig: AnbindungsKonfig;
    letzter_lauf: string | null;
    letzter_status: LaufStatus | null;
    letzte_meldung: string | null;
    erstellt_am: string;
};
export type LaufStatus = "ok" | "teilweise" | "fehler";
export type AnbindungsKonfig = {
    basis?: string;
    auth?: "keine" | "basic" | "token";
    einheitenFilter?: string[];
    einheitenZuordnung?: Record<string, string>;
    uebernehmen?: Datenart[];
    station?: string;
    agenturId?: string;
    notiz?: string;
};
