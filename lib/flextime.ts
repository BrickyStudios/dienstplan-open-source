import { addDaysISO, daysInclusive, fromISODate, toLocalISODate } from "@/lib/date";
export type FlextimeLimits = {
    maxDaysPerWeek?: number | null;
    maxDaysPerMonth?: number | null;
};
export type ExistingRequest = {
    from_date: string;
    to_date: string;
    days?: number | null;
};
export type FlextimeCheck = {
    ok: true;
    hours: number;
} | {
    ok: false;
    error: string;
};
export function isoWeekStart(iso: string): string {
    const d = fromISODate(iso);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dow - 1)));
}
export function monthStart(iso: string): string {
    return iso.slice(0, 7) + "-01";
}
export function daysWithin(requests: ExistingRequest[], from: string, to: string): number {
    let total = 0;
    for (const r of requests) {
        const start = r.from_date > from ? r.from_date : from;
        const end = r.to_date < to ? r.to_date : to;
        if (end < start)
            continue;
        total += daysInclusive(start, end);
    }
    return total;
}
export function checkFlextimeRequest(opts: {
    fromDate: string;
    toDate: string;
    hoursPerDay: number;
    balanceHours: number;
    limits: FlextimeLimits;
    existing: ExistingRequest[];
}): FlextimeCheck {
    const { fromDate, toDate, hoursPerDay, balanceHours, limits, existing } = opts;
    const days = daysInclusive(fromDate, toDate);
    if (days <= 0)
        return { ok: false, error: "Ungültiger Zeitraum" };
    const perDay = Number(hoursPerDay) > 0 ? Number(hoursPerDay) : 8;
    const hours = Math.round(days * perDay * 100) / 100;
    const balance = Number(balanceHours) || 0;
    if (hours > balance) {
        return {
            ok: false,
            error: `Nicht genug Gleitzeitguthaben: ${fmtHours(balance)} vorhanden, ${fmtHours(hours)} nötig (${days} Tag${days === 1 ? "" : "e"} × ${fmtHours(perDay)})`,
        };
    }
    const weekMax = limits.maxDaysPerWeek;
    if (weekMax != null && weekMax >= 0) {
        for (const weekStart of weeksTouched(fromDate, toDate)) {
            const weekEnd = addDaysISO(weekStart, 6);
            const already = daysWithin(existing, weekStart, weekEnd);
            const requested = daysWithin([{ from_date: fromDate, to_date: toDate }], weekStart, weekEnd);
            if (already + requested > weekMax) {
                return {
                    ok: false,
                    error: `Höchstens ${weekMax} Gleitzeittag${weekMax === 1 ? "" : "e"} pro Woche — in der Woche ab ${fmtDate(weekStart)} wären es ${already + requested}`,
                };
            }
        }
    }
    const monthMax = limits.maxDaysPerMonth;
    if (monthMax != null && monthMax >= 0) {
        for (const mStart of monthsTouched(fromDate, toDate)) {
            const mEnd = monthEnd(mStart);
            const already = daysWithin(existing, mStart, mEnd);
            const requested = daysWithin([{ from_date: fromDate, to_date: toDate }], mStart, mEnd);
            if (already + requested > monthMax) {
                return {
                    ok: false,
                    error: `Höchstens ${monthMax} Gleitzeittag${monthMax === 1 ? "" : "e"} pro Monat — im ${fmtMonth(mStart)} wären es ${already + requested}`,
                };
            }
        }
    }
    return { ok: true, hours };
}
export function weeksTouched(from: string, to: string): string[] {
    const out: string[] = [];
    let w = isoWeekStart(from);
    const last = isoWeekStart(to);
    while (w <= last) {
        out.push(w);
        w = addDaysISO(w, 7);
    }
    return out;
}
export function monthsTouched(from: string, to: string): string[] {
    const out: string[] = [];
    let m = monthStart(from);
    const last = monthStart(to);
    while (m <= last) {
        out.push(m);
        const [y, mo] = m.split("-").map(Number);
        m = mo === 12 ? `${y! + 1}-01-01` : `${y}-${String(mo! + 1).padStart(2, "0")}-01`;
    }
    return out;
}
export function monthEnd(mStart: string): string {
    const [y, m] = mStart.split("-").map(Number);
    const last = new Date(y!, m!, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function fmtHours(h: number): string {
    const r = Math.round(h * 100) / 100;
    return `${r.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
}
function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
}
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
function fmtMonth(mStart: string): string {
    const [y, m] = mStart.split("-").map(Number);
    return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}
