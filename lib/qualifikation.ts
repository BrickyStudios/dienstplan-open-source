export const QUALIFIKATIONSSTUFEN = ["fachkraft", "hilfskraft_1j", "hilfskraft_ohne", "sonstige"] as const;
export type Qualifikationsstufe = (typeof QUALIFIKATIONSSTUFEN)[number];
export const STUFEN_LABEL: Record<Qualifikationsstufe, string> = {
    fachkraft: "Pflegefachkraft (examiniert)",
    hilfskraft_1j: "Pflegehilfskraft mit Ausbildung (1–2 Jahre)",
    hilfskraft_ohne: "Pflegehilfskraft ohne pflegerische Ausbildung",
    sonstige: "Nicht in der Pflege tätig",
};
export function istStufe(wert: unknown): wert is Qualifikationsstufe {
    return typeof wert === "string" && (QUALIFIKATIONSSTUFEN as readonly string[]).includes(wert);
}
const FACHKRAFT_MUSTER = [
    "pflegefachkraft", "pflegefachfrau", "pflegefachmann", "pflegefachperson",
    "examiniert", "exam.", "altenpfleger", "krankenpfleger", "krankenschwester",
    "gesundheits- und kinderkrankenpfleg", "gesundheits- und krankenpfleg",
    "pflegefach", "fachkraft", "stationsleitung", "wohnbereichsleitung",
    "pflegedienstleitung", "pdl", "pfk", "gkp", "gukp", "aps",
];
const HILFSKRAFT_1J_MUSTER = [
    "pflegeassistent", "pflegeassistenz", "krankenpflegehelfer", "altenpflegehelfer",
    "pflegehelfer mit", "einjährig", "einjaehrig", "zweijährig", "zweijaehrig",
    "gpa", "app",
];
const SONSTIGE_MUSTER = [
    "verwaltung", "hauswirtschaft", "küche", "kueche", "reinigung", "haustechnik",
    "arzt", "ärztin", "aerztin", "ärztlich", "aerztlich", "therapeut", "sozialdienst",
    "empfang", "fahrer", "praktikant", "fsj", "bufdi",
];
export function stufeAusRolle(role: string | null | undefined): Qualifikationsstufe {
    const r = (role ?? "").toLowerCase().trim();
    if (!r)
        return "sonstige";
    if (SONSTIGE_MUSTER.some(m => r.includes(m)))
        return "sonstige";
    if (HILFSKRAFT_1J_MUSTER.some(m => r.includes(m)))
        return "hilfskraft_1j";
    if (/pflegehilf|pflegehelfer|betreuungskraft|alltagsbegleit/.test(r))
        return "hilfskraft_ohne";
    if (FACHKRAFT_MUSTER.some(m => r.includes(m)))
        return "fachkraft";
    return "hilfskraft_ohne";
}
export type QualifikationsQuelle = "bestaetigt" | "gesetzt" | "abgeleitet";
export type Qualifikationsangabe = {
    stufe: Qualifikationsstufe;
    quelle: QualifikationsQuelle;
    belastbar: boolean;
};
export type PersonMitQualifikation = {
    role?: string | null;
    qualifikation?: string | null;
    qualifikation_bestaetigt?: boolean | null;
};
export function qualifikationVon(person: PersonMitQualifikation): Qualifikationsangabe {
    if (istStufe(person.qualifikation)) {
        const bestaetigt = person.qualifikation_bestaetigt === true;
        return {
            stufe: person.qualifikation,
            quelle: bestaetigt ? "bestaetigt" : "gesetzt",
            belastbar: bestaetigt,
        };
    }
    return { stufe: stufeAusRolle(person.role), quelle: "abgeleitet", belastbar: false };
}
export function istFachkraft(person: PersonMitQualifikation): boolean {
    return qualifikationVon(person).stufe === "fachkraft";
}
export function ungepruefteAngaben(personen: PersonMitQualifikation[]): number {
    return personen.filter(p => !qualifikationVon(p).belastbar).length;
}
