import { isGermanHoliday } from "@/lib/holidays";
import { MIN_REST_HOURS_ARBZG, MIN_REST_HOURS_VERKUERZT_ARBZG, RUHEZEIT_AUSGLEICH_HOURS_ARBZG, DAILY_AVERAGE_HOURS_ARBZG, MAX_HOURS_PER_SHIFT_ARBZG } from "@/lib/legal-limits";
export const RUHEZEIT_REGEL_STUNDEN = MIN_REST_HOURS_ARBZG;
export const RUHEZEIT_VERKUERZT_STUNDEN = MIN_REST_HOURS_VERKUERZT_ARBZG;
export const RUHEZEIT_AUSGLEICH_STUNDEN = RUHEZEIT_AUSGLEICH_HOURS_ARBZG;
export const TAGESARBEITSZEIT_SCHNITT_STUNDEN = DAILY_AVERAGE_HOURS_ARBZG;
export const TAGESARBEITSZEIT_MAX_STUNDEN = MAX_HOURS_PER_SHIFT_ARBZG;
export const SONNTAGSFREIE_SONNTAGE_PRO_JAHR = 15;
export const ERSATZRUHETAG_SONNTAG_TAGE = 14;
export const ERSATZRUHETAG_FEIERTAG_TAGE = 56;
const FENSTER_FUER_SCHNITT_TAGE = 24 * 7;
const FENSTER_FUER_SONNTAGE_TAGE = 300;
export type ArbzgRegel = "ruhezeit-ausgleich" | "tagesarbeitszeit-schnitt" | "nachtarbeitszeit" | "ersatzruhetag" | "sonntagsfreie-sonntage";
export type ArbzgBefund = {
    regel: ArbzgRegel;
    schwere: "blocker" | "warnung" | "hinweis";
    norm: string;
    person: string;
    datum?: string;
    text: string;
};
export type SchichtEintrag = {
    id: string;
    date: string;
    shift_type: string;
    start_time: string | null | undefined;
    end_time: string | null | undefined;
};
const STANDARDZEITEN: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
type Zeitraum = {
    beginn: Date;
    ende: Date;
    stunden: number;
};
function zeitraum(schicht: SchichtEintrag): Zeitraum | null {
    const standard = STANDARDZEITEN[schicht.shift_type] ?? STANDARDZEITEN.frueh;
    const von = schicht.start_time || standard.start;
    const bis = schicht.end_time || standard.end;
    const [jahr, monat, tag] = schicht.date.split("-").map(Number);
    if (!jahr || !monat || !tag)
        return null;
    const [vonH, vonM] = von.split(":").map(Number);
    const [bisH, bisM] = bis.split(":").map(Number);
    if ([vonH, vonM, bisH, bisM].some(n => !Number.isFinite(n)))
        return null;
    const beginn = new Date(jahr, monat - 1, tag, vonH, vonM);
    const ende = new Date(jahr, monat - 1, tag, bisH, bisM);
    if (ende.getTime() <= beginn.getTime())
        ende.setDate(ende.getDate() + 1);
    return { beginn, ende, stunden: (ende.getTime() - beginn.getTime()) / 3600000 };
}
const monatsSchluessel = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const alsTag = (iso: string) => {
    const [j, m, t] = iso.split("-");
    return `${t}.${m}.${j}`;
};
const rund = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
const tagVon = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function pruefeWeitereArbeitszeit(schichten: SchichtEintrag[], zuteilungen: Record<string, string[]>): ArbzgBefund[] {
    const nachId = new Map(schichten.map(s => [s.id, s]));
    type Eintrag = {
        schicht: SchichtEintrag;
        zeit: Zeitraum;
    };
    const jePerson = new Map<string, Eintrag[]>();
    for (const [schichtId, namen] of Object.entries(zuteilungen)) {
        const schicht = nachId.get(schichtId);
        if (!schicht)
            continue;
        const zeit = zeitraum(schicht);
        if (!zeit)
            continue;
        for (const name of namen) {
            if (!jePerson.has(name))
                jePerson.set(name, []);
            jePerson.get(name)!.push({ schicht, zeit });
        }
    }
    const alleTage = schichten.map(s => s.date).filter(Boolean).sort();
    const fensterTage = alleTage.length
        ? Math.round((new Date(alleTage[alleTage.length - 1]).getTime() - new Date(alleTage[0]).getTime()) / 86400000) + 1
        : 0;
    const befunde: ArbzgBefund[] = [];
    for (const [person, eintraege] of jePerson) {
        eintraege.sort((a, b) => a.zeit.beginn.getTime() - b.zeit.beginn.getTime());
        pruefeRuhezeitAusgleich(person, eintraege, befunde);
        pruefeTagesarbeitszeit(person, eintraege, fensterTage, befunde);
        pruefeNachtarbeitszeit(person, eintraege, befunde);
        pruefeErsatzruhetage(person, eintraege, befunde);
        pruefeSonntage(person, eintraege, fensterTage, befunde);
    }
    return befunde;
    function pruefeRuhezeitAusgleich(person: string, eintraege: Eintrag[], aus: ArbzgBefund[]) {
        const verkuerzungen: {
            monat: string;
            datum: string;
            stunden: number;
        }[] = [];
        const ausgleiche = new Map<string, number>();
        for (let i = 0; i < eintraege.length - 1; i++) {
            const ende = eintraege[i].zeit.ende;
            const start = eintraege[i + 1].zeit.beginn;
            const ruhe = (start.getTime() - ende.getTime()) / 3600000;
            if (ruhe <= 0)
                continue;
            const monat = monatsSchluessel(ende);
            if (ruhe < RUHEZEIT_REGEL_STUNDEN) {
                verkuerzungen.push({ monat, datum: tagVon(ende), stunden: ruhe });
            }
            else if (ruhe >= RUHEZEIT_AUSGLEICH_STUNDEN) {
                ausgleiche.set(monat, (ausgleiche.get(monat) ?? 0) + 1);
            }
        }
        const jeMonat = new Map<string, typeof verkuerzungen>();
        for (const v of verkuerzungen) {
            if (!jeMonat.has(v.monat))
                jeMonat.set(v.monat, []);
            jeMonat.get(v.monat)!.push(v);
        }
        for (const [monat, liste] of jeMonat) {
            const vorhanden = ausgleiche.get(monat) ?? 0;
            const offen = liste.length - vorhanden;
            if (offen <= 0)
                continue;
            const unterZehn = liste.filter(v => v.stunden < RUHEZEIT_VERKUERZT_STUNDEN);
            for (const v of unterZehn) {
                aus.push({
                    regel: "ruhezeit-ausgleich",
                    schwere: "blocker",
                    norm: "§ 5 Abs. 1 ArbZG",
                    person,
                    datum: v.datum,
                    text: `${person}: nur ${rund(v.stunden)} Stunden Ruhezeit nach dem Dienst am ${alsTag(v.datum)}. Auch die Ausnahme für Krankenhäuser und Pflegeeinrichtungen lässt nicht weniger als ${RUHEZEIT_VERKUERZT_STUNDEN} Stunden zu.`,
                });
            }
            const offenNachBlockern = offen - unterZehn.length;
            if (offenNachBlockern > 0) {
                aus.push({
                    regel: "ruhezeit-ausgleich",
                    schwere: "warnung",
                    norm: "§ 5 Abs. 2 ArbZG",
                    person,
                    datum: liste[0].datum,
                    text: `${person}: ${liste.length} verkürzte Ruhezeit(en) im Monat ${monat}, aber nur ${vorhanden} Ruhezeit(en) von mindestens ${RUHEZEIT_AUSGLEICH_STUNDEN} Stunden zum Ausgleich. Jede Verkürzung muss innerhalb des Kalendermonats oder von vier Wochen einzeln ausgeglichen werden — es fehlen ${offenNachBlockern}.`,
                });
            }
        }
    }
    function pruefeTagesarbeitszeit(person: string, eintraege: Eintrag[], fenster: number, aus: ArbzgBefund[]) {
        for (const e of eintraege) {
            if (e.zeit.stunden > TAGESARBEITSZEIT_MAX_STUNDEN) {
                aus.push({
                    regel: "tagesarbeitszeit-schnitt",
                    schwere: "blocker",
                    norm: "§ 3 ArbZG",
                    person,
                    datum: e.schicht.date,
                    text: `${person}: ${rund(e.zeit.stunden)} Stunden am ${alsTag(e.schicht.date)}. Mehr als ${TAGESARBEITSZEIT_MAX_STUNDEN} Stunden werktäglich lässt das Gesetz nicht zu.`,
                });
            }
        }
        const gesamt = eintraege.reduce((s, e) => s + e.zeit.stunden, 0);
        const tage = new Set(eintraege.map(e => e.schicht.date)).size;
        if (tage === 0)
            return;
        const schnitt = gesamt / tage;
        if (schnitt <= TAGESARBEITSZEIT_SCHNITT_STUNDEN)
            return;
        const zuKurz = fenster < FENSTER_FUER_SCHNITT_TAGE;
        aus.push({
            regel: "tagesarbeitszeit-schnitt",
            schwere: zuKurz ? "hinweis" : "blocker",
            norm: "§ 3 ArbZG",
            person,
            text: zuKurz
                ? `${person}: im geladenen Zeitraum (${fenster} Tage) im Schnitt ${rund(schnitt)} Stunden je Arbeitstag. Maßgeblich sind sechs Kalendermonate oder 24 Wochen — über dieses Fenster lässt sich das nicht abschließend beurteilen, es ist nur ein Anlass hinzusehen.`
                : `${person}: im Schnitt ${rund(schnitt)} Stunden je Arbeitstag über ${fenster} Tage. Über sechs Kalendermonate oder 24 Wochen dürfen acht Stunden werktäglich nicht überschritten werden.`,
        });
    }
    function pruefeNachtarbeitszeit(person: string, eintraege: Eintrag[], aus: ArbzgBefund[]) {
        const naechte = eintraege.filter(e => e.schicht.shift_type === "nacht");
        if (naechte.length === 0)
            return;
        for (const e of naechte) {
            if (e.zeit.stunden > TAGESARBEITSZEIT_MAX_STUNDEN) {
                aus.push({
                    regel: "nachtarbeitszeit",
                    schwere: "blocker",
                    norm: "§ 6 Abs. 2 ArbZG",
                    person,
                    datum: e.schicht.date,
                    text: `${person}: Nachtdienst von ${rund(e.zeit.stunden)} Stunden am ${alsTag(e.schicht.date)}. Nachtarbeitszeit darf ${TAGESARBEITSZEIT_MAX_STUNDEN} Stunden auch im Ausgleich nicht überschreiten.`,
                });
            }
        }
        const jeMonat = new Map<string, {
            stunden: number;
            tage: Set<string>;
            hatNacht: boolean;
        }>();
        for (const e of eintraege) {
            const m = monatsSchluessel(e.zeit.beginn);
            if (!jeMonat.has(m))
                jeMonat.set(m, { stunden: 0, tage: new Set(), hatNacht: false });
            const eintrag = jeMonat.get(m)!;
            eintrag.stunden += e.zeit.stunden;
            eintrag.tage.add(e.schicht.date);
            if (e.schicht.shift_type === "nacht")
                eintrag.hatNacht = true;
        }
        for (const [monat, m] of jeMonat) {
            if (!m.hatNacht || m.tage.size === 0)
                continue;
            const schnitt = m.stunden / m.tage.size;
            if (schnitt <= TAGESARBEITSZEIT_SCHNITT_STUNDEN)
                continue;
            aus.push({
                regel: "nachtarbeitszeit",
                schwere: "warnung",
                norm: "§ 6 Abs. 2 ArbZG",
                person,
                text: `${person}: Nachtarbeit im Monat ${monat} bei einem Schnitt von ${rund(schnitt)} Stunden je Arbeitstag. Für Nachtarbeitnehmer sind acht Stunden im Schnitt des Kalendermonats oder von vier Wochen die Grenze.`,
            });
        }
    }
    function pruefeErsatzruhetage(person: string, eintraege: Eintrag[], aus: ArbzgBefund[]) {
        const arbeitstage = new Set(eintraege.map(e => e.schicht.date));
        for (const e of eintraege)
            arbeitstage.add(tagVon(e.zeit.ende));
        const freierTagInnerhalb = (ab: string, tage: number): boolean => {
            const [j, m, t] = ab.split("-").map(Number);
            for (let i = 1; i <= tage; i++) {
                const d = new Date(j, m - 1, t + i);
                if (!arbeitstage.has(tagVon(d)))
                    return true;
            }
            return false;
        };
        const gesehen = new Set<string>();
        for (const e of eintraege) {
            const datum = e.schicht.date;
            if (gesehen.has(datum))
                continue;
            gesehen.add(datum);
            const wochentag = new Date(`${datum}T12:00:00Z`).getUTCDay();
            const feiertag = isGermanHoliday(datum);
            if (wochentag !== 0 && !feiertag)
                continue;
            const frist = feiertag ? ERSATZRUHETAG_FEIERTAG_TAGE : ERSATZRUHETAG_SONNTAG_TAGE;
            const letzterTag = eintraege[eintraege.length - 1].schicht.date;
            const [lj, lm, lt] = letzterTag.split("-").map(Number);
            const [dj, dm, dt] = datum.split("-").map(Number);
            const restTage = Math.round((new Date(lj, lm - 1, lt).getTime() - new Date(dj, dm - 1, dt).getTime()) / 86400000);
            if (freierTagInnerhalb(datum, Math.min(frist, Math.max(0, restTage))))
                continue;
            const reichtDasFenster = restTage >= frist;
            aus.push({
                regel: "ersatzruhetag",
                schwere: reichtDasFenster ? "blocker" : "hinweis",
                norm: "§ 11 Abs. 3 ArbZG",
                person,
                datum,
                text: reichtDasFenster
                    ? `${person}: Dienst am ${feiertag ? "Feiertag" : "Sonntag"} ${alsTag(datum)} ohne Ersatzruhetag innerhalb von ${feiertag ? "acht Wochen" : "zwei Wochen"}.`
                    : `${person}: Dienst am ${feiertag ? "Feiertag" : "Sonntag"} ${alsTag(datum)}. Der Ersatzruhetag muss innerhalb von ${feiertag ? "acht Wochen" : "zwei Wochen"} folgen — der geladene Zeitraum reicht nicht so weit, das ist hier nicht zu entscheiden.`,
            });
        }
    }
    function pruefeSonntage(person: string, eintraege: Eintrag[], fenster: number, aus: ArbzgBefund[]) {
        if (fenster < FENSTER_FUER_SONNTAGE_TAGE)
            return;
        const sonntageGearbeitet = new Set(eintraege
            .map(e => e.schicht.date)
            .filter(d => new Date(`${d}T12:00:00Z`).getUTCDay() === 0));
        const alle = eintraege.map(e => e.schicht.date).sort();
        const [vj, vm, vt] = alle[0].split("-").map(Number);
        const [bj, bm, bt] = alle[alle.length - 1].split("-").map(Number);
        let sonntageGesamt = 0;
        for (let d = new Date(vj, vm - 1, vt); d <= new Date(bj, bm - 1, bt); d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0)
                sonntageGesamt++;
        }
        const frei = sonntageGesamt - sonntageGearbeitet.size;
        if (frei >= SONNTAGSFREIE_SONNTAGE_PRO_JAHR)
            return;
        aus.push({
            regel: "sonntagsfreie-sonntage",
            schwere: "blocker",
            norm: "§ 11 Abs. 1 ArbZG",
            person,
            text: `${person}: nur ${frei} von ${sonntageGesamt} Sonntagen im geladenen Zeitraum frei. Mindestens ${SONNTAGSFREIE_SONNTAGE_PRO_JAHR} Sonntage im Jahr müssen beschäftigungsfrei bleiben.`,
        });
    }
}
