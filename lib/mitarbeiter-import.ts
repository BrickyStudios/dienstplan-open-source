export const BESCHAEFTIGUNGSARTEN = ["Vollzeit", "Teilzeit", "Minijob", "Werkstudent", "Aushilfe"] as const;
export type Beschaeftigung = (typeof BESCHAEFTIGUNGSARTEN)[number];
export const STUNDEN_VORGABE: Record<Beschaeftigung, number> = {
    Vollzeit: 40, Teilzeit: 20, Minijob: 10, Werkstudent: 20, Aushilfe: 15,
};
export type Feld = "vorname" | "nachname" | "name" | "email" | "telefon" | "station" | "beschaeftigung" | "stundenWoche" | "stundenlohn";
export type ImportZeile = {
    zeile: number;
    name: string;
    vorname: string;
    nachname: string;
    email: string;
    telefon: string;
    station: string;
    beschaeftigung: Beschaeftigung;
    stundenWoche: number;
    stundenlohn: number | null;
    hinweise: string[];
};
export type ImportErgebnis = {
    trenner: "\t" | ";" | "," | null;
    kopfzeileErkannt: boolean;
    spalten: (Feld | null)[];
    zeilen: ImportZeile[];
    uebersprungen: {
        zeile: number;
        text: string;
        grund: string;
    }[];
};
const KOPF_SYNONYME: {
    feld: Feld;
    woerter: string[];
}[] = [
    { feld: "vorname", woerter: ["vorname", "first name", "firstname", "given name", "rufname"] },
    { feld: "nachname", woerter: ["nachname", "last name", "lastname", "surname", "familienname", "zuname"] },
    { feld: "email", woerter: ["email", "e-mail", "e mail", "mail", "mailadresse", "e-mail-adresse"] },
    { feld: "telefon", woerter: ["telefon", "tel", "telefonnummer", "handy", "mobil", "mobile", "phone", "rufnummer"] },
    { feld: "station", woerter: ["station", "wohnbereich", "bereich", "abteilung", "einheit", "ward"] },
    { feld: "beschaeftigung", woerter: ["beschäftigung", "beschaeftigung", "beschäftigungsart", "vertrag", "vertragsart", "anstellung", "job", "jobtyp", "pensum"] },
    { feld: "stundenWoche", woerter: ["stunden", "wochenstunden", "std/woche", "std woche", "stunden/woche", "stunden pro woche", "wochenarbeitszeit", "soll", "sollstunden", "hours"] },
    { feld: "stundenlohn", woerter: ["stundenlohn", "lohn", "stundensatz", "satz", "euro", "€/h", "eur/h", "hourly"] },
];
const KOPF_NAME_KOMBI = ["name", "mitarbeiter", "mitarbeiterin", "beschäftigte", "beschaeftigte", "person", "pflegekraft"];
const BESCHAEFTIGUNG_SYNONYME: {
    art: Beschaeftigung;
    woerter: string[];
}[] = [
    { art: "Vollzeit", woerter: ["vollzeit", "vz", "full", "fulltime", "full-time", "100%", "100"] },
    { art: "Teilzeit", woerter: ["teilzeit", "tz", "part", "parttime", "part-time", "50%", "75%"] },
    { art: "Minijob", woerter: ["minijob", "mini", "geringfügig", "geringfuegig", "gfb", "520", "538", "556", "603", "633", "450"] },
    { art: "Werkstudent", woerter: ["werkstudent", "werkstudentin", "student", "studentin", "ws"] },
    { art: "Aushilfe", woerter: ["aushilfe", "springer", "aushilfskraft", "bedarf", "auf abruf"] },
];
function normal(s: string): string {
    return s.trim().toLowerCase().replace(/[.:#*_"']/g, "").replace(/\s+/g, " ").trim();
}
function trennerFinden(zeilen: string[]): "\t" | ";" | "," | null {
    const zaehle = (z: string, t: string) => z.split(t).length - 1;
    const summe = (t: string) => zeilen.reduce((n, z) => n + zaehle(z, t), 0);
    if (summe("\t") > 0)
        return "\t";
    if (summe(";") > 0)
        return ";";
    if (summe(",") >= zeilen.length)
        return ",";
    return null;
}
function istEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}
function istTelefon(s: string): boolean {
    const t = s.trim();
    if (!t)
        return false;
    if (!/^[+0-9()/\-\s.]+$/.test(t))
        return false;
    return (t.match(/\d/g) ?? []).length >= 6;
}
export function zahlLesen(s: string): number | null {
    const t = s.trim().replace(/[€\s]/g, "").replace(",", ".");
    if (!t)
        return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}
export function beschaeftigungLesen(s: string): Beschaeftigung | null {
    const n = normal(s);
    if (!n)
        return null;
    for (const { art, woerter } of BESCHAEFTIGUNG_SYNONYME) {
        if (woerter.some(w => n === w || n.includes(w)))
            return art;
    }
    return null;
}
export function nameZerlegen(roh: string): {
    vorname: string;
    nachname: string;
} {
    const s = roh.trim().replace(/\s+/g, " ");
    if (!s)
        return { vorname: "", nachname: "" };
    if (s.includes(",")) {
        const [hinten, vorne] = s.split(",", 2);
        return { vorname: (vorne ?? "").trim(), nachname: (hinten ?? "").trim() };
    }
    const teile = s.split(" ");
    if (teile.length === 1)
        return { vorname: "", nachname: teile[0] ?? "" };
    return { vorname: teile[0] ?? "", nachname: teile.slice(1).join(" ") };
}
function kopfZuordnen(zellen: string[]): {
    spalten: (Feld | null)[];
    treffer: number;
} {
    const spalten: (Feld | null)[] = [];
    let treffer = 0;
    for (const z of zellen) {
        const n = normal(z);
        let gefunden: Feld | null = null;
        for (const { feld, woerter } of KOPF_SYNONYME) {
            if (woerter.some(w => n === w)) {
                gefunden = feld;
                break;
            }
        }
        if (!gefunden && KOPF_NAME_KOMBI.includes(n))
            gefunden = "name";
        if (!gefunden) {
            for (const { feld, woerter } of KOPF_SYNONYME) {
                if (woerter.some(w => n.includes(w))) {
                    gefunden = feld;
                    break;
                }
            }
        }
        if (gefunden)
            treffer++;
        spalten.push(gefunden);
    }
    if (spalten.includes("vorname")) {
        for (let i = 0; i < spalten.length; i++)
            if (spalten[i] === "name")
                spalten[i] = "nachname";
    }
    return { spalten, treffer };
}
function inhaltZuordnen(zeilen: string[][]): (Feld | null)[] {
    const breite = Math.max(...zeilen.map(z => z.length));
    const spalten: (Feld | null)[] = new Array(breite).fill(null);
    const werte = (i: number) => zeilen.map(z => (z[i] ?? "").trim()).filter(Boolean);
    for (let i = 0; i < breite; i++) {
        const w = werte(i);
        if (w.length === 0)
            continue;
        const anteil = (f: (s: string) => boolean) => w.filter(f).length / w.length;
        if (anteil(istEmail) > 0.6) {
            spalten[i] = "email";
            continue;
        }
        if (anteil(istTelefon) > 0.6) {
            spalten[i] = "telefon";
            continue;
        }
        if (anteil(s => beschaeftigungLesen(s) !== null) > 0.6) {
            spalten[i] = "beschaeftigung";
            continue;
        }
        if (anteil(s => { const n = zahlLesen(s); return n !== null && n > 0 && n <= 60; }) > 0.6) {
            spalten[i] = "stundenWoche";
            continue;
        }
    }
    const frei = spalten.map((f, i) => (f === null ? i : -1)).filter(i => i >= 0 && werte(i).length > 0);
    const [a, b, c] = frei;
    if (a !== undefined && b !== undefined) {
        spalten[a] = "nachname";
        spalten[b] = "vorname";
        if (c !== undefined)
            spalten[c] = "station";
    }
    else if (a !== undefined) {
        spalten[a] = "name";
    }
    return spalten;
}
export function mitarbeiterListeLesen(text: string, vorgabe: {
    station?: string;
    beschaeftigung?: Beschaeftigung;
} = {}): ImportErgebnis {
    const rohzeilen = text.replace(/\r\n?/g, "\n").split("\n");
    const inhalt = rohzeilen.map((z, i) => ({ nr: i + 1, text: z })).filter(z => z.text.trim() !== "");
    const uebersprungen: ImportErgebnis["uebersprungen"] = [];
    if (inhalt.length === 0) {
        return { trenner: null, kopfzeileErkannt: false, spalten: [], zeilen: [], uebersprungen };
    }
    const trenner = trennerFinden(inhalt.map(z => z.text));
    const zerlegen = (z: string) => (trenner ? z.split(trenner) : [z]).map(c => c.trim().replace(/^"(.*)"$/, "$1"));
    const tabelle = inhalt.map(z => ({ nr: z.nr, zellen: zerlegen(z.text) }));
    const ersteZeile = tabelle[0] ?? { nr: 0, zellen: [] };
    const kopf = kopfZuordnen(ersteZeile.zellen);
    const kopfzeileErkannt = kopf.treffer >= 2;
    const daten = kopfzeileErkannt ? tabelle.slice(1) : tabelle;
    const spalten = kopfzeileErkannt ? kopf.spalten : inhaltZuordnen(daten.map(d => d.zellen));
    const zeilen: ImportZeile[] = [];
    for (const { nr, zellen } of daten) {
        const hol = (f: Feld): string => {
            const i = spalten.indexOf(f);
            return i >= 0 ? (zellen[i] ?? "").trim() : "";
        };
        const hinweise: string[] = [];
        let vorname = hol("vorname");
        let nachname = hol("nachname");
        const kombi = hol("name");
        if (!vorname && !nachname && kombi) {
            ({ vorname, nachname } = nameZerlegen(kombi));
        }
        else if (kombi && !nachname) {
            nachname = kombi;
        }
        if (!vorname && nachname.includes(",")) {
            ({ vorname, nachname } = nameZerlegen(nachname));
        }
        const name = [vorname, nachname].filter(Boolean).join(" ").trim();
        if (!name) {
            uebersprungen.push({ zeile: nr, text: zellen.join(" "), grund: "Kein Name erkennbar" });
            continue;
        }
        const email = hol("email");
        if (email && !istEmail(email))
            hinweise.push(`„${email}" sieht nicht wie eine E-Mail aus`);
        const beschRoh = hol("beschaeftigung");
        let beschaeftigung = beschaeftigungLesen(beschRoh);
        if (beschRoh && !beschaeftigung)
            hinweise.push(`Beschäftigung „${beschRoh}" nicht erkannt`);
        if (!beschaeftigung)
            beschaeftigung = vorgabe.beschaeftigung ?? "Vollzeit";
        let stundenWoche = zahlLesen(hol("stundenWoche"));
        if (stundenWoche !== null && stundenWoche > 60) {
            hinweise.push(`${stundenWoche} Stunden als Monatswert gelesen und auf die Woche gerechnet`);
            stundenWoche = Math.round((stundenWoche / 4.33) * 10) / 10;
        }
        if (stundenWoche === null || stundenWoche <= 0)
            stundenWoche = STUNDEN_VORGABE[beschaeftigung];
        zeilen.push({
            zeile: nr,
            name, vorname, nachname,
            email: istEmail(email) ? email.toLowerCase() : "",
            telefon: hol("telefon"),
            station: hol("station") || vorgabe.station || "",
            beschaeftigung,
            stundenWoche,
            stundenlohn: zahlLesen(hol("stundenlohn")),
            hinweise,
        });
    }
    const gesehen = new Map<string, number>();
    for (const z of zeilen) {
        const schluessel = z.name.toLowerCase();
        const zuvor = gesehen.get(schluessel);
        if (zuvor !== undefined)
            z.hinweise.push(`Derselbe Name steht schon in Zeile ${zuvor}`);
        else
            gesehen.set(schluessel, z.zeile);
    }
    return { trenner, kopfzeileErkannt, spalten, zeilen, uebersprungen };
}
