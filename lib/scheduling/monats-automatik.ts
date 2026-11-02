export const STANDARD_ERINNERUNG_TAGE = 28;
export const STANDARD_PLAN_TAGE = 14;
export const MIN_PLAN_TAGE = 1;
export const MAX_PLAN_TAGE = 120;
export const MIN_ERINNERUNG_TAGE = 2;
export const MAX_ERINNERUNG_TAGE = 180;
export type AutomatikEinstellung = {
    plan_create_days_before?: number | null;
    wish_reminder_days_before?: number | null;
    plan_lead_months?: number | null;
    wish_deadline_days?: number | null;
};
export type Zielmonat = {
    jahr: number;
    monat: number;
    key: string;
    start: string;
    ende: string;
    tageBisBeginn: number;
};
export type Vorlaufzeiten = {
    planTage: number;
    erinnerungTage: number;
    quelle: "tage" | "alt";
};
export type Erinnerung = {
    monat: Zielmonat;
    stufe: "vorlauf" | "letzte";
};
export type AutomatikLauf = Vorlaufzeiten & {
    planKandidaten: Zielmonat[];
    erinnerung: Erinnerung | null;
};
function klemme(wert: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(wert)));
}
function istZahl(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}
export function tageZwischen(von: Date, bis: Date): number {
    const a = Date.UTC(von.getFullYear(), von.getMonth(), von.getDate());
    const b = Date.UTC(bis.getFullYear(), bis.getMonth(), bis.getDate());
    return Math.round((b - a) / 86400000);
}
function zweistellig(n: number): string {
    return String(n).padStart(2, "0");
}
export function monatsbeginnNach(heute: Date, n: number): Zielmonat {
    const d = new Date(heute.getFullYear(), heute.getMonth() + n, 1);
    const jahr = d.getFullYear();
    const monat = d.getMonth() + 1;
    const letzterTag = new Date(jahr, monat, 0).getDate();
    return {
        jahr,
        monat,
        key: `${jahr}-${zweistellig(monat)}`,
        start: `${jahr}-${zweistellig(monat)}-01`,
        ende: `${jahr}-${zweistellig(monat)}-${zweistellig(letzterTag)}`,
        tageBisBeginn: tageZwischen(heute, d),
    };
}
export function loeseVorlaufzeiten(s: AutomatikEinstellung | null | undefined): Vorlaufzeiten {
    const neuPlan = istZahl(s?.plan_create_days_before) ? s!.plan_create_days_before! : null;
    const neuErinnerung = istZahl(s?.wish_reminder_days_before) ? s!.wish_reminder_days_before! : null;
    if (neuPlan !== null || neuErinnerung !== null) {
        const planTage = klemme(neuPlan ?? STANDARD_PLAN_TAGE, MIN_PLAN_TAGE, MAX_PLAN_TAGE);
        const roh = klemme(neuErinnerung ?? STANDARD_ERINNERUNG_TAGE, MIN_ERINNERUNG_TAGE, MAX_ERINNERUNG_TAGE);
        return { planTage, erinnerungTage: Math.max(roh, planTage + 1), quelle: "tage" };
    }
    const leadMonate = istZahl(s?.plan_lead_months) ? klemme(s!.plan_lead_months!, 1, 4) : 2;
    const fristTage = istZahl(s?.wish_deadline_days) ? klemme(s!.wish_deadline_days!, 3, 30) : 14;
    const planTage = klemme(30 * (leadMonate - 1) + fristTage, MIN_PLAN_TAGE, MAX_PLAN_TAGE);
    const erinnerungTage = klemme(planTage + fristTage, MIN_ERINNERUNG_TAGE, MAX_ERINNERUNG_TAGE);
    return { planTage, erinnerungTage: Math.max(erinnerungTage, planTage + 1), quelle: "alt" };
}
export function berechneAutomatikLauf(heute: Date, s: AutomatikEinstellung | null | undefined): AutomatikLauf {
    const zeiten = loeseVorlaufzeiten(s);
    const kommende: Zielmonat[] = [];
    for (let n = 1; n <= 6; n++)
        kommende.push(monatsbeginnNach(heute, n));
    const planKandidaten = kommende.filter(m => m.tageBisBeginn <= zeiten.planTage);
    const offen = kommende.find(m => m.tageBisBeginn > zeiten.planTage) ?? null;
    let erinnerung: Erinnerung | null = null;
    if (offen) {
        if (offen.tageBisBeginn === zeiten.planTage + 1 && zeiten.erinnerungTage > zeiten.planTage + 1) {
            erinnerung = { monat: offen, stufe: "letzte" };
        }
        else if (offen.tageBisBeginn <= zeiten.erinnerungTage) {
            erinnerung = { monat: offen, stufe: "vorlauf" };
        }
    }
    return { ...zeiten, planKandidaten, erinnerung };
}
