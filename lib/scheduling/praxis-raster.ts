import { deriveShiftType, type Demand } from "@/lib/scheduling/shift-demand";
import { berufeFuer } from "@/lib/berufe";
import { addDaysISO, berlinTodayISO } from "@/lib/date";
export type Schichtart = "frueh" | "spaet" | "nacht";
export const SCHICHTARTEN: Schichtart[] = ["frueh", "spaet", "nacht"];
export type ClosedSlots = Partial<Record<string, string[]>>;
export const WOCHENTAGE: {
    kuerzel: string;
    name: string;
    dow: number;
}[] = [
    { kuerzel: "mo", name: "Montag", dow: 1 },
    { kuerzel: "di", name: "Dienstag", dow: 2 },
    { kuerzel: "mi", name: "Mittwoch", dow: 3 },
    { kuerzel: "do", name: "Donnerstag", dow: 4 },
    { kuerzel: "fr", name: "Freitag", dow: 5 },
    { kuerzel: "sa", name: "Samstag", dow: 6 },
    { kuerzel: "so", name: "Sonntag", dow: 0 },
];
export function wochentagVon(dateISO: string): number {
    const [y, m, d] = dateISO.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}
export function istGeschlossen(closed: ClosedSlots | null | undefined, dateISO: string, shiftType: string): boolean {
    if (!closed)
        return false;
    const liste = closed[String(wochentagVon(dateISO))];
    return Array.isArray(liste) && liste.includes(shiftType);
}
export function ersatzSchwelle(planned: number, minimum: number | null | undefined): number {
    if (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 0)
        return planned;
    return Math.min(planned, Math.floor(minimum));
}
export function mindestbesetzungFuer(min: Demand | null | undefined, einheit: string | null, shiftType: string | null): number | null {
    if (!min || !einheit || !shiftType)
        return null;
    const n = min[einheit]?.[shiftType];
    return typeof n === "number" && n >= 0 ? n : null;
}
export function leseClosedSlots(raw: unknown): ClosedSlots | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const out: ClosedSlots = {};
    for (const [tag, arten] of Object.entries(raw as Record<string, unknown>)) {
        if (!/^[0-6]$/.test(tag) || !Array.isArray(arten))
            continue;
        const gueltig = arten.filter((a): a is Schichtart => SCHICHTARTEN.includes(a as Schichtart));
        if (gueltig.length)
            out[tag] = [...new Set(gueltig)];
    }
    return Object.keys(out).length ? out : null;
}
export function leseReplacementMin(raw: unknown): Demand | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const out: Demand = {};
    for (const [einheit, arten] of Object.entries(raw as Record<string, unknown>)) {
        if (!einheit || !arten || typeof arten !== "object" || Array.isArray(arten))
            continue;
        for (const [art, n] of Object.entries(arten as Record<string, unknown>)) {
            if (!SCHICHTARTEN.includes(art as Schichtart) || typeof n !== "number" || !Number.isFinite(n) || n < 0)
                continue;
            (out[einheit] ??= {})[art] = Math.floor(n);
        }
    }
    return Object.keys(out).length ? out : null;
}
export type TagesZeiten = Partial<Record<string, Partial<Record<Schichtart, {
    start: string;
    end: string;
}>>>>;
export function leseTagesZeiten(raw: unknown): TagesZeiten | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const out: TagesZeiten = {};
    for (const [tag, arten] of Object.entries(raw as Record<string, unknown>)) {
        if (!/^[0-6]$/.test(tag) || !arten || typeof arten !== "object" || Array.isArray(arten))
            continue;
        for (const [art, z] of Object.entries(arten as Record<string, unknown>)) {
            if (!SCHICHTARTEN.includes(art as Schichtart) || !z || typeof z !== "object")
                continue;
            const start = zeit((z as {
                start?: unknown;
            }).start);
            const end = zeit((z as {
                end?: unknown;
            }).end);
            if (start && end)
                (out[tag] ??= {})[art as Schichtart] = { start, end };
        }
    }
    return Object.keys(out).length ? out : null;
}
export function zeitFuerTag(tz: TagesZeiten | null | undefined, dateISO: string, shiftType: string): {
    start: string;
    end: string;
} | null {
    return tz?.[String(wochentagVon(dateISO))]?.[shiftType as Schichtart] ?? null;
}
export type Turnus = Partial<Record<string, Partial<Record<Schichtart, {
    alle: number;
    ab: string;
}>>>>;
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
export function leseTurnus(raw: unknown): Turnus | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const t = (raw as {
        turnus?: unknown;
    }).turnus;
    if (!t || typeof t !== "object" || Array.isArray(t))
        return null;
    const out: Turnus = {};
    for (const [tag, arten] of Object.entries(t as Record<string, unknown>)) {
        if (!/^[0-6]$/.test(tag) || !arten || typeof arten !== "object")
            continue;
        for (const [art, w] of Object.entries(arten as Record<string, unknown>)) {
            if (!SCHICHTARTEN.includes(art as Schichtart) || !w || typeof w !== "object")
                continue;
            const alle = Math.round(Number((w as {
                alle?: unknown;
            }).alle));
            const ab = (w as {
                ab?: unknown;
            }).ab;
            if (alle >= 2 && alle <= 4 && typeof ab === "string" && ISO_DATUM.test(ab))
                (out[tag] ??= {})[art as Schichtart] = { alle, ab };
        }
    }
    return Object.keys(out).length ? out : null;
}
function montagNummer(dateISO: string): number {
    const [y, m, d] = dateISO.split("-").map(Number);
    const tage = Math.round(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
    return tage - ((wochentagVon(dateISO) + 6) % 7);
}
export function findetStatt(turnus: Turnus | null | undefined, dateISO: string, shiftType: string): boolean {
    const t = turnus?.[String(wochentagVon(dateISO))]?.[shiftType as Schichtart];
    if (!t)
        return true;
    const wochen = Math.round((montagNummer(dateISO) - montagNummer(t.ab)) / 7);
    return ((wochen % t.alle) + t.alle) % t.alle === 0;
}
export function turnusStart(dow: number, startwoche: number, heute: string = berlinTodayISO()): string {
    const montag = addDaysISO(heute, -((wochentagVon(heute) + 6) % 7));
    return addDaysISO(montag, (dow + 6) % 7 + 7 * Math.max(0, startwoche - 1));
}
export function startwocheVon(t: {
    alle: number;
    ab: string;
}, heute: string = berlinTodayISO()): number {
    const wochen = Math.round((montagNummer(t.ab) - montagNummer(heute)) / 7);
    return ((wochen % t.alle) + t.alle) % t.alle + 1;
}
export function naechsterWochentag(dow: number, heute: string = berlinTodayISO()): string {
    return addDaysISO(heute, (dow - wochentagVon(heute) + 7) % 7);
}
export type Besetzung = {
    bedarf: number;
    aerzte: number;
    mindestens: number;
};
export type TagesBesetzung = Partial<Record<string, Partial<Record<Schichtart, Besetzung>>>>;
function besetzungAus(raw: unknown): Besetzung | null {
    if (!raw || typeof raw !== "object")
        return null;
    const r = raw as Record<string, unknown>;
    if (![r.bedarf, r.aerzte].some(v => typeof v === "number" || (typeof v === "string" && v !== "")))
        return null;
    const bedarf = ganzzahl(r.bedarf, MAX_BEDARF);
    const aerzte = ganzzahl(r.aerzte, MAX_BEDARF);
    const mindestens = r.mindestens == null || r.mindestens === "" ? bedarf : Math.min(bedarf, ganzzahl(r.mindestens, MAX_BEDARF));
    return { bedarf, aerzte, mindestens };
}
export function leseBesetzung(raw: unknown): TagesBesetzung | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const t = (raw as {
        besetzung?: unknown;
    }).besetzung;
    if (!t || typeof t !== "object" || Array.isArray(t))
        return null;
    const out: TagesBesetzung = {};
    for (const [tag, arten] of Object.entries(t as Record<string, unknown>)) {
        if (!/^[0-6]$/.test(tag) || !arten || typeof arten !== "object")
            continue;
        for (const [art, b] of Object.entries(arten as Record<string, unknown>)) {
            if (!SCHICHTARTEN.includes(art as Schichtart))
                continue;
            const g = besetzungAus(b);
            if (g)
                (out[tag] ??= {})[art as Schichtart] = g;
        }
    }
    return Object.keys(out).length ? out : null;
}
export function besetzungAmTag(tb: TagesBesetzung | null | undefined, dateISO: string, shiftType: string): Besetzung | null {
    return tb?.[String(wochentagVon(dateISO))]?.[shiftType as Schichtart] ?? null;
}
export function sollAmTag(tb: TagesBesetzung | null | undefined, dateISO: string, shiftType: string): number | null {
    const b = besetzungAmTag(tb, dateISO, shiftType);
    return b ? b.bedarf + b.aerzte : null;
}
export function ersatzAmTag(tb: TagesBesetzung | null | undefined, dateISO: string, shiftType: string): number | null {
    const b = besetzungAmTag(tb, dateISO, shiftType);
    return b ? Math.min(b.mindestens, b.bedarf) + b.aerzte : null;
}
export function besetzungBereinigt(tb: TagesBesetzung | null | undefined, schichten: {
    art: string;
    bedarf: number;
    mindestens?: number | null;
    aerzte?: number | null;
}[]): TagesBesetzung {
    const out: TagesBesetzung = {};
    for (const [tag, arten] of Object.entries(tb ?? {})) {
        if (!/^[0-6]$/.test(tag))
            continue;
        for (const [art, b] of Object.entries(arten ?? {})) {
            const s = schichten.find(x => x.art === art);
            const g = besetzungAus(b);
            if (!s || !g)
                continue;
            const gleich = g.bedarf === s.bedarf && g.aerzte === (s.aerzte ?? 0) && g.mindestens === Math.min(s.bedarf, s.mindestens ?? s.bedarf);
            if (!gleich)
                (out[tag] ??= {})[art as Schichtart] = g;
        }
    }
    return out;
}
export const AUSFALLQUOTE = 0.2;
export const VOLLZEIT_STUNDEN = 40;
export type Personalbedarf = {
    stundenRegulaer: number;
    stundenMinimum: number;
    vzMinimum: number;
    vzRegulaer: number;
    vzEmpfohlen: number;
    stundenAerzte: number;
    vzAerzte: number;
};
function dauerMinuten(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let d = (eh * 60 + em) - (sh * 60 + sm);
    if (d <= 0)
        d += 24 * 60;
    return d;
}
export function personalbedarf(v: {
    schichten: {
        start: string;
        end: string;
        art: string;
        bedarf: number;
        mindestens?: number | null;
        aerzte?: number | null;
    }[];
    geschlossen?: ClosedSlots | null;
    zeitenJeTag?: TagesZeiten | null;
    turnus?: Turnus | null;
    mittagspause?: Mittagspause | null;
    besetzungJeTag?: TagesBesetzung | null;
}): Personalbedarf {
    let regulaer = 0;
    let minimum = 0;
    let aerzte = 0;
    const zu = (dow: number, art: string) => (v.geschlossen?.[String(dow)] ?? []).includes(art);
    for (const wt of WOCHENTAGE) {
        for (const s of v.schichten) {
            if (zu(wt.dow, s.art))
                continue;
            const tag = v.zeitenJeTag?.[String(wt.dow)]?.[s.art as Schichtart];
            let z = tag ?? { start: s.start, end: s.end };
            if (!tag) {
                const andere = s.art === "frueh" ? "spaet" : s.art === "spaet" ? "frueh" : null;
                z = mitMittagspause(z, v.mittagspause, s.art, Boolean(andere && v.schichten.some(x => x.art === andere) && !zu(wt.dow, andere)));
            }
            const anteil = 1 / (v.turnus?.[String(wt.dow)]?.[s.art as Schichtart]?.alle ?? 1);
            const h = dauerMinuten(z.start, z.end) / 60 * anteil;
            const b = v.besetzungJeTag?.[String(wt.dow)]?.[s.art as Schichtart] ?? s;
            regulaer += h * Math.max(0, b.bedarf);
            minimum += h * Math.max(0, Math.min(b.bedarf, b.mindestens ?? b.bedarf));
            aerzte += h * Math.max(0, b.aerzte ?? 0);
        }
    }
    const halbe = (h: number) => Math.ceil((h / VOLLZEIT_STUNDEN) * 2) / 2;
    return {
        stundenRegulaer: Math.round(regulaer),
        stundenMinimum: Math.round(minimum),
        vzMinimum: halbe(minimum),
        vzRegulaer: halbe(regulaer),
        vzEmpfohlen: halbe(regulaer / (1 - AUSFALLQUOTE)),
        stundenAerzte: Math.round(aerzte),
        vzAerzte: halbe(aerzte),
    };
}
export type Mittagspause = {
    start: string;
    end: string;
};
export function leseMittagspause(raw: unknown): Mittagspause | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const m = (raw as {
        mittag?: unknown;
    }).mittag;
    if (!m || typeof m !== "object")
        return null;
    const start = zeit((m as {
        start?: unknown;
    }).start);
    const end = zeit((m as {
        end?: unknown;
    }).end);
    return start && end && start < end ? { start, end } : null;
}
export function mitMittagspause(zeiten: {
    start: string;
    end: string;
}, pause: Mittagspause | null | undefined, shiftType: string, andereOffen: boolean): {
    start: string;
    end: string;
} {
    if (!pause || !andereOffen)
        return zeiten;
    if (shiftType === "frueh" && zeiten.start < pause.start && zeiten.end > pause.start) {
        return { start: zeiten.start, end: pause.start };
    }
    if (shiftType === "spaet" && zeiten.end > pause.end) {
        return { start: pause.end, end: zeiten.end };
    }
    return zeiten;
}
export function andereHaelfteOffen(closed: ClosedSlots | null | undefined, dateISO: string, shiftType: string): boolean {
    if (shiftType !== "frueh" && shiftType !== "spaet")
        return false;
    return !istGeschlossen(closed, dateISO, shiftType === "frueh" ? "spaet" : "frueh");
}
export const BERUF_KUERZEL: Record<string, string> = {
    mfa: "Medizinische Fachangestellte (MFA)",
    zfa: "Zahnmedizinische Fachangestellte (ZFA)",
    azubi: "Auszubildende MFA/ZFA",
    arzt: "Praxisärztin / Praxisarzt",
    weiterbildung: "Weiterbildungsassistenz (ärztlich)",
    sonstige: "Medizinische Fachangestellte (MFA)",
};
export type RasterModellAntwort = {
    schichten: {
        name: string;
        start: string;
        ende: string;
        bedarf: number;
        mindestens: number;
        aerzte?: number;
    }[];
    wochenplan: {
        tag: string;
        schichten?: {
            name: string;
            start: string;
            ende: string;
            jedeWoche?: number;
            startwoche?: number;
            aerzte?: number;
            bedarf?: number;
            mindestens?: number;
        }[];
        offen?: string[];
    }[];
    mitarbeitende?: {
        name: string;
        beruf: string;
        wochenstunden: number;
    }[];
    mittagspause?: {
        geschlossen: boolean;
        start: string;
        ende: string;
    };
    empfehlungen?: string[];
    rueckfragen: string[];
    annahmen: string[];
    hinweise: string[];
};
export type MitarbeiterVorschlag = {
    name: string;
    beruf: string;
    wochenstunden: number | null;
    vorausgewaehlt: boolean;
};
export type RasterVorschlag = {
    schichten: {
        name: string;
        start: string;
        end: string;
        art: Schichtart;
        bedarf: number;
        mindestens: number;
        aerzte: number;
    }[];
    geschlossen: ClosedSlots;
    zeitenJeTag: TagesZeiten;
    mittagspause?: Mittagspause;
    turnus?: Turnus;
    besetzungJeTag?: TagesBesetzung;
    empfehlungen?: string[];
    mitarbeitende: MitarbeiterVorschlag[];
    rueckfragen: string[];
    annahmen: string[];
    hinweise: string[];
};
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BEDARF = 30;
const MAX_MITARBEITENDE = 60;
function zeit(s: unknown): string | null {
    if (typeof s !== "string")
        return null;
    const m = s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m)
        return null;
    const z = `${m[1].padStart(2, "0")}:${m[2]}`;
    return ZEIT.test(z) ? z : null;
}
function ganzzahl(n: unknown, max: number): number {
    const x = Math.round(Number(n));
    return Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : 0;
}
function texte(a: unknown, max: number): string[] {
    if (!Array.isArray(a))
        return [];
    return a.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map(s => s.trim().slice(0, 300)).slice(0, max);
}
const KEIN_NAME = /^(mo|di|mi|do|fr|sa|so|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|name|namen|mitarbeiter(in)?|summe|gesamt|frei|urlaub|krank|früh|spät|nacht|vormittag|nachmittag|empfang|labor|anmeldung)$/i;
function normalisiereMitarbeitende(raw: unknown): MitarbeiterVorschlag[] {
    if (!Array.isArray(raw))
        return [];
    const gesehen = new Set<string>();
    const out: MitarbeiterVorschlag[] = [];
    for (const m of raw) {
        const name = typeof m?.name === "string" ? m.name.trim().replace(/\s+/g, " ") : "";
        if (name.length < 2 || name.length > 60 || name.includes("[…") || !/\p{L}{2}/u.test(name) || KEIN_NAME.test(name))
            continue;
        const schluessel = name.toLowerCase();
        if (gesehen.has(schluessel))
            continue;
        gesehen.add(schluessel);
        const kuerzel = typeof m?.beruf === "string" ? m.beruf.trim().toLowerCase() : "";
        const beruf = BERUF_KUERZEL[kuerzel] ?? BERUF_KUERZEL.sonstige;
        const std = ganzzahl(m?.wochenstunden, 60);
        out.push({ name, beruf, wochenstunden: std > 0 ? std : null, vorausgewaehlt: true });
        if (out.length >= MAX_MITARBEITENDE)
            break;
    }
    return out;
}
export function normalisiereRasterVorschlag(raw: unknown, heute: string = berlinTodayISO()): RasterVorschlag {
    const a = (raw && typeof raw === "object" ? raw : {}) as Partial<RasterModellAntwort>;
    const hinweise = texte(a.hinweise, 6);
    const schichten: RasterVorschlag["schichten"] = [];
    const nameZuArt = new Map<string, Schichtart>();
    for (const s of Array.isArray(a.schichten) ? a.schichten : []) {
        const start = zeit(s?.start);
        const end = zeit(s?.ende);
        const name = typeof s?.name === "string" ? s.name.trim().slice(0, 40) : "";
        if (!start || !end || !name)
            continue;
        const art = deriveShiftType(start, end) as Schichtart;
        const schonDa = schichten.find(x => x.art === art);
        if (schonDa) {
            hinweise.push(`„${name}" beginnt im selben Zeitfenster wie „${schonDa.name}" und wurde nicht übernommen — der Plan kennt je Tag eine Früh-, eine Spät- und eine Nachtschicht.`);
            nameZuArt.set(name.toLowerCase(), art);
            continue;
        }
        const bedarf = ganzzahl(s?.bedarf, MAX_BEDARF);
        const mindestens = Math.min(bedarf, ganzzahl(s?.mindestens, MAX_BEDARF));
        const aerzte = ganzzahl(s?.aerzte, MAX_BEDARF);
        schichten.push({ name, start, end, art, bedarf, mindestens, aerzte });
        nameZuArt.set(name.toLowerCase(), art);
    }
    schichten.sort((x, y) => SCHICHTARTEN.indexOf(x.art) - SCHICHTARTEN.indexOf(y.art));
    const behalten = new Set(schichten.map(s => s.art));
    const geschlossen: ClosedSlots = {};
    const tagesZeit = new Map<string, Map<Schichtart, {
        start: string;
        end: string;
    } | null>>();
    const turnus: Turnus = {};
    const tagesZahlen: TagesBesetzung = {};
    const plan = Array.isArray(a.wochenplan) ? a.wochenplan : [];
    for (const wt of WOCHENTAGE) {
        const eintrag = plan.find(p => typeof p?.tag === "string" && p.tag.trim().toLowerCase().slice(0, 2) === wt.kuerzel);
        if (!eintrag)
            continue;
        const offen = new Map<Schichtart, {
            start: string;
            end: string;
        } | null>();
        const liste = Array.isArray(eintrag.schichten) ? eintrag.schichten : [];
        for (const s of liste) {
            const art = typeof s?.name === "string" ? nameZuArt.get(s.name.trim().toLowerCase()) : undefined;
            if (!art || !behalten.has(art) || offen.has(art))
                continue;
            const start = zeit(s?.start);
            const end = zeit(s?.ende);
            offen.set(art, start && end ? { start, end } : null);
            const zahlen = besetzungAus(s);
            if (zahlen)
                (tagesZahlen[String(wt.dow)] ??= {})[art] = zahlen;
            const alle = Math.round(Number(s?.jedeWoche));
            if (alle >= 2 && alle <= 4) {
                const sw = Math.round(Number(s?.startwoche));
                const startwoche = sw >= 1 && sw <= alle ? sw : 1;
                (turnus[String(wt.dow)] ??= {})[art] = { alle, ab: turnusStart(wt.dow, startwoche, heute) };
            }
        }
        for (const n of Array.isArray(eintrag.offen) ? eintrag.offen : []) {
            const art = typeof n === "string" ? nameZuArt.get(n.trim().toLowerCase()) : undefined;
            if (art && behalten.has(art) && !offen.has(art))
                offen.set(art, null);
        }
        tagesZeit.set(String(wt.dow), offen);
        const zu = schichten.map(s => s.art).filter(art => !offen.has(art));
        if (zu.length)
            geschlossen[String(wt.dow)] = zu;
    }
    const zeitenJeTag: TagesZeiten = {};
    for (const s of schichten) {
        const zaehler = new Map<string, number>();
        for (const offen of tagesZeit.values()) {
            const z = offen.get(s.art);
            if (z)
                zaehler.set(`${z.start}-${z.end}`, (zaehler.get(`${z.start}-${z.end}`) ?? 0) + 1);
        }
        const genannt = `${s.start}-${s.end}`;
        let bester = genannt;
        for (const [k, n] of zaehler) {
            if (n > (zaehler.get(bester) ?? 0) && deriveShiftType(k.split("-")[0], k.split("-")[1]) === s.art)
                bester = k;
        }
        [s.start, s.end] = bester.split("-");
        for (const [tag, offen] of tagesZeit) {
            const z = offen.get(s.art);
            if (z && (z.start !== s.start || z.end !== s.end))
                (zeitenJeTag[tag] ??= {})[s.art] = z;
        }
    }
    const mp = a.mittagspause;
    const pause = mp?.geschlossen ? leseMittagspause({ mittag: { start: mp.start, end: mp.ende } }) : null;
    const frueh = schichten.find(s => s.art === "frueh");
    const spaet = schichten.find(s => s.art === "spaet");
    const mitPause = Boolean(pause && frueh && spaet);
    if (pause && frueh && spaet) {
        frueh.end = mitMittagspause(frueh, pause, "frueh", true).end;
        for (const [tag, arten] of Object.entries(zeitenJeTag)) {
            if (!arten)
                continue;
            for (const s of [frueh, spaet]) {
                const z = arten[s.art];
                const erwartet = mitMittagspause({ start: s.start, end: s.end }, pause, s.art, true);
                if (z && z.start === erwartet.start && z.end === erwartet.end)
                    delete arten[s.art];
            }
            if (!Object.keys(arten).length)
                delete zeitenJeTag[tag];
        }
    }
    const besetzungJeTag = besetzungBereinigt(Object.fromEntries(Object.entries(tagesZahlen)
        .map(([tag, arten]) => [tag, Object.fromEntries(Object.entries(arten ?? {}).filter(([art]) => !(geschlossen[tag] ?? []).includes(art)))])), schichten);
    return {
        schichten,
        geschlossen,
        zeitenJeTag,
        ...(mitPause ? { mittagspause: pause! } : {}),
        ...(Object.keys(turnus).length ? { turnus } : {}),
        ...(Object.keys(besetzungJeTag).length ? { besetzungJeTag } : {}),
        mitarbeitende: normalisiereMitarbeitende(a.mitarbeitende),
        rueckfragen: texte(a.rueckfragen, 3),
        annahmen: texte(a.annahmen, 6),
        hinweise: hinweise.slice(0, 8),
        ...(texte(a.empfehlungen, 4).length ? { empfehlungen: texte(a.empfehlungen, 4) } : {}),
    };
}
export type MitarbeiterImport = {
    name: string;
    beruf: string;
    wochenstunden: number | null;
};
const PRAXIS_BERUFE = new Set(berufeFuer("praxis").flatMap(g => g.berufe));
export function leseMitarbeiterImport(raw: unknown): MitarbeiterImport[] {
    if (!Array.isArray(raw))
        return [];
    const gesehen = new Set<string>();
    const out: MitarbeiterImport[] = [];
    for (const m of raw) {
        const name = typeof m?.name === "string" ? m.name.trim().replace(/\s+/g, " ") : "";
        if (name.length < 2 || name.length > 60 || !/\p{L}/u.test(name) || name.includes("[…"))
            continue;
        if (gesehen.has(name.toLowerCase()))
            continue;
        gesehen.add(name.toLowerCase());
        const beruf = typeof m?.beruf === "string" && PRAXIS_BERUFE.has(m.beruf) ? m.beruf : BERUF_KUERZEL.mfa;
        const std = ganzzahl(m?.wochenstunden, 60);
        out.push({ name, beruf, wochenstunden: std > 0 ? std : null });
        if (out.length >= MAX_MITARBEITENDE)
            break;
    }
    return out;
}
export type PraxisRaster = Pick<RasterVorschlag, "schichten" | "geschlossen" | "zeitenJeTag" | "mittagspause" | "turnus" | "besetzungJeTag">;
export function rasterAusEinstellungen(eingabe: {
    vorlagen: {
        name: string;
        start_time: string | null;
        end_time: string | null;
    }[];
    einheit: string;
    shiftDemand?: unknown;
    doctorDemand?: unknown;
    replacementMin?: unknown;
    closedSlots?: unknown;
    dayShiftTimes?: unknown;
}): PraxisRaster {
    const soll = (eingabe.shiftDemand && typeof eingabe.shiftDemand === "object"
        ? (eingabe.shiftDemand as Record<string, Record<string, number>>)[eingabe.einheit] : undefined) ?? {};
    const aerzteSoll = leseReplacementMin(eingabe.doctorDemand)?.[eingabe.einheit] ?? {};
    const mindest = leseReplacementMin(eingabe.replacementMin)?.[eingabe.einheit] ?? {};
    const schichten: PraxisRaster["schichten"] = [];
    for (const v of eingabe.vorlagen) {
        const start = zeit(v.start_time);
        const end = zeit(v.end_time);
        if (!start || !end)
            continue;
        const art = deriveShiftType(start, end) as Schichtart;
        if (schichten.some(s => s.art === art))
            continue;
        const gesamt = ganzzahl(soll[art], MAX_BEDARF);
        const aerzte = Math.min(gesamt, ganzzahl(aerzteSoll[art], MAX_BEDARF));
        const bedarf = gesamt - aerzte;
        const m = typeof mindest[art] === "number" ? Math.max(0, Math.min(bedarf, mindest[art] - aerzte)) : bedarf;
        schichten.push({ name: v.name.slice(0, 40), start, end, art, bedarf, mindestens: m, aerzte });
    }
    schichten.sort((x, y) => SCHICHTARTEN.indexOf(x.art) - SCHICHTARTEN.indexOf(y.art));
    const pause = leseMittagspause(eingabe.dayShiftTimes);
    const turnus = leseTurnus(eingabe.dayShiftTimes);
    const besetzung = besetzungBereinigt(leseBesetzung(eingabe.dayShiftTimes), schichten);
    return {
        schichten,
        geschlossen: leseClosedSlots(eingabe.closedSlots) ?? {},
        zeitenJeTag: leseTagesZeiten(eingabe.dayShiftTimes) ?? {},
        ...(pause ? { mittagspause: pause } : {}),
        ...(turnus ? { turnus } : {}),
        ...(Object.keys(besetzung).length ? { besetzungJeTag: besetzung } : {}),
    };
}
export function einstellungenAusRaster(schichten: {
    art: string;
    bedarf: number;
    mindestens?: number | null;
    aerzte?: number | null;
}[]): {
    shiftDemand: Record<string, number>;
    doctorDemand: Record<string, number>;
    replacementMin: Record<string, number>;
} {
    const shiftDemand: Record<string, number> = {};
    const doctorDemand: Record<string, number> = {};
    const replacementMin: Record<string, number> = {};
    for (const s of schichten) {
        const team = ganzzahl(s.bedarf, MAX_BEDARF);
        const aerzte = ganzzahl(s.aerzte ?? 0, MAX_BEDARF);
        const min = Math.min(team, ganzzahl(s.mindestens ?? team, MAX_BEDARF));
        shiftDemand[s.art] = team + aerzte;
        doctorDemand[s.art] = aerzte;
        replacementMin[s.art] = min + aerzte;
    }
    return { shiftDemand, doctorDemand, replacementMin };
}
export function zeitAmWochentag(r: PraxisRaster, dow: number, art: Schichtart): {
    start: string;
    end: string;
} | null {
    const s = r.schichten.find(x => x.art === art);
    if (!s)
        return null;
    const tag = r.zeitenJeTag?.[String(dow)]?.[art];
    if (tag)
        return tag;
    const zu = (a: string) => (r.geschlossen?.[String(dow)] ?? []).includes(a);
    const andere = art === "frueh" ? "spaet" : art === "spaet" ? "frueh" : null;
    const andereOffen = Boolean(andere && r.schichten.some(x => x.art === andere) && !zu(andere));
    return mitMittagspause({ start: s.start, end: s.end }, r.mittagspause, art, andereOffen);
}
export function turnusBehalten(neu: Turnus | null | undefined, alt: Turnus | null | undefined): Turnus | undefined {
    if (!neu)
        return undefined;
    const eintraege = Object.entries(neu).flatMap(([tag, arten]) => Object.entries(arten ?? {}).flatMap(([art, t]) => (t ? [{ tag, art: art as Schichtart, t }] : [])));
    const verschiebung = new Map<number, number | null>();
    for (const { tag, art, t } of eintraege) {
        const vorher = alt?.[tag]?.[art];
        if (!vorher || vorher.alle !== t.alle)
            continue;
        const d = ((Math.round((montagNummer(vorher.ab) - montagNummer(t.ab)) / 7) % t.alle) + t.alle) % t.alle;
        const bisher = verschiebung.get(t.alle);
        verschiebung.set(t.alle, bisher === undefined || bisher === d ? d : null);
    }
    const out: Turnus = {};
    for (const { tag, art, t } of eintraege) {
        const d = verschiebung.get(t.alle);
        const vorher = alt?.[tag]?.[art];
        (out[tag] ??= {})[art] = d == null ? t
            : vorher && vorher.alle === t.alle ? vorher
                : { alle: t.alle, ab: addDaysISO(t.ab, 7 * d) };
    }
    return Object.keys(out).length ? out : undefined;
}
