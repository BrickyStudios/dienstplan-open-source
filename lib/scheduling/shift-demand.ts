import { defaultDemandFor } from "@/lib/plan";
import { specialDayMultiplier, type SpecialDay } from "@/lib/scheduling/special-days";
export type Demand = Record<string, Record<string, number>>;
export type ShiftTimeOverride = {
    start?: string;
    end?: string;
};
export type ShiftTimeOverrides = Record<string, Record<string, ShiftTimeOverride>>;
export function deriveShiftType(startTime: string | null | undefined, endTime?: string | null): string {
    if (!startTime)
        return "frueh";
    const h = parseInt(startTime.split(":")[0] ?? "0", 10);
    if (endTime && h >= 18 && endTime <= startTime)
        return "nacht";
    if (h >= 5 && h < 14)
        return "frueh";
    if (h >= 14 && h < 21)
        return "spaet";
    return "nacht";
}
export function plannedForStation(shiftDemand: Demand | null | undefined, name: string, shiftType: string): number {
    const n = shiftDemand?.[name]?.[shiftType];
    return typeof n === "number" && n >= 0 ? n : defaultDemandFor(shiftType);
}
export function plannedForBereich(shiftDemand: Demand | null | undefined, name: string, shiftType: string): number {
    const n = shiftDemand?.[name]?.[shiftType];
    return typeof n === "number" && n >= 0 ? n : 1;
}
export function overrideFor(overrides: ShiftTimeOverrides | null | undefined, name: string, shiftType: string): ShiftTimeOverride | null {
    return overrides?.[name]?.[shiftType] ?? null;
}
export function applySpecialDayDemand(baseStaff: number, dateStr: string, specialDays: SpecialDay[] | null | undefined, bundesland: string | null | undefined): number {
    if (!(baseStaff > 0))
        return baseStaff;
    const mult = specialDayMultiplier(dateStr, specialDays, bundesland);
    if (mult <= 1)
        return baseStaff;
    return Math.ceil(baseStaff * mult);
}
