import type { ComplianceFramework } from "@/lib/plan";
export type Pflicht = {
    id: string;
    titel: string;
    vorschrift: string;
    empfaenger: string;
    takt: string;
    nurvoLiefert: string;
    fuer: ComplianceFramework[];
    termineImJahr: ((jahr: number) => {
        datum: string;
        zeitraum: string;
        export?: string;
    }[]) | null;
    hinweis?: string;
};
const pad = (n: number) => String(n).padStart(2, "0");
const letzterTag = (jahr: number, monat: number) => new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
function quartalstermine(jahr: number, tag: (jahr: number, monat: number) => number, art: "ppug" | "ppbv") {
    const liste: {
        datum: string;
        zeitraum: string;
        export?: string;
    }[] = [];
    const faelle: [
        number,
        number,
        number
    ][] = [
        [4, jahr - 1, 1],
        [1, jahr, 4],
        [2, jahr, 7],
        [3, jahr, 10],
    ];
    for (const [q, qJahr, monat] of faelle) {
        liste.push({
            datum: `${jahr}-${pad(monat)}-${pad(tag(jahr, monat))}`,
            zeitraum: `${q}. Quartal ${qJahr}`,
            export: art === "ppug"
                ? `/api/leitung/ppug-zulieferung?year=${qJahr}&quartal=${q}`
                : undefined,
        });
    }
    return liste;
}
export const PFLICHTEN: Pflicht[] = [
    {
        id: "ppug-quartal",
        titel: "PpUG-Nachweis, Quartal",
        vorschrift: "§ 137i SGB V, PpUGV",
        empfaenger: "InEK und die örtlichen Vertragsparteien nach § 11 KHEntgG",
        takt: "quartalsweise zum 15. des Folgemonats",
        nurvoLiefert: "Schichten mit Unterschreitung, Pflegekräfte je Schicht, Patientenbelegung aus der Stations-Zählung oder dem KIS, Betten und Standort aus den Stationsdaten. Es fehlen: Trennung Fachkraft/Hilfskraft, Hebammen, Belegungstage.",
        fuer: ["ppbv"],
        termineImJahr: (jahr) => quartalstermine(jahr, () => 15, "ppug"),
    },
    {
        id: "ppug-jahr",
        titel: "PpUG-Jahresmeldung",
        vorschrift: "§ 137i SGB V, PpUGV",
        empfaenger: "InEK, mit Testat einer Wirtschaftsprüferin",
        takt: "jährlich zum 30.06. für das Vorjahr",
        nurvoLiefert: "Die vier Quartalsdateien des Vorjahres als Grundlage. Das Testat kann nur die Prüferin erteilen.",
        fuer: ["ppbv"],
        termineImJahr: (jahr) => [{ datum: `${jahr}-06-30`, zeitraum: `Jahr ${jahr - 1}` }],
    },
    {
        id: "ppbv-quartal",
        titel: "PPBV-Meldung, Quartal",
        vorschrift: "§ 137k SGB V, PPBV",
        empfaenger: "InEK",
        takt: "quartalsweise bis zum Ende des Folgemonats",
        nurvoLiefert: "Soll aus der importierten Einstufung (Tagschicht), Ist aus dem Dienstplan. Es fehlen: geleistete Stunden je Qualifikation, Nachtschicht-Soll.",
        fuer: ["ppbv"],
        termineImJahr: (jahr) => quartalstermine(jahr, letzterTag, "ppbv"),
        hinweis: "Einführungsphase: keine Erfüllungsgrade und keine Sanktionen (BMG). Die Meldung selbst ist trotzdem Pflicht.",
    },
    {
        id: "ppbv-jahr",
        titel: "PPBV-Jahresmeldung",
        vorschrift: "§ 7 Abs. 3 PPBV",
        empfaenger: "InEK, bestätigt von einer Wirtschaftsprüferin",
        takt: "jährlich zum 30.06. für das Vorjahr",
        nurvoLiefert: "Die festgeschriebenen Monatsnachweise des Vorjahres.",
        fuer: ["ppbv"],
        termineImJahr: (jahr) => [{ datum: `${jahr}-06-30`, zeitraum: `Jahr ${jahr - 1}` }],
    },
    {
        id: "pebem",
        titel: "Personalnachweis nach § 113c SGB XI",
        vorschrift: "§ 113c SGB XI, Pflegesatzvereinbarung",
        empfaenger: "Pflegekassen bzw. Heimaufsicht",
        takt: "auf Verlangen, kein fester Termin",
        nurvoLiefert: "Soll/Ist je Station, Schichtart und Monat, festschreibbar, als CSV.",
        fuer: ["pebem"],
        termineImJahr: null,
        hinweis: "Dazu Landesrecht: Personalmindestbestand und Fachkraftquote, Aufsicht ist die Heimaufsicht.",
    },
];
export type Termin = {
    pflicht: Pflicht;
    datum: string;
    zeitraum: string;
    export?: string;
    tageBis: number;
};
function tageZwischen(von: string, bis: string): number {
    const a = Date.UTC(+von.slice(0, 4), +von.slice(5, 7) - 1, +von.slice(8, 10));
    const b = Date.UTC(+bis.slice(0, 4), +bis.slice(5, 7) - 1, +bis.slice(8, 10));
    return Math.round((b - a) / 86400000);
}
export function naechsteTermine(heute: string, framework: ComplianceFramework): Termin[] {
    const jahr = Number(heute.slice(0, 4));
    const ergebnis: Termin[] = [];
    for (const p of PFLICHTEN) {
        if (!p.fuer.includes(framework) || !p.termineImJahr)
            continue;
        const kandidaten = [...p.termineImJahr(jahr), ...p.termineImJahr(jahr + 1)]
            .filter((t) => t.datum >= heute)
            .sort((a, b) => a.datum.localeCompare(b.datum));
        const t = kandidaten[0];
        if (t)
            ergebnis.push({ pflicht: p, ...t, tageBis: tageZwischen(heute, t.datum) });
    }
    return ergebnis.sort((a, b) => a.datum.localeCompare(b.datum));
}
export function pflichtenOhneTermin(framework: ComplianceFramework): Pflicht[] {
    return PFLICHTEN.filter((p) => p.fuer.includes(framework) && !p.termineImJahr);
}
export const ERINNERN_TAGE_VORHER = [21, 7, 1] as const;
export function faelligeErinnerungen(heute: string, framework: ComplianceFramework): Termin[] {
    return naechsteTermine(heute, framework).filter((t) => (ERINNERN_TAGE_VORHER as readonly number[]).includes(t.tageBis));
}
export function datumDe(iso: string): string {
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}
