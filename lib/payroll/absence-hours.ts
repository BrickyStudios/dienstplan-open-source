import { utcTagISO } from "@/lib/date";
export type AbsenceRange = {
    from_date: string;
    to_date: string;
};
export function daysInMonth(range: AbsenceRange, monthStart: string, monthEnd: string): number {
    const from = range.from_date > monthStart ? range.from_date : monthStart;
    const to = range.to_date < monthEnd ? range.to_date : monthEnd;
    if (!from || !to || to < from)
        return 0;
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    if (!fy || !fm || !fd || !ty || !tm || !td)
        return 0;
    const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
    return Math.round(diff / 86400000) + 1;
}
export function sumAbsenceDays(ranges: AbsenceRange[], monthStart: string, monthEnd: string): number {
    return ranges.reduce((sum, r) => sum + daysInMonth(r, monthStart, monthEnd), 0);
}
export function absenceDatesInMonth(ranges: AbsenceRange[], monthStart: string, monthEnd: string): Set<string> {
    const dates = new Set<string>();
    for (const range of ranges) {
        const from = range.from_date > monthStart ? range.from_date : monthStart;
        const to = range.to_date < monthEnd ? range.to_date : monthEnd;
        if (!from || !to || to < from)
            continue;
        const [fy, fm, fd] = from.split("-").map(Number);
        const [ty, tm, td] = to.split("-").map(Number);
        if (!fy || !fm || !fd || !ty || !tm || !td)
            continue;
        for (let t = Date.UTC(fy, fm - 1, fd); t <= Date.UTC(ty, tm - 1, td); t += 86400000) {
            dates.add(utcTagISO(t));
        }
    }
    return dates;
}
export function splitOvertime(hoursWorked: number, contractMonthlyHours: number, compensation: string): {
    paidHours: number;
    bankedHours: number;
} {
    const worked = Number(hoursWorked) || 0;
    const contract = Number(contractMonthlyHours) || 0;
    if (contract <= 0 || compensation === "payout")
        return { paidHours: worked, bankedHours: 0 };
    const overtime = Math.max(0, worked - contract);
    if (overtime <= 0)
        return { paidHours: worked, bankedHours: 0 };
    return { paidHours: worked - overtime, bankedHours: overtime };
}
export function payableAbsenceDays(absenceDates: Iterable<string>, workedDates: ReadonlySet<string>): number {
    let days = 0;
    for (const d of absenceDates)
        if (!workedDates.has(d))
            days++;
    return days;
}
