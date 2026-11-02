import { utcTagISO } from "@/lib/date";
export function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return function rng(): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function pick<T>(rng: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rng() * arr.length)];
}
export function chance(rng: () => number, p: number): boolean {
    return rng() < p;
}
export function randint(rng: () => number, lo: number, hi: number): number {
    return lo + Math.floor(rng() * (hi - lo + 1));
}
export function monthBounds(monthKey: string): {
    start: string;
    end: string;
    year: number;
    month: number;
} {
    const [yStr, mStr] = monthKey.split("-");
    const year = Number(yStr), month = Number(mStr);
    const start = `${monthKey}-01`;
    const end = utcTagISO(Date.UTC(year, month, 0));
    return { start, end, year, month };
}
export function nextMonthKey(monthKey: string): string {
    const { year, month } = monthBounds(monthKey);
    const d = new Date(year, month, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function eachDateInRange(startIso: string, endIso: string): string[] {
    const out: string[] = [];
    const d = new Date(startIso + "T00:00:00Z");
    const end = new Date(endIso + "T00:00:00Z");
    while (d <= end) {
        out.push(utcTagISO(d));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
}
export { addDaysISO as addDaysIso } from "@/lib/date";
const FALLBACK_TIME: Record<string, {
    start: string;
    end: string;
}> = {
    frueh: { start: "06:00", end: "14:00" },
    spaet: { start: "14:00", end: "22:00" },
    nacht: { start: "22:00", end: "06:00" },
};
function shiftBoundary(date: string, time: string, isEnd: boolean, startTime: string): Date {
    const d = new Date(`${date}T${time}:00`);
    if (isEnd && time <= startTime)
        d.setDate(d.getDate() + 1);
    return d;
}
export type SimulatedAttendance = {
    checkIn: string;
    checkOut: string;
    totalPauseMinutes: number;
    durationMinutes: number;
    requiredBreakMinutes: number;
    breakCompliant: boolean;
};
export function simulateAttendance(rng: () => number, date: string, shiftType: string, startTimeRaw: string | null, endTimeRaw: string | null): SimulatedAttendance {
    const fb = FALLBACK_TIME[shiftType] ?? FALLBACK_TIME.frueh;
    const startTime = (startTimeRaw ?? fb.start).slice(0, 5);
    const endTime = (endTimeRaw ?? fb.end).slice(0, 5);
    const planStart = shiftBoundary(date, startTime, false, startTime);
    const planEnd = shiftBoundary(date, endTime, true, startTime);
    const jitter = () => {
        const base = randint(rng, -5, 5);
        if (chance(rng, 0.15))
            return base + (chance(rng, 0.5) ? randint(rng, 6, 20) : -randint(rng, 6, 20));
        return base;
    };
    const checkIn = new Date(planStart.getTime() + jitter() * 60000);
    const checkOut = new Date(planEnd.getTime() + jitter() * 60000);
    if (checkOut.getTime() <= checkIn.getTime())
        checkOut.setTime(checkIn.getTime() + 4 * 3600000);
    const grossMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
    const requiredBreakMinutes = grossMinutes > 9 * 60 ? 45 : grossMinutes > 6 * 60 ? 30 : 0;
    const totalPauseMinutes = requiredBreakMinutes === 0
        ? 0
        : chance(rng, 0.1)
            ? Math.max(0, requiredBreakMinutes - randint(rng, 5, 15))
            : requiredBreakMinutes + randint(rng, 0, 5);
    const breakCompliant = totalPauseMinutes >= requiredBreakMinutes;
    const durationMinutes = Math.max(0, grossMinutes - totalPauseMinutes);
    return {
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        totalPauseMinutes,
        durationMinutes,
        requiredBreakMinutes,
        breakCompliant,
    };
}
