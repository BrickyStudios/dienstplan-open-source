export type Plan = "klinik" | "pflege" | "praxis";
export type ComplianceFramework = "ppbv" | "pebem" | "none";
export type ComplianceInfo = {
    framework: ComplianceFramework;
    enabled: boolean;
    shortLabel: string;
    longLabel: string;
    legalBasis: string;
    note: string;
};
const COMPLIANCE: Record<Plan, ComplianceInfo> = {
    klinik: {
        framework: "ppbv",
        enabled: true,
        shortLabel: "PPBV-Nachweis",
        longLabel: "PPBV-Nachweis — Pflegepersonalbemessung",
        legalBasis: "Pflegepersonalbemessungsverordnung (PPBV)",
        note: "Nurvo stellt die geplante gegen die tatsächliche Besetzung je Station und Schicht und " +
            "rechnet den Tagschicht-Soll nach § 4 Abs. 2 PPBV aus der Stufenverteilung, die das Haus " +
            "übergibt. Eingestuft wird in der Pflegedokumentation, gemeldet wird an das InEK durch das " +
            "Haus. Die Bewertung der Erfüllung bleibt bei der Einrichtung.",
    },
    pflege: {
        framework: "pebem",
        enabled: true,
        shortLabel: "Personalbemessung",
        longLabel: "Personalbemessungs-Nachweis — § 113c SGB XI (PeBeM)",
        legalBasis: "Personalbemessung nach § 113c SGB XI (PeBeM) sowie Personalmindestbestand und " +
            "Fachkraftquote nach Landesrecht (z. B. WTG NRW)",
        note: "Für vollstationäre Pflegeeinrichtungen gilt seit Juli 2023 das Personalbemessungs" +
            "verfahren nach § 113c SGB XI. Eine Nachweispflicht folgt daraus nicht — verbindlich " +
            "sind Personalmindestbestand und Fachkraftquote nach Landesrecht. Nurvo berechnet die " +
            "Soll-/Ist-Besetzung je Wohnbereich und Schicht und erzeugt daraus den Nachweis als PDF.",
    },
    praxis: {
        framework: "none",
        enabled: false,
        shortLabel: "Personalbemessung",
        longLabel: "Personalbemessung",
        legalBasis: "—",
        note: "Für Arztpraxen gilt keine Personalbemessungs-Verordnung.",
    },
};
export type BillingModel = "per_station" | "per_seat";
export type PlanCapabilities = {
    plan: Plan;
    ppbv: boolean;
    multiStation: boolean;
    bereiche: boolean;
    billingModel: BillingModel;
    unitLabel: string;
    unitLabelPlural: string;
    facilityLabel: string;
    compliance: ComplianceInfo;
};
const CAPABILITIES: Record<Plan, PlanCapabilities> = {
    klinik: {
        plan: "klinik",
        ppbv: true,
        multiStation: true,
        bereiche: true,
        billingModel: "per_station",
        unitLabel: "Station",
        unitLabelPlural: "Stationen",
        facilityLabel: "Krankenhaus",
        compliance: COMPLIANCE.klinik,
    },
    pflege: {
        plan: "pflege",
        ppbv: true,
        multiStation: true,
        bereiche: true,
        billingModel: "per_station",
        unitLabel: "Wohnbereich",
        unitLabelPlural: "Wohnbereiche",
        facilityLabel: "Pflegeeinrichtung",
        compliance: COMPLIANCE.pflege,
    },
    praxis: {
        plan: "praxis",
        ppbv: false,
        multiStation: false,
        bereiche: true,
        billingModel: "per_seat",
        unitLabel: "Praxis",
        unitLabelPlural: "Praxen",
        facilityLabel: "Arztpraxis",
        compliance: COMPLIANCE.praxis,
    },
};
export function normalizePlan(raw: unknown): Plan {
    if (raw === "praxis")
        return "praxis";
    if (raw === "pflege")
        return "pflege";
    return "klinik";
}
export function getPlanCapabilities(plan: Plan): PlanCapabilities {
    return CAPABILITIES[plan];
}
export function resolveCapabilities(raw: unknown): PlanCapabilities {
    return getPlanCapabilities(normalizePlan(raw));
}
export function resolveCompliance(raw: unknown): ComplianceInfo {
    return COMPLIANCE[normalizePlan(raw)];
}
export const ALL_PLANS: readonly Plan[] = ["klinik", "pflege", "praxis"] as const;
export const AKTIVE_PLAENE: readonly Plan[] = ["praxis"] as const;
export const SELECTABLE_PLANS: readonly Plan[] = AKTIVE_PLAENE;
export function istAktiverPlan(plan: Plan): boolean {
    return AKTIVE_PLAENE.includes(plan);
}
export function planFuerNeueEinrichtung(): Plan {
    return AKTIVE_PLAENE[0];
}
export function planFuerNeuanlage(raw: unknown): Plan {
    if (raw === null || raw === undefined || raw === "")
        return planFuerNeueEinrichtung();
    const p = normalizePlan(raw);
    return istAktiverPlan(p) ? p : planFuerNeueEinrichtung();
}
export function planAusZeile(row: {
    plan?: unknown;
} | null | undefined): Plan {
    if (!row)
        return planFuerNeueEinrichtung();
    return normalizePlan(row.plan);
}
export const DEFAULT_SHIFT_DEMAND: Readonly<Record<string, number>> = { frueh: 2, spaet: 2, nacht: 1 };
export function defaultDemandFor(shiftType: string): number {
    return DEFAULT_SHIFT_DEMAND[shiftType] ?? 1;
}
