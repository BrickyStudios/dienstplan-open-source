import { addDaysISO, berlinTodayISO, utcTagISO } from "@/lib/date";
import { chance, makeRng, pick, randint } from "@/lib/debug-simulator";
import { EINTRAG_ARTEN, type EintragArt } from "@/lib/personalakte/akte";
export const TESTDATEN_MARKE = "Testdaten";
export type AktenPerson = {
    id: string;
    full_name: string;
    role?: string | null;
    job_type?: string | null;
    max_hours_per_week?: number | null;
};
export type AkteZeileNeu = Record<string, unknown> & {
    facility_name: string;
    staff_id: string;
    full_name: string;
};
export type EintragZeileNeu = Record<string, unknown> & {
    facility_name: string;
    staff_id: string;
    art: EintragArt;
};
export type VerlaufZeileNeu = {
    facility_name: string;
    staff_id: string;
    feld: string;
    alt: string | null;
    neu: string | null;
    verschluesselt: boolean;
    wer: string;
    am: string;
};
export type ErzeugteAkten = {
    akten: AkteZeileNeu[];
    eintraege: EintragZeileNeu[];
    verlauf: VerlaufZeileNeu[];
};
const ORTE: [
    string,
    string
][] = [
    ["50667", "Köln"], ["50937", "Köln"], ["51063", "Köln"], ["53111", "Bonn"],
    ["40213", "Düsseldorf"], ["41061", "Mönchengladbach"], ["52062", "Aachen"],
    ["47051", "Duisburg"], ["45127", "Essen"], ["44135", "Dortmund"],
    ["51379", "Leverkusen"], ["50321", "Brühl"], ["53721", "Siegburg"],
    ["50226", "Frechen"], ["50354", "Hürth"], ["53840", "Troisdorf"],
];
const STRASSEN = [
    "Lindenweg", "Birkenstraße", "Am Mühlenbach", "Hauptstraße", "Gartenstraße",
    "Kirchweg", "Rosenstraße", "Bahnhofstraße", "Feldstraße", "Ahornallee",
    "Erlenkamp", "Im Kirchfeld", "Beethovenstraße", "Schillerstraße", "Mozartweg",
    "Buchenweg", "An der Kapelle", "Breite Straße", "Eichendorffstraße", "Talweg",
];
const KASSEN = [
    "AOK Rheinland/Hamburg", "Techniker Krankenkasse", "BARMER", "DAK-Gesundheit",
    "IKK classic", "BIG direkt gesund", "KKH Kaufmännische Krankenkasse", "hkk",
    "SBK Siemens-Betriebskrankenkasse", "Knappschaft",
];
const STAATEN = [
    "deutsch", "deutsch", "deutsch", "deutsch", "deutsch", "deutsch", "deutsch",
    "polnisch", "türkisch", "rumänisch", "kroatisch", "italienisch", "philippinisch", "spanisch",
];
const KUENDIGUNGSFRISTEN = [
    "4 Wochen zum 15. oder zum Monatsende",
    "1 Monat zum Monatsende",
    "3 Monate zum Quartalsende",
    "6 Wochen zum Quartalsende",
];
const AUSTRITTSGRUENDE = [
    "Eigenkündigung", "Ende der Befristung", "Aufhebungsvertrag",
    "Renteneintritt", "Kündigung in der Probezeit", "Wechsel zu anderem Träger",
];
const KONTAKTE: Record<"w" | "m", {
    vornamen: string[];
    beziehungen: string[];
}> = {
    w: {
        vornamen: ["Anja", "Christa", "Elke", "Gudrun", "Inge", "Karin", "Marion", "Petra", "Sigrid", "Ulrike", "Yvonne", "Zeynep"],
        beziehungen: ["Ehepartnerin", "Mutter", "Schwester", "Lebensgefährtin", "Tochter"],
    },
    m: {
        vornamen: ["Bernd", "Dieter", "Frank", "Holger", "Jörg", "Lothar", "Norbert", "Rolf", "Thorsten", "Walter"],
        beziehungen: ["Ehepartner", "Vater", "Bruder", "Lebensgefährte", "Sohn"],
    },
};
const NACHNAMEN = [
    "Arendt", "Bongartz", "Clasen", "Dohmen", "Esser", "Fassbender", "Gierlich",
    "Hoppe", "Jakobs", "Kallen", "Lennartz", "Mertens", "Nellessen", "Offermanns",
    "Pützer", "Quirin", "Rütten", "Schmitz", "Thelen", "Urbach", "Virnich", "Wirtz",
];
const FORTBILDUNGEN: [
    string,
    number
][] = [
    ["Erste Hilfe — Auffrischung", 24],
    ["Unterweisung Brandschutz", 12],
    ["Hygieneschulung nach § 23 IfSG", 12],
    ["Reanimationstraining (Basic Life Support)", 12],
    ["Arbeitsschutzbelehrung", 12],
    ["Datenschutz-Unterweisung", 12],
    ["Umgang mit Medizinprodukten (MPBetreibV)", 24],
    ["Deeskalationstraining", 36],
    ["Fortbildung Dekubitusprophylaxe", 24],
    ["Fortbildung Schmerzmanagement", 24],
];
const FORTBILDUNGEN_PRAXIS: [
    string,
    number
][] = [
    ["Erste Hilfe — Auffrischung", 24],
    ["Unterweisung Brandschutz", 12],
    ["Hygieneschulung nach § 23 IfSG", 12],
    ["Notfalltraining im Praxisteam", 12],
    ["Arbeitsschutzbelehrung", 12],
    ["Datenschutz-Unterweisung", 12],
    ["Umgang mit Medizinprodukten (MPBetreibV)", 24],
    ["Aktualisierung der Kenntnisse im Strahlenschutz", 60],
    ["QM-Schulung nach QM-Richtlinie (G-BA)", 12],
    ["Abrechnung EBM — Neuerungen", 12],
];
const GESPRAECHE = [
    "Jahresgespräch", "Zielvereinbarung", "Gespräch zur Arbeitszeitverteilung",
    "Gespräch zur Fortbildungsplanung", "Feedbackgespräch",
];
const BESCHEINIGUNGEN: [
    string,
    number
][] = [
    ["Erweitertes Führungszeugnis", 60],
    ["Berufsurkunde", 0],
    ["Fahrerlaubnis Klasse B (Kopie)", 0],
    ["Nachweis der Berufshaftpflicht", 24],
];
const VERTRAGSAENDERUNGEN = [
    "Erhöhung der Wochenstunden", "Wechsel in Teilzeit", "Höhergruppierung",
    "Stationswechsel", "Zusatzvereinbarung Bereitschaftsdienst",
];
const VERTRAGSAENDERUNGEN_PRAXIS = [
    "Erhöhung der Wochenstunden", "Wechsel in Teilzeit", "Höhergruppierung (Tätigkeitsgruppe)",
    "Zusatzvereinbarung Samstagssprechstunde", "Übernahme nach der Ausbildung",
];
function istPraxisRolle(role: string | null | undefined): boolean {
    return /(MFA|ZFA)|Praxisärzt|Praxisarzt|Weiterbildungsassistenz/.test(role ?? "");
}
const ABMAHNUNGEN = [
    "Abmahnung — unentschuldigtes Fehlen",
    "Abmahnung — wiederholt verspäteter Dienstbeginn",
    "Abmahnung — Verstoß gegen die Dokumentationspflicht",
];
const TAETIGKEIT: Record<string, string> = {
    "Pflegefachkraft": "Pflegefachkraft",
    "Pflegekraft": "Pflegehilfskraft",
    "Stationsleitung": "Stationsleitung",
    "Arzt": "Assistenzarzt",
    "Ärztin": "Assistenzärztin",
};
export function plusMonate(iso: string, monate: number): string {
    const j = +iso.slice(0, 4), m = +iso.slice(5, 7), t = +iso.slice(8, 10);
    const zielMonat = m - 1 + monate;
    const letzter = new Date(Date.UTC(j, zielMonat + 1, 0)).getUTCDate();
    return utcTagISO(Date.UTC(j, zielMonat, Math.min(t, letzter)));
}
function seedAus(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}
export function testSteuerId(rng: () => number): string {
    let s = String(randint(rng, 1, 9));
    for (let i = 0; i < 10; i++)
        s += String(randint(rng, 0, 9));
    return s;
}
export function testSvNummer(rng: () => number, geburtsdatum: string, nachname: string): string {
    const bereich = String(randint(rng, 2, 89)).padStart(2, "0");
    const ttmmjj = `${geburtsdatum.slice(8, 10)}${geburtsdatum.slice(5, 7)}${geburtsdatum.slice(2, 4)}`;
    const roh = (nachname.match(/\p{L}/u)?.[0] ?? "M").toUpperCase();
    const buchstabe = /^[A-Z]$/.test(roh) ? roh : "M";
    const serie = String(randint(rng, 0, 99)).padStart(2, "0");
    return `${bereich}${ttmmjj}${buchstabe}${serie}${randint(rng, 0, 9)}`;
}
export type AkteOptionen = {
    mitGeheimnissen?: boolean;
    heute?: string;
};
type Sonderfall = "probezeit_laeuft_aus" | "befristung_laeuft_aus" | "austritt_steht_an";
const SONDERFAELLE: Sonderfall[] = ["probezeit_laeuft_aus", "befristung_laeuft_aus", "austritt_steht_an"];
function notfallkontakt(rng: () => number): string {
    const g = KONTAKTE[rng() < 0.5 ? "w" : "m"];
    return `${pick(rng, g.vornamen)} ${pick(rng, NACHNAMEN)}, ${pick(rng, g.beziehungen)}, 0155 ${randint(rng, 1000000, 9999999)}`;
}
export function erzeugeAkte(facility: string, person: AktenPerson, index: number, optionen: AkteOptionen = {}): AkteZeileNeu {
    const heute = optionen.heute ?? berlinTodayISO();
    const rng = makeRng(seedAus(`${facility}|${person.full_name}|akte`));
    const sonderfall: Sonderfall | null = index < SONDERFAELLE.length ? SONDERFAELLE[index] : null;
    const alter = randint(rng, 21, 62);
    const geburtsdatum = addDaysISO(plusMonate(heute, -alter * 12), -randint(rng, 0, 364));
    const [plz, ort] = pick(rng, ORTE);
    const nachname = person.full_name.trim().split(/\s+/).slice(-1)[0] ?? person.full_name;
    const geburtsname = chance(rng, 0.15) ? pick(rng, NACHNAMEN) : null;
    const eintritt = sonderfall === "probezeit_laeuft_aus"
        ? addDaysISO(plusMonate(heute, -6), randint(rng, 2, 25))
        : plusMonate(heute, -randint(rng, 1, 144));
    const probezeitEnde = plusMonate(eintritt, 6);
    const probezeit_bis = probezeitEnde >= heute ? probezeitEnde : null;
    const befristet_bis = sonderfall === "befristung_laeuft_aus"
        ? addDaysISO(heute, randint(rng, 10, 55))
        : chance(rng, 0.14) ? plusMonate(heute, randint(rng, 2, 20)) : null;
    let austritt: string | null = null;
    if (sonderfall === "austritt_steht_an")
        austritt = addDaysISO(heute, randint(rng, 3, 12));
    else if (chance(rng, 0.05))
        austritt = plusMonate(heute, -randint(rng, 1, 10));
    if (austritt && austritt < eintritt)
        austritt = null;
    const stunden = person.max_hours_per_week ?? null;
    const taetigkeit = TAETIGKEIT[person.role ?? ""] ?? (person.role || "Pflegekraft");
    const mail = person.full_name.toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
    const zeile: AkteZeileNeu = {
        facility_name: facility,
        staff_id: person.id,
        full_name: person.full_name,
        geburtsdatum,
        geburtsort: ort,
        geburtsname,
        staatsangehoerigkeit: pick(rng, STAATEN),
        strasse: `${pick(rng, STRASSEN)} ${randint(rng, 1, 148)}`,
        plz,
        ort,
        telefon_privat: `0155 ${randint(rng, 1000000, 9999999)}`,
        email_privat: `${mail || "person"}@example.org`,
        notfallkontakt: notfallkontakt(rng),
        krankenkasse: pick(rng, KASSEN),
        taetigkeit,
        eintritt,
        probezeit_bis,
        befristet_bis,
        austritt,
        austrittsgrund: austritt ? pick(rng, AUSTRITTSGRUENDE) : null,
        wochenstunden: stunden,
        urlaubstage_vertrag: stunden !== null && stunden < 30 ? randint(rng, 24, 28) : randint(rng, 28, 30),
        kuendigungsfrist: pick(rng, KUENDIGUNGSFRISTEN),
        geaendert_am: new Date().toISOString(),
        geaendert_von: TESTDATEN_MARKE,
    };
    if (optionen.mitGeheimnissen) {
        zeile.steuer_id = testSteuerId(rng);
        zeile.sv_nummer = testSvNummer(rng, geburtsdatum, geburtsname ?? nachname);
    }
    if (!sonderfall && chance(rng, 0.17)) {
        for (const feld of pick(rng, [["krankenkasse"], ["geburtsdatum"], ["strasse", "plz", "ort"]])) {
            zeile[feld] = null;
        }
    }
    return zeile;
}
type EintragEntwurf = {
    art: EintragArt;
    datum: string;
    titel: string;
    notiz?: string | null;
    wiedervorlage?: string | null;
    kenntnis?: "offen" | "bestaetigt";
};
function datumDE(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
export function erzeugeEintraege(facility: string, person: AktenPerson, akte: AkteZeileNeu, optionen: AkteOptionen = {}): EintragZeileNeu[] {
    const heute = optionen.heute ?? berlinTodayISO();
    const rng = makeRng(seedAus(`${facility}|${person.full_name}|eintraege`));
    const eintritt = (akte.eintritt as string | null) ?? plusMonate(heute, -12);
    const austritt = akte.austritt as string | null;
    const bis = austritt && austritt < heute ? austritt : heute;
    const monateDabei = Math.max(1, Math.round((Date.parse(bis) - Date.parse(eintritt)) / (30.44 * 86400000)));
    const entwuerfe: EintragEntwurf[] = [];
    const praxis = istPraxisRolle(person.role);
    const fortbildungen = praxis ? FORTBILDUNGEN_PRAXIS : FORTBILDUNGEN;
    entwuerfe.push({
        art: "vertrag",
        datum: eintritt,
        titel: `Arbeitsvertrag vom ${datumDE(eintritt)}`,
        notiz: `${akte.taetigkeit ?? "Pflegekraft"}, ${person.job_type ?? "Vollzeit"}` +
            (akte.wochenstunden ? `, ${akte.wochenstunden} Wochenstunden` : "") +
            (akte.befristet_bis ? `, befristet bis ${datumDE(String(akte.befristet_bis))}` : ", unbefristet") + ".",
    });
    entwuerfe.push({
        art: "eintritt",
        datum: eintritt,
        titel: "Eintrittsunterlagen",
        notiz: "Personalfragebogen, Mitgliedsbescheinigung der Krankenkasse und Steuer-ID liegen vor.",
    });
    for (const [titel, monate] of BESCHEINIGUNGEN) {
        if (!chance(rng, 0.55))
            continue;
        const datum = addDaysISO(eintritt, randint(rng, 0, 30));
        if (datum > bis)
            continue;
        entwuerfe.push({
            art: "bescheinigung",
            datum,
            titel,
            wiedervorlage: monate > 0 ? plusMonate(datum, monate) : null,
        });
    }
    const probezeitEnde = plusMonate(eintritt, 6);
    if (probezeitEnde < bis) {
        entwuerfe.push({
            art: "gespraech",
            datum: addDaysISO(probezeitEnde, -randint(rng, 5, 20)),
            titel: "Probezeitgespräch",
            notiz: "Einarbeitung abgeschlossen, Übernahme ohne Einschränkung.",
            kenntnis: chance(rng, 0.7) ? "bestaetigt" : "offen",
        });
    }
    const anzahlFortbildungen = Math.min(12, Math.max(1, Math.round(monateDabei / 6)));
    for (let i = 0; i < anzahlFortbildungen; i++) {
        const [titel, monate] = fortbildungen[(i + randint(rng, 0, 9)) % fortbildungen.length];
        const datum = addDaysISO(eintritt, randint(rng, 14, Math.max(14, monateDabei * 30)));
        if (datum > bis)
            continue;
        entwuerfe.push({
            art: "fortbildung",
            datum,
            titel,
            notiz: `Teilnahme bestätigt, ${randint(rng, 4, 16)} Unterrichtseinheiten.`,
            wiedervorlage: plusMonate(datum, monate),
        });
    }
    for (let jahr = 1; jahr <= Math.min(5, Math.floor(monateDabei / 12)); jahr++) {
        const datum = plusMonate(eintritt, jahr * 12 + randint(rng, -1, 1));
        if (datum > bis || datum < eintritt)
            continue;
        entwuerfe.push({
            art: "gespraech",
            datum,
            titel: pick(rng, GESPRAECHE),
            notiz: "Gesprächsnotiz liegt der Akte bei. Keine Zielabweichung festgehalten.",
            kenntnis: chance(rng, 0.6) ? "bestaetigt" : "offen",
        });
    }
    if (monateDabei > 8 && chance(rng, 0.25)) {
        const datum = plusMonate(eintritt, randint(rng, 7, Math.max(8, monateDabei)));
        if (datum <= bis) {
            entwuerfe.push({
                art: "vertragsaenderung",
                datum,
                titel: pick(rng, praxis ? VERTRAGSAENDERUNGEN_PRAXIS : VERTRAGSAENDERUNGEN),
                notiz: "Nachtrag zum Arbeitsvertrag, von beiden Seiten unterschrieben.",
                kenntnis: "bestaetigt",
            });
        }
    }
    if (monateDabei > 6 && chance(rng, 0.07)) {
        const datum = plusMonate(eintritt, randint(rng, 4, Math.max(5, monateDabei)));
        if (datum <= bis) {
            entwuerfe.push({
                art: "abmahnung",
                datum,
                titel: pick(rng, ABMAHNUNGEN),
                notiz: "Sachverhalt im Gespräch erörtert. Bei Wiederholung weitere Maßnahmen angekündigt.",
                wiedervorlage: plusMonate(datum, 6),
                kenntnis: chance(rng, 0.5) ? "bestaetigt" : "offen",
            });
        }
    }
    if (austritt && austritt <= heute) {
        entwuerfe.push({
            art: "zeugnis",
            datum: austritt,
            titel: "Qualifiziertes Arbeitszeugnis",
            notiz: "Zeugnis ausgestellt und übergeben.",
        });
        entwuerfe.push({
            art: "austritt",
            datum: austritt,
            titel: "Austrittsunterlagen",
            notiz: "Arbeitspapiere, Dienstausweis und Zugänge zurückgegeben, Resturlaub abgerechnet.",
        });
    }
    entwuerfe.sort((a, b) => a.datum.localeCompare(b.datum));
    const wvGrenze = austritt;
    return entwuerfe.map(e => ({
        facility_name: facility,
        staff_id: person.id,
        art: e.art,
        datum: e.datum,
        titel: e.titel.slice(0, 200),
        notiz: e.notiz ?? null,
        wiedervorlage: e.wiedervorlage && (!wvGrenze || e.wiedervorlage <= wvGrenze) ? e.wiedervorlage : null,
        kenntnis_angefordert: e.kenntnis !== undefined,
        kenntnis_am: e.kenntnis === "bestaetigt" ? `${addDaysISO(e.datum, randint(rng, 1, 6))}T09:12:00.000Z` : null,
        kenntnis_von: e.kenntnis === "bestaetigt" ? person.full_name : null,
        erstellt_von: TESTDATEN_MARKE,
        erstellt_am: `${e.datum}T08:00:00.000Z`,
    }));
}
export function erzeugeVerlauf(facility: string, person: AktenPerson, akte: AkteZeileNeu, optionen: AkteOptionen = {}): VerlaufZeileNeu[] {
    const heute = optionen.heute ?? berlinTodayISO();
    const rng = makeRng(seedAus(`${facility}|${person.full_name}|verlauf`));
    const eintritt = (akte.eintritt as string | null) ?? plusMonate(heute, -12);
    const aus: VerlaufZeileNeu[] = [];
    const am = (tageHer: number) => `${addDaysISO(heute, -tageHer)}T10:30:00.000Z`;
    const liegtImVerhaeltnis = (tageHer: number) => addDaysISO(heute, -tageHer) > eintritt;
    if (akte.strasse && chance(rng, 0.35)) {
        const tage = randint(rng, 20, 900);
        if (liegtImVerhaeltnis(tage)) {
            aus.push({
                facility_name: facility, staff_id: person.id, feld: "strasse",
                alt: `${pick(rng, STRASSEN)} ${randint(rng, 1, 90)}`, neu: String(akte.strasse),
                verschluesselt: false, wer: TESTDATEN_MARKE, am: am(tage),
            });
        }
    }
    if (akte.wochenstunden && chance(rng, 0.3)) {
        const tage = randint(rng, 30, 700);
        if (liegtImVerhaeltnis(tage)) {
            const alt = Math.max(10, Number(akte.wochenstunden) - pick(rng, [5, 10, 15]));
            aus.push({
                facility_name: facility, staff_id: person.id, feld: "wochenstunden",
                alt: String(alt), neu: String(akte.wochenstunden),
                verschluesselt: false, wer: TESTDATEN_MARKE, am: am(tage),
            });
        }
    }
    if (akte.krankenkasse && chance(rng, 0.2)) {
        const tage = randint(rng, 40, 800);
        if (liegtImVerhaeltnis(tage)) {
            aus.push({
                facility_name: facility, staff_id: person.id, feld: "krankenkasse",
                alt: pick(rng, KASSEN), neu: String(akte.krankenkasse),
                verschluesselt: false, wer: TESTDATEN_MARKE, am: am(tage),
            });
        }
    }
    return aus.filter(v => v.alt !== v.neu);
}
export function erzeugeAkten(facility: string, personen: AktenPerson[], optionen: AkteOptionen = {}): ErzeugteAkten {
    const sortiert = [...personen].sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));
    const akten: AkteZeileNeu[] = [];
    const eintraege: EintragZeileNeu[] = [];
    const verlauf: VerlaufZeileNeu[] = [];
    sortiert.forEach((person, i) => {
        const akte = erzeugeAkte(facility, person, i, optionen);
        akten.push(akte);
        eintraege.push(...erzeugeEintraege(facility, person, akte, optionen));
        verlauf.push(...erzeugeVerlauf(facility, person, akte, optionen));
    });
    return { akten, eintraege, verlauf };
}
export function fasseZusammen(e: ErzeugteAkten): string {
    const jeArt = new Map<string, number>();
    for (const z of e.eintraege)
        jeArt.set(z.art, (jeArt.get(z.art) ?? 0) + 1);
    const teile = [...jeArt.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([art, n]) => `${n}× ${EINTRAG_ARTEN[art as EintragArt] ?? art}`);
    return `${e.akten.length} Akten, ${e.eintraege.length} Einträge (${teile.join(", ")}), ${e.verlauf.length} Verlaufszeilen`;
}
