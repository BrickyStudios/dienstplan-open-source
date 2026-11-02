import { easter } from "@/lib/holidays";
import { utcTagISO } from "@/lib/date";
export type SpecialDayKind = "fixed" | "computed" | "regional" | "learned";
export type SpecialDayStatus = "active" | "pending";
export type SpecialDaySource = "seed" | "leitung" | "learned";
export type SpecialDay = {
    id: string;
    name: string;
    kind: SpecialDayKind;
    month?: number;
    day?: number;
    easterOffsetDays?: number;
    bundeslaender?: string[];
    dateRangeDays?: number;
    date?: string;
    demandMultiplier: number;
    status: SpecialDayStatus;
    source: SpecialDaySource;
};
export const GERMAN_STATES: readonly string[] = [
    "Baden-Württemberg",
    "Bayern",
    "Berlin",
    "Brandenburg",
    "Bremen",
    "Hamburg",
    "Hessen",
    "Mecklenburg-Vorpommern",
    "Niedersachsen",
    "Nordrhein-Westfalen",
    "Rheinland-Pfalz",
    "Saarland",
    "Sachsen",
    "Sachsen-Anhalt",
    "Schleswig-Holstein",
    "Thüringen",
] as const;
export function isGermanState(value: unknown): value is string {
    return typeof value === "string" && GERMAN_STATES.includes(value);
}
function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}
function toISO(d: Date): string {
    return utcTagISO(d);
}
function parseISO(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
}
export function resolveOccurrence(sd: SpecialDay, year: number): {
    start: Date;
    end: Date;
} | null {
    let base: Date | null = null;
    if (typeof sd.month === "number" && typeof sd.day === "number") {
        base = new Date(Date.UTC(year, sd.month - 1, sd.day));
    }
    else if (typeof sd.easterOffsetDays === "number") {
        const e = easter(year);
        const eUtc = new Date(Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()));
        base = addDays(eUtc, sd.easterOffsetDays);
    }
    else if (sd.date) {
        base = parseISO(sd.date);
    }
    if (!base)
        return null;
    const rangeDays = sd.dateRangeDays && sd.dateRangeDays > 0 ? Math.floor(sd.dateRangeDays) : 1;
    const end = addDays(base, rangeDays - 1);
    return { start: base, end };
}
export function isSpecialDayActiveOn(sd: SpecialDay, dateStr: string): boolean {
    const d = parseISO(dateStr);
    const year = d.getUTCFullYear();
    for (const y of [year - 1, year, year + 1]) {
        const occ = resolveOccurrence(sd, y);
        if (occ && d >= occ.start && d <= occ.end)
            return true;
    }
    return false;
}
function matchesBundesland(sd: SpecialDay, bundesland: string | null | undefined): boolean {
    if (!sd.bundeslaender || sd.bundeslaender.length === 0)
        return true;
    if (!bundesland)
        return false;
    return sd.bundeslaender.includes(bundesland);
}
export function matchSpecialDays(dateStr: string, specialDays: SpecialDay[] | null | undefined, bundesland: string | null | undefined): SpecialDay[] {
    if (!specialDays || specialDays.length === 0)
        return [];
    return specialDays.filter(sd => sd.status === "active" &&
        matchesBundesland(sd, bundesland) &&
        isSpecialDayActiveOn(sd, dateStr));
}
export function specialDayMultiplier(dateStr: string, specialDays: SpecialDay[] | null | undefined, bundesland: string | null | undefined): number {
    const matches = matchSpecialDays(dateStr, specialDays, bundesland);
    if (matches.length === 0)
        return 1;
    return matches.reduce((max, sd) => Math.max(max, sd.demandMultiplier > 0 ? sd.demandMultiplier : 1), 1);
}
function slugId(name: string): string {
    return name
        .toLowerCase()
        .replace(/[äöüß]/g, c => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c))
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
export const SEED_SPECIAL_DAYS: SpecialDay[] = [
    {
        id: "seed-silvester",
        name: "Silvester",
        kind: "fixed",
        month: 12,
        day: 31,
        demandMultiplier: 1.4,
        status: "active",
        source: "seed",
    },
    {
        id: "seed-karneval-rosenmontag",
        name: "Karneval (Rosenmontag)",
        kind: "computed",
        easterOffsetDays: -48,
        dateRangeDays: 1,
        demandMultiplier: 1.3,
        status: "active",
        source: "seed",
    },
    {
        id: "seed-oktoberfest",
        name: "Oktoberfest",
        kind: "regional",
        bundeslaender: ["Bayern"],
        month: 9,
        day: 20,
        dateRangeDays: 16,
        demandMultiplier: 1.3,
        status: "active",
        source: "seed",
    },
];
const MAX_SPECIAL_DAYS = 100;
const MIN_MULTIPLIER = 1.0;
const MAX_MULTIPLIER = 3.0;
const MIN_RANGE_DAYS = 1;
const MAX_RANGE_DAYS = 90;
export function sanitizeSpecialDays(raw: unknown): SpecialDay[] {
    if (!Array.isArray(raw))
        return [];
    const out: SpecialDay[] = [];
    for (const entry of raw.slice(0, MAX_SPECIAL_DAYS)) {
        if (!entry || typeof entry !== "object")
            continue;
        const e = entry as Record<string, unknown>;
        if (typeof e.id !== "string" || !e.id)
            continue;
        if (typeof e.name !== "string" || !e.name)
            continue;
        if (e.kind !== "fixed" && e.kind !== "computed" && e.kind !== "regional" && e.kind !== "learned")
            continue;
        if (e.status !== "active" && e.status !== "pending")
            continue;
        if (e.source !== "seed" && e.source !== "leitung" && e.source !== "learned")
            continue;
        const multiplier = Number(e.demandMultiplier);
        if (!Number.isFinite(multiplier))
            continue;
        const clean: SpecialDay = {
            id: e.id, name: e.name.slice(0, 100), kind: e.kind, status: e.status, source: e.source,
            demandMultiplier: Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, multiplier)),
        };
        if (typeof e.month === "number" && e.month >= 1 && e.month <= 12)
            clean.month = Math.trunc(e.month);
        if (typeof e.day === "number" && e.day >= 1 && e.day <= 31)
            clean.day = Math.trunc(e.day);
        if (typeof e.easterOffsetDays === "number" && Number.isFinite(e.easterOffsetDays)) {
            clean.easterOffsetDays = Math.trunc(Math.min(200, Math.max(-200, e.easterOffsetDays)));
        }
        if (Array.isArray(e.bundeslaender)) {
            const states = e.bundeslaender.filter((s): s is string => isGermanState(s));
            if (states.length)
                clean.bundeslaender = states;
        }
        if (typeof e.dateRangeDays === "number" && Number.isFinite(e.dateRangeDays)) {
            clean.dateRangeDays = Math.min(MAX_RANGE_DAYS, Math.max(MIN_RANGE_DAYS, Math.trunc(e.dateRangeDays)));
        }
        if (typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
            clean.date = e.date;
        out.push(clean);
    }
    return out;
}
export function makeSpecialDayId(name: string, existing: SpecialDay[]): string {
    const base = slugId(name) || "sondertag";
    let candidate = base;
    let n = 2;
    const ids = new Set(existing.map(e => e.id));
    while (ids.has(candidate)) {
        candidate = `${base}-${n}`;
        n++;
    }
    return candidate;
}
