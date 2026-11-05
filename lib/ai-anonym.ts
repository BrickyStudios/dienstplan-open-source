import type { GuardFinding } from "@/lib/ai-guardrails";
import { ANREDEN, MONAT_DAVOR, MONATE, NAMENSGLEICH, NOMEN, WOERTER } from "@/lib/ai-wortliste";
export type AnonymStamm = {
    personen?: {
        id: string;
        name: string;
    }[];
    schichten?: {
        id: string;
        date?: string;
        shift_type?: string;
        station?: string;
    }[];
    stationen?: string[];
    qualifikationen?: string[];
    sondertage?: string[];
    einrichtung?: (string | null | undefined)[];
};
export type Ausgangsschranke = {
    verboten: {
        re: RegExp;
        art: string;
    }[];
};
export type Anonymisierung = {
    person(id: string): string;
    schicht(id: string): string;
    personKennt(id: string): boolean;
    schichtKennt(id: string): boolean;
    station(name: string): string;
    quali(name: string): string;
    sondertag(name: string): string;
    bekannt(text: string): string;
    freitext(text: string): string;
    dokument(text: string): string;
    zurueckText(text: string): string;
    zurueckAlles<T>(wert: T): T;
    personId(kuerzel: string): string | null;
    schichtId(kuerzel: string): string | null;
    stationName(kuerzel: string): string | null;
    schranke: Ausgangsschranke;
};
export class AusgangsschrankeError extends Error {
    constructor(readonly art: string) {
        super(`KI-Aufruf abgebrochen: Die Nachricht enthielt ${art}. Es wurde nichts gesendet.`);
        this.name = "AusgangsschrankeError";
    }
}
export function wortSchluessel(w: string): string {
    return w.toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}
