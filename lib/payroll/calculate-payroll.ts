import { minijobGrenze } from "@/lib/legal-limits";
export type JobType = "Vollzeit" | "Teilzeit" | "Minijob" | "Werkstudent" | "Aushilfe" | "Geringfügig";
export interface PayrollInput {
    staffName: string;
    jobType: JobType;
    taxClass: 1 | 2 | 3 | 4 | 5 | 6;
    churchTax: boolean;
    childrenCount: number;
    hoursWorked: number;
    hourlyRate: number | null;
    monthlySalary: number | null;
    additionalGross?: number;
    year?: number;
}
export interface PayrollResult {
    staffName: string;
    jobType: JobType;
    taxClass: number;
    hoursWorked: number;
    hourlyRate: number | null;
    grossPay: number;
    kvEmployee: number;
    pvEmployee: number;
    rvEmployee: number;
    avEmployee: number;
    totalSvEmployee: number;
    lohnsteuer: number;
    kirchensteuer: number;
    soli: number;
    netPay: number;
    kvEmployer: number;
    pvEmployer: number;
    rvEmployer: number;
    avEmployer: number;
    totalEmployerCost: number;
    isMinijob: boolean;
    minijobCapExceeded: boolean;
}
const ARBEITNEHMER_PAUSCHBETRAG = 1230;
const SONDERAUSGABEN_PAUSCHBETRAG = 36;
const ENTLASTUNGSBETRAG_ALLEINERZIEHENDE = 4260;
type SvJahr = {
    kv: number;
    kvZusatz: number;
    pv: number;
    pvKinderlos: number;
    rv: number;
    av: number;
    bbgKvPv: number;
    bbgRvAv: number;
};
const SV: Record<number, SvJahr> = {
    2025: { kv: 0.146, kvZusatz: 0.025, pv: 0.036, pvKinderlos: 0.006, rv: 0.186, av: 0.026, bbgKvPv: 5512.5, bbgRvAv: 8050 },
    2026: { kv: 0.146, kvZusatz: 0.029, pv: 0.036, pvKinderlos: 0.006, rv: 0.186, av: 0.026, bbgKvPv: 5812.5, bbgRvAv: 8450 },
};
const SV_JAHRE = Object.keys(SV).map(Number).sort((a, b) => a - b);
export function svFuer(jahr: number): SvJahr {
    if (SV[jahr])
        return SV[jahr];
    const juengstes = SV_JAHRE[SV_JAHRE.length - 1];
    return jahr > juengstes ? SV[juengstes] : SV[SV_JAHRE[0]];
}
const SOLI_FREIGRENZE = 18130;
type Tarif = {
    grundfreibetrag: number;
    zone2End: number;
    zone2Faktor: number;
    zone3End: number;
    zone3Faktor: number;
    zone3Offset: number;
    zone4End: number;
    zone4Abzug: number;
    zone5Abzug: number;
};
const TARIFE: Record<number, Tarif> = {
    2025: {
        grundfreibetrag: 12096,
        zone2End: 17443, zone2Faktor: 932.30,
        zone3End: 68480, zone3Faktor: 176.64, zone3Offset: 1015.13,
        zone4End: 277825, zone4Abzug: 10911.92,
        zone5Abzug: 19246.67,
    },
    2026: {
        grundfreibetrag: 12348,
        zone2End: 17799, zone2Faktor: 914.51,
        zone3End: 69878, zone3Faktor: 173.10, zone3Offset: 1034.87,
        zone4End: 277825, zone4Abzug: 11135.63,
        zone5Abzug: 19470.38,
    },
};
const TARIF_JAHRE = Object.keys(TARIFE).map(Number).sort((a, b) => a - b);
export function tarifFuer(jahr: number): Tarif {
    if (TARIFE[jahr])
        return TARIFE[jahr];
    const juengstes = TARIF_JAHRE[TARIF_JAHRE.length - 1];
    return jahr > juengstes ? TARIFE[juengstes] : TARIFE[TARIF_JAHRE[0]];
}
function lohnsteuerJahrlich(zvE: number, jahr: number): number {
    const t = tarifFuer(jahr);
    const x = Math.floor(zvE);
    if (x <= t.grundfreibetrag)
        return 0;
    if (x <= t.zone2End) {
        const y = (x - t.grundfreibetrag) / 10000;
        return Math.floor((t.zone2Faktor * y + 1400) * y);
    }
    if (x <= t.zone3End) {
        const z = (x - t.zone2End) / 10000;
        return Math.floor((t.zone3Faktor * z + 2397) * z + t.zone3Offset);
    }
    if (x <= t.zone4End)
        return Math.floor(0.42 * x - t.zone4Abzug);
    return Math.floor(0.45 * x - t.zone5Abzug);
}
export function calculatePayroll(input: PayrollInput): PayrollResult {
    const jahr = Number(input.year) || new Date().getFullYear();
    const sv = svFuer(jahr);
    const kvAn = (sv.kv + sv.kvZusatz) / 2;
    const pvAn = sv.pv / 2;
    const rvAn = sv.rv / 2;
    const avAn = sv.av / 2;
    const isMinijob = input.jobType === "Minijob" || input.jobType === "Geringfügig";
    const isWerkstudent = input.jobType === "Werkstudent";
    let grossPay: number;
    if (input.monthlySalary != null && input.hoursWorked === 0) {
        grossPay = input.monthlySalary;
    }
    else if (input.hourlyRate != null) {
        grossPay = round2(input.hoursWorked * input.hourlyRate);
    }
    else {
        grossPay = 0;
    }
    const extra = Number(input.additionalGross) || 0;
    if (extra > 0)
        grossPay = round2(grossPay + extra);
    const minijobCapExceeded = isMinijob && grossPay > minijobGrenze(jahr);
    if (isMinijob && !minijobCapExceeded) {
        const kvEmployer = round2(grossPay * 0.13);
        const rvEmployer = round2(grossPay * 0.15);
        const avEmployer = round2(grossPay * 0.02);
        return {
            staffName: input.staffName,
            jobType: input.jobType,
            taxClass: input.taxClass,
            hoursWorked: input.hoursWorked,
            hourlyRate: input.hourlyRate,
            grossPay,
            kvEmployee: 0, pvEmployee: 0, rvEmployee: 0, avEmployee: 0,
            totalSvEmployee: 0,
            lohnsteuer: 0, kirchensteuer: 0, soli: 0,
            netPay: grossPay,
            kvEmployer, pvEmployer: 0, rvEmployer, avEmployer,
            totalEmployerCost: round2(grossPay + kvEmployer + rvEmployer + avEmployer),
            isMinijob: true,
            minijobCapExceeded: false,
        };
    }
    const kvBasis = Math.min(grossPay, sv.bbgKvPv);
    const rvBasis = Math.min(grossPay, sv.bbgRvAv);
    const pvSurcharge = (input.childrenCount === 0 && !isWerkstudent) ? sv.pvKinderlos : 0;
    const pvEmployeeRate = pvAn + pvSurcharge;
    const kvEmployee = isWerkstudent ? 0 : round2(kvBasis * kvAn);
    const pvEmployee = isWerkstudent ? 0 : round2(kvBasis * pvEmployeeRate);
    const rvEmployee = round2(rvBasis * rvAn);
    const avEmployee = isWerkstudent ? 0 : round2(rvBasis * avAn);
    const totalSvEmployee = kvEmployee + pvEmployee + rvEmployee + avEmployee;
    const kvEmployer = isWerkstudent ? 0 : round2(kvBasis * kvAn);
    const pvEmployer = isWerkstudent ? 0 : round2(kvBasis * pvAn);
    const rvEmployer = round2(rvBasis * rvAn);
    const avEmployer = isWerkstudent ? 0 : round2(rvBasis * avAn);
    const tarif = tarifFuer(jahr);
    const annualGross = grossPay * 12;
    let zvE = annualGross - ARBEITNEHMER_PAUSCHBETRAG - SONDERAUSGABEN_PAUSCHBETRAG;
    switch (input.taxClass) {
        case 1:
        case 4:
            break;
        case 2:
            zvE -= ENTLASTUNGSBETRAG_ALLEINERZIEHENDE;
            break;
        case 3:
            zvE -= tarif.grundfreibetrag;
            break;
        case 5:
        case 6:
            zvE += tarif.grundfreibetrag;
            if (input.taxClass === 6)
                zvE = annualGross + tarif.grundfreibetrag;
            break;
    }
    const annualLst = lohnsteuerJahrlich(Math.max(0, zvE), jahr);
    const monthlyLst = round2(annualLst / 12);
    const soli = annualLst > SOLI_FREIGRENZE ? round2(monthlyLst * 0.055) : 0;
    const kirchensteuer = input.churchTax ? round2(monthlyLst * 0.09) : 0;
    const lohnsteuer = monthlyLst;
    const netPay = round2(grossPay - totalSvEmployee - lohnsteuer - soli - kirchensteuer);
    return {
        staffName: input.staffName,
        jobType: input.jobType,
        taxClass: input.taxClass,
        hoursWorked: input.hoursWorked,
        hourlyRate: input.hourlyRate,
        grossPay,
        kvEmployee, pvEmployee, rvEmployee, avEmployee,
        totalSvEmployee,
        lohnsteuer, kirchensteuer, soli,
        netPay: Math.max(0, netPay),
        kvEmployer, pvEmployer, rvEmployer, avEmployer,
        totalEmployerCost: round2(grossPay + kvEmployer + pvEmployer + rvEmployer + avEmployer),
        isMinijob,
        minijobCapExceeded,
    };
}
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
export function formatEur(n: number): string {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
export const MONTH_NAMES_DE = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
];
