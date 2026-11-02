import type { Plan } from "@/lib/plan";
export type Berufsgruppe = "pflege" | "aerztlich" | "funktion" | "therapie" | "praxisteam" | "hauswirtschaft" | "verwaltung";
export const BERUFSGRUPPE_LABEL: Record<Berufsgruppe, string> = {
    pflege: "Pflege",
    aerztlich: "Ärztlicher Dienst",
    funktion: "Funktionsdienst",
    therapie: "Therapie und Sozialdienst",
    praxisteam: "Praxisteam",
    hauswirtschaft: "Reinigung und Hauswirtschaft",
    verwaltung: "Verwaltung und Technik",
};
type Beruf = {
    name: string;
    gruppe: Berufsgruppe;
    typen: Plan[];
    stationsdienst: boolean;
};
const K: Plan[] = ["klinik"];
const H: Plan[] = ["pflege"];
const P: Plan[] = ["praxis"];
const KH: Plan[] = ["klinik", "pflege"];
const ALLE: Plan[] = ["klinik", "pflege", "praxis"];
export const BERUFE: Beruf[] = [
    { name: "Pflegefachkraft", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Pflegekraft", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Pflegefachkraft Intensiv/Anästhesie", gruppe: "pflege", typen: K, stationsdienst: true },
    { name: "Pflegeassistenz", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Pflegehilfskraft", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Betreuungskraft", gruppe: "pflege", typen: H, stationsdienst: true },
    { name: "Auszubildende Pflege", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Praxisanleitung", gruppe: "pflege", typen: KH, stationsdienst: true },
    { name: "Hebamme / Entbindungspfleger", gruppe: "pflege", typen: K, stationsdienst: true },
    { name: "Stationsärztin / Stationsarzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Assistenzärztin / Assistenzarzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Fachärztin / Facharzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Oberärztin / Oberarzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Chefärztin / Chefarzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Notärztin / Notarzt", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Anästhesistin / Anästhesist", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "Dienstärztin / Dienstarzt (Bereitschaftsdienst)", gruppe: "aerztlich", typen: K, stationsdienst: false },
    { name: "OP-Pflege", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Operationstechnische Assistenz (OTA)", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Anästhesietechnische Assistenz (ATA)", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Medizinische Technologie Radiologie (MTR)", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Medizinische Technologie Labor (MTL)", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Notfallsanitäterin / Notfallsanitäter", gruppe: "funktion", typen: K, stationsdienst: false },
    { name: "Physiotherapie", gruppe: "therapie", typen: KH, stationsdienst: false },
    { name: "Ergotherapie", gruppe: "therapie", typen: KH, stationsdienst: false },
    { name: "Logopädie", gruppe: "therapie", typen: KH, stationsdienst: false },
    { name: "Sozialdienst", gruppe: "therapie", typen: KH, stationsdienst: false },
    { name: "Praxisärztin / Praxisarzt", gruppe: "praxisteam", typen: P, stationsdienst: true },
    { name: "Weiterbildungsassistenz (ärztlich)", gruppe: "praxisteam", typen: P, stationsdienst: true },
    { name: "Medizinische Fachangestellte (MFA)", gruppe: "praxisteam", typen: P, stationsdienst: true },
    { name: "Zahnmedizinische Fachangestellte (ZFA)", gruppe: "praxisteam", typen: P, stationsdienst: true },
    { name: "Auszubildende MFA/ZFA", gruppe: "praxisteam", typen: P, stationsdienst: true },
    { name: "Reinigungskraft", gruppe: "hauswirtschaft", typen: ALLE, stationsdienst: false },
    { name: "Hauswirtschaft", gruppe: "hauswirtschaft", typen: KH, stationsdienst: false },
    { name: "Küche", gruppe: "hauswirtschaft", typen: KH, stationsdienst: false },
    { name: "Hol- und Bringdienst", gruppe: "hauswirtschaft", typen: K, stationsdienst: false },
    { name: "Verwaltung", gruppe: "verwaltung", typen: ALLE, stationsdienst: false },
    { name: "Empfang / Pforte", gruppe: "verwaltung", typen: ALLE, stationsdienst: false },
    { name: "Haustechnik", gruppe: "verwaltung", typen: KH, stationsdienst: false },
];
export function standardBeruf(typ: Plan): string {
    return typ === "praxis" ? "Medizinische Fachangestellte (MFA)" : "Pflegekraft";
}
export function berufeFuer(typ: Plan): {
    gruppe: Berufsgruppe;
    label: string;
    berufe: string[];
}[] {
    const gruppen = Object.keys(BERUFSGRUPPE_LABEL) as Berufsgruppe[];
    return gruppen
        .map(g => ({
        gruppe: g,
        label: BERUFSGRUPPE_LABEL[g],
        berufe: BERUFE.filter(b => b.gruppe === g && b.typen.includes(typ)).map(b => b.name),
    }))
        .filter(g => g.berufe.length > 0);
}
const NACH_NAME = new Map(BERUFE.map(b => [b.name.toLowerCase(), b]));
export function berufsgruppeVon(role: string | null | undefined): Berufsgruppe {
    const r = (role ?? "").trim();
    if (!r)
        return "pflege";
    const genau = NACH_NAME.get(r.toLowerCase());
    if (genau)
        return genau.gruppe;
    if (/ärzt|aerzt|arzt|mediziner/i.test(r))
        return "aerztlich";
    if (/reinig|hauswirt|küche|kueche|hol-? und bring/i.test(r))
        return "hauswirtschaft";
    if (/verwaltung|pforte|empfang|haustechnik|sekretariat/i.test(r))
        return "verwaltung";
    if (/physio|ergo|logopäd|sozialdienst/i.test(r))
        return "therapie";
    if (/\bota\b|\bata\b|\bmtr\b|\bmtl\b|op-pflege|radiolog|labor/i.test(r))
        return "funktion";
    if (/\bmfa\b|\bzfa\b|fachangestellte/i.test(r))
        return "praxisteam";
    return "pflege";
}
export function stationsdienst(role: string | null | undefined): boolean {
    const genau = NACH_NAME.get((role ?? "").trim().toLowerCase());
    if (genau)
        return genau.stationsdienst;
    const g = berufsgruppeVon(role);
    return g === "pflege" || g === "praxisteam";
}
export function istNichtPflegeStation(name: string, nichtPflege?: ReadonlySet<string>): boolean {
    if (nichtPflege?.has(name))
        return true;
    return /ärzt|aerzt|arzt|funktionsdienst|reinigung|hauswirtschaft|küche|pforte|empfang|verwaltung|technik|\bop\b|anästhes|endoskop|radiolog|labor|therapie/i.test(name);
}
export function istArzt(role: string | null | undefined): boolean {
    const r = (role ?? "").trim();
    if (!r || /arzthelfer/i.test(r))
        return false;
    return /ärzt|aerzt|arzt|mediziner/i.test(r);
}