const schluesselMenge = (s: Set<string>) => new Set([...s].map(wortSchluessel));
const NOMEN_K = schluesselMenge(NOMEN);
const WOERTER_K = schluesselMenge(WOERTER);
const NAMENSGLEICH_K = schluesselMenge(NAMENSGLEICH);
const ANREDEN_K = schluesselMenge(ANREDEN);
const MONATE_K = schluesselMenge(MONATE);
const MONAT_DAVOR_K = schluesselMenge(MONAT_DAVOR);
export function istAllgemeinesWort(w: string): boolean {
    const k = wortSchluessel(w);
    return NOMEN_K.has(k) || WOERTER_K.has(k);
}
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function wortMuster(v: string, flags: string): RegExp {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(v).replace(/ /g, "\\s+")}s?(?![\\p{L}\\p{N}])`, flags);
}
const KUERZEL = /(?<![\p{L}\p{N}])([PSQTD])(\d{2,4})(?![\p{L}\p{N}])/gu;
const GESCHWAERZT = /\[…(\d+)\]/g;
const SCHICHT_LABEL: Record<string, string> = { frueh: "Frühdienst", spaet: "Spätdienst", nacht: "Nachtdienst" };
const NIE_ALLEIN_ERSETZEN = new Set(["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag",
    "station", "dienst", "frueh", "spaet", "nacht", "team", "leitung"].map(wortSchluessel));
export function erstelleAnonymisierung(stamm: AnonymStamm): Anonymisierung {
    const codeZuKlartext = new Map<string, string>();
    const codeZuId = new Map<string, string>();
    const personCode = new Map<string, string>();
    const schichtCode = new Map<string, string>();
    const stationCode = new Map<string, string>();
    const qualiCode = new Map<string, string>();
    const sondertagCode = new Map<string, string>();
    const eindeutig = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null && x !== ""))];
    const sauber = (s: string) => s.trim().replace(/\s+/g, " ");
    const personen = (stamm.personen ?? []).filter(p => p.id && p.name?.trim());
    const schichten = (stamm.schichten ?? []).filter(s => s.id);
    const stationen = eindeutig([...(stamm.stationen ?? []), ...schichten.map(s => s.station)].map(s => s && sauber(s)));
    const qualis = eindeutig((stamm.qualifikationen ?? []).map(q => q && sauber(q)));
    const sondertage = eindeutig((stamm.sondertage ?? []).map(s => s && sauber(s)));
    const einrichtung = eindeutig((stamm.einrichtung ?? []).map(s => s && sauber(s)));
    const stellen = (n: number, min: number) => Math.max(min, String(n).length);
    const vergib = <K>(prefix: string, keys: K[], map: Map<K, string>, klartext: (k: K) => string, min = 2) => {
        const w = stellen(keys.length, min);
        keys.forEach((k, i) => {
            const code = `${prefix}${String(i + 1).padStart(w, "0")}`;
            map.set(k, code);
            codeZuKlartext.set(code, klartext(k));
        });
    };
    vergib("P", personen.map(p => p.id), personCode, id => sauber(personen.find(p => p.id === id)!.name));
    personen.forEach(p => codeZuId.set(personCode.get(p.id)!, p.id));
    vergib("D", schichten.map(s => s.id), schichtCode, id => {
        const s = schichten.find(x => x.id === id)!;
        const art = s.shift_type ? (SCHICHT_LABEL[s.shift_type] ?? s.shift_type) : "Schicht";
        const tag = s.date ? ` am ${s.date.slice(8, 10)}.${s.date.slice(5, 7)}.` : "";
        return s.station ? `${s.station}, ${art}${tag}` : `${art}${tag}`;
    }, 3);
    schichten.forEach(s => codeZuId.set(schichtCode.get(s.id)!, s.id));
    vergib("S", stationen, stationCode, s => s);
    vergib("Q", qualis, qualiCode, q => q);
    vergib("T", sondertage, sondertagCode, t => t);
    const varianten = new Map<string, {
        codes: Set<string>;
        monat: boolean;
        exakt: boolean;
    }>();
    const merke = (v: string, code: string) => {
        const t = sauber(v);
        if (t.length < 2)
            return;
        const k = wortSchluessel(t);
        if (NIE_ALLEIN_ERSETZEN.has(k))
            return;
        const exakt = t.length < 3 || (!t.includes(" ") && istAllgemeinesWort(t));
        const schluessel = exakt ? t : t.toLowerCase();
        const e = varianten.get(schluessel) ?? { codes: new Set<string>(), monat: MONATE_K.has(k), exakt };
        e.codes.add(code);
        varianten.set(schluessel, e);
    };
    for (const p of personen) {
        const code = personCode.get(p.id)!;
        const name = sauber(p.name);
        const teile = name.split(" ");
        merke(name, code);
        if (teile.length > 1) {
            merke(teile[0], code);
            merke(teile.slice(1).join(" "), code);
            merke(teile[teile.length - 1], code);
            for (const t of teile)
                if (t.includes("-"))
                    t.split("-").forEach(x => merke(x, code));
        }
    }
    const mitTeilen = (name: string, code: string) => {
        merke(name, code);
        for (const t of name.split(/[\s/,-]+/))
            if (t.length >= 4 && !istAllgemeinesWort(t))
                merke(t, code);
    };
    stationen.forEach(s => mitTeilen(s, stationCode.get(s)!));
    qualis.forEach(q => merke(q, qualiCode.get(q)!));
    sondertage.forEach(s => mitTeilen(s, sondertagCode.get(s)!));
    const einrichtungsMuster = einrichtung.flatMap(e => [
        { v: e, re: wortMuster(e, "giu") },
        ...e.split(/[\s/,-]+/).filter(t => t.length >= 4 && !istAllgemeinesWort(t)).map(t => ({ v: t, re: wortMuster(t, "giu") })),
    ]);
    const muster = [
        ...[...varianten.entries()].map(([v, e]) => ({
            v, re: wortMuster(v, e.exakt ? "gu" : "giu"), ersatz: [...e.codes].sort().join(" oder "), monat: e.monat,
        })),
        ...einrichtungsMuster.map(m => ({ ...m, ersatz: "[Einrichtung]", monat: false })),
    ].sort((a, b) => b.v.length - a.v.length || Number(b.ersatz === "[Einrichtung]") - Number(a.ersatz === "[Einrichtung]"));
    const bekannt = (text: string): string => {
        let out = text;
        for (const m of muster) {
            out = out.replace(m.re, (treffer, offset: number, ganz: string) => {
                if (m.monat && istDatumskontext(ganz, offset, treffer.length))
                    return treffer;
                return m.ersatz;
            });
        }
        return out;
    };
    const nrByStelle = new Map<string, number>();
    const stelleByNr = new Map<number, string>();
    const freitext = (text: string, einzelbuchstaben = false): string => {
        const vor = bekannt(text);
        const teile: {
            text: string;
            wort: boolean;
        }[] = [];
        let last = 0;
        for (const m of vor.matchAll(/[\p{L}\p{N}]+/gu)) {
            if (m.index! > last)
                teile.push({ text: vor.slice(last, m.index), wort: false });
            teile.push({ text: m[0], wort: true });
            last = m.index! + m[0].length;
        }
        if (last < vor.length)
            teile.push({ text: vor.slice(last), wort: false });
        let vorigesWort: string | null = null;
        const erlaubt = teile.map((t, i) => {
            if (!t.wort)
                return true;
            const davor = i > 0 && !teile[i - 1].wort ? teile[i - 1].text : "";
            const satzanfang = vorigesWort === null || /[.!?:;\n"„“»(]\s*$/.test(davor);
            const naechstes = teile.slice(i + 1).find(x => x.wort)?.text ?? null;
            const ok = wortErlaubt(t.text, { vorigesWort, satzanfang, naechstes, davor, codes: codeZuKlartext, einzelbuchstaben });
            vorigesWort = t.text;
            return ok;
        });
        const out: string[] = [];
        for (let i = 0; i < teile.length; i++) {
            if (erlaubt[i]) {
                out.push(teile[i].text);
                continue;
            }
            let stelle = teile[i].text;
            while (i + 2 < teile.length && !teile[i + 1].wort && /^[\s-]+$/.test(teile[i + 1].text) && !erlaubt[i + 2]) {
                stelle += teile[i + 1].text + teile[i + 2].text;
                i += 2;
            }
            const k = stelle.toLowerCase();
            if (!nrByStelle.has(k)) {
                const nr = nrByStelle.size + 1;
                nrByStelle.set(k, nr);
                stelleByNr.set(nr, stelle);
            }
            out.push(`[…${nrByStelle.get(k)}]`);
        }
        return out.join("");
    };
    const zurueckText = (text: string): string => {
        return text
            .replace(KUERZEL, (k: string) => codeZuKlartext.get(k) ?? k)
            .replace(GESCHWAERZT, (g: string, nr: string) => stelleByNr.get(Number(nr)) ?? g);
    };
    const zurueckAlles = <T,>(wert: T): T => {
        if (typeof wert === "string")
            return zurueckText(wert) as T;
        if (Array.isArray(wert))
            return wert.map(w => zurueckAlles(w)) as T;
        if (wert && typeof wert === "object") {
            return Object.fromEntries(Object.entries(wert as Record<string, unknown>).map(([k, v]) => [k, zurueckAlles(v)])) as T;
        }
        return wert;
    };
    const verboten: Ausgangsschranke["verboten"] = [];
    const nurAllgemein = (s: string) => s.split(/[\s/,-]+/).every(t => /^\d{1,4}$/.test(t) || t.length < 2 || istAllgemeinesWort(t));
    for (const p of personen) {
        const name = sauber(p.name);
        verboten.push({ re: wortMuster(name, "giu"), art: "einen Personennamen" });
        for (const t of name.split(/[\s-]+/)) {
            if (t.length < 3 || MONATE_K.has(wortSchluessel(t)) || NIE_ALLEIN_ERSETZEN.has(wortSchluessel(t)))
                continue;
            verboten.push({ re: wortMuster(t, istAllgemeinesWort(t) ? "gu" : "giu"), art: "einen Personennamen" });
        }
    }
    const mitTeilenVerboten = (namen: string[], art: string) => {
        for (const n of namen) {
            if (nurAllgemein(n))
                continue;
            verboten.push({ re: wortMuster(n, "giu"), art });
            for (const t of n.split(/[\s/,-]+/))
                if (t.length >= 4 && !istAllgemeinesWort(t))
                    verboten.push({ re: wortMuster(t, "giu"), art });
        }
    };
    mitTeilenVerboten(stationen, "einen Stationsnamen");
    mitTeilenVerboten(sondertage, "einen Sondertag-Namen");
    mitTeilenVerboten(qualis, "eine Qualifikationsbezeichnung");
    for (const { re } of einrichtungsMuster)
        verboten.push({ re, art: "den Namen oder Ort der Einrichtung" });
    const schranke: Ausgangsschranke = {
        get verboten() {
            const extra = [...stelleByNr.values()]
                .flatMap(stelle => stelle.split(/[\s-]+/))
                .filter(w => w.length >= 3 && !/\d/.test(w) && !istAllgemeinesWort(w) && !MONATE_K.has(wortSchluessel(w)))
                .map(w => ({ re: wortMuster(w, "gu"), art: "ein geschwärztes Wort aus dem Freitext" }));
            return [...verboten, ...extra];
        },
    };
    return {
        person: id => personCode.get(id) ?? "[Person]",
        schicht: id => schichtCode.get(id) ?? "[Schicht]",
        personKennt: id => personCode.has(id),
        schichtKennt: id => schichtCode.has(id),
        station: name => stationCode.get(sauber(name)) ?? freitext(name),
        quali: name => qualiCode.get(sauber(name)) ?? freitext(name),
        sondertag: name => sondertagCode.get(sauber(name)) ?? freitext(name),
        bekannt,
        freitext: text => freitext(text),
        dokument: text => freitext(text, true),
        zurueckText,
        zurueckAlles,
        personId: k => (k.startsWith("P") ? codeZuId.get(k.trim()) ?? null : null),
        schichtId: k => (k.startsWith("D") ? codeZuId.get(k.trim()) ?? null : null),
        stationName: k => (k.startsWith("S") ? codeZuKlartext.get(k.trim()) ?? null : null),
        schranke,
    };
}
function istDatumskontext(ganz: string, offset: number, laenge: number): boolean {
    const davor = ganz.slice(Math.max(0, offset - 24), offset);
    const danach = ganz.slice(offset + laenge, offset + laenge + 8);
    if (/\d\.?\s*$/.test(davor))
        return true;
    if (/^\s*\d{4}/.test(danach))
        return true;
    const vorwort = davor.match(/([\p{L}]+)\s*$/u)?.[1];
    return !!vorwort && MONAT_DAVOR_K.has(wortSchluessel(vorwort));
}
function wortErlaubt(w: string, ctx: {
    vorigesWort: string | null;
    satzanfang: boolean;
    naechstes: string | null;
    davor: string;
    codes: Map<string, string>;
    einzelbuchstaben?: boolean;
}): boolean {
    if (/^[PSQTD]\d{2,4}$/.test(w))
        return ctx.codes.has(w);
    if (/^\d+$/.test(w))
        return w.length <= 4 && !(w.startsWith("0") && w.length >= 3);
    if (/^\d{1,3}(h|x|std|min|uhr)$/i.test(w))
        return true;
    if (/\d/.test(w))
        return false;
    if (ctx.einzelbuchstaben && /^\p{L}$/u.test(w))
        return true;
    const k = wortSchluessel(w);
    const gross = w[0] !== w[0].toLowerCase();
    if (gross && ctx.vorigesWort && ANREDEN_K.has(wortSchluessel(ctx.vorigesWort)))
        return false;
    if (MONATE_K.has(k)) {
        const vorwort = ctx.vorigesWort ? wortSchluessel(ctx.vorigesWort) : null;
        return /\d\.?\s*$/.test(ctx.davor) || (!!vorwort && (MONAT_DAVOR_K.has(vorwort) || /^\d+$/.test(vorwort)))
            || (!!ctx.naechstes && /^\d{4}$/.test(ctx.naechstes));
    }
    if (NOMEN_K.has(k))
        return true;
    if (WOERTER_K.has(k)) {
        if (!gross)
            return true;
        return ctx.satzanfang && !NAMENSGLEICH_K.has(k);
    }
    return false;
}
export function pruefeAusgang(texte: string[], schranke: Ausgangsschranke): void {
    const allgemein: {
        re: RegExp;
        art: string;
    }[] = [
        { re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, art: "eine Datenbank-ID" },
        { re: /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i, art: "eine E-Mail-Adresse" },
        { re: /\d{5,}/, art: "eine lange Ziffernfolge (Telefon, Postleitzahl, Personalnummer)" },
    ];
    for (const text of texte) {
        for (const { re, art } of [...allgemein, ...schranke.verboten]) {
            re.lastIndex = 0;
            if (re.test(text))
                throw new AusgangsschrankeError(art);
        }
    }
}
const BEFUND_ERKLAERUNG: Record<GuardFinding["regel"], string> = {
    ruhezeit: "weniger als 11 Stunden Ruhezeit zwischen zwei Schichten",
    hoechstarbeitszeit_tag: "mehr als 10 Stunden Arbeitszeit an einem Tag",
    hoechstarbeitszeit_woche: "Wochenarbeitszeit überschritten (Vertragszeit oder 48 Stunden)",
    qualifikation: "geforderte Qualifikation der Schicht fehlt",
    verfuegbarkeit: "Person ist an diesem Tag abwesend",
    mindestbesetzung: "Besetzung der Schicht nicht plausibel (doppelt zugeteilt oder unterbesetzt)",
    vorgabe: "verstößt gegen eine Vorgabe aus der Anfrage",
    unbekannte_person: "Person oder Schicht gibt es in den Daten nicht",
};
export function befundeFuerModell(befunde: GuardFinding[], an: Anonymisierung, personKuerzel?: (staffId: string) => string | undefined): string {
    return befunde.map(f => {
        const wer = f.staffId
            ? (personKuerzel ? personKuerzel(f.staffId) ?? "unbekannt" : an.personKennt(f.staffId) ? an.person(f.staffId) : "unbekannt")
            : null;
        const wo = f.shiftId ? (an.schichtKennt(f.shiftId) ? an.schicht(f.shiftId) : "unbekannt") : null;
        return `- [${f.schwere.toUpperCase()} · ${f.norm}] ${BEFUND_ERKLAERUNG[f.regel] ?? f.regel}` +
            `${wer ? ` | staffId=${wer}` : ""}${wo ? ` | shiftId=${wo}` : ""}`;
    }).join("\n");
}
export type Besetzungsvorschlag = {
    zuteilungen: {
        shiftId: string;
        staffId: string;
        begruendung: string;
    }[];
    ausgeschlossen: {
        staffId: string;
        grund: string;
    }[];
    zusammenfassung: string;
};
export const BESETZUNGSVORSCHLAG_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
        zuteilungen: {
            type: "array",
            items: {
                type: "object",
                properties: { shiftId: { type: "string" }, staffId: { type: "string" }, begruendung: { type: "string" } },
                required: ["shiftId", "staffId", "begruendung"],
                additionalProperties: false,
            },
        },
        ausgeschlossen: {
            type: "array",
            items: {
                type: "object",
                properties: { staffId: { type: "string" }, grund: { type: "string" } },
                required: ["staffId", "grund"],
                additionalProperties: false,
            },
        },
        zusammenfassung: { type: "string" },
    },
    required: ["zuteilungen", "ausgeschlossen", "zusammenfassung"],
    additionalProperties: false,
};
export function zurueckVorschlag<V extends Besetzungsvorschlag>(v: V, an: Anonymisierung): V {
    return {
        ...v,
        zuteilungen: v.zuteilungen.map(z => ({
            ...z,
            shiftId: an.schichtId(z.shiftId) ?? z.shiftId,
            staffId: an.personId(z.staffId) ?? z.staffId,
            begruendung: an.zurueckText(z.begruendung),
        })),
        ausgeschlossen: v.ausgeschlossen.map(a => ({
            ...a,
            staffId: an.personId(a.staffId) ?? a.staffId,
            grund: an.zurueckText(a.grund),
        })),
        zusammenfassung: an.zurueckText(v.zusammenfassung),
    };
}
export const KUERZEL_HINWEIS = `Alle Personen, Schichten, Stationen, Qualifikationen und Sondertage stehen als Kürzel da ` +
    `(P01 Person, D001 Schicht, S01 Station, Q01 Qualifikation, T01 Sondertag). „[…1]" ist ein ` +
    `geschwärztes Wort aus dem Freitext, „[Einrichtung]" der Name der Einrichtung. Verwende genau ` +
    `diese Kürzel und Platzhalter, erfinde keine neuen und versuche nie, sie aufzulösen. ` +
    `In Begründungen und Zusammenfassungen nenne eine Schicht mit Schichtart und Datum, nicht mit ihrem D-Kürzel; ` +
    `das D-Kürzel gehört nur in das Feld shiftId.`;
