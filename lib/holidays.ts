export function easter(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}
function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}
function toISO(d: Date): string {
    const monat = String(d.getMonth() + 1).padStart(2, "0");
    const tag = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${monat}-${tag}`;
}
export function getGermanHolidays(year: number): Set<string> {
    const e = easter(year);
    const dates = new Set<string>([
        `${year}-01-01`,
        `${year}-05-01`,
        `${year}-10-03`,
        `${year}-12-25`,
        `${year}-12-26`,
        toISO(addDays(e, -2)),
        toISO(e),
        toISO(addDays(e, 1)),
        toISO(addDays(e, 39)),
        toISO(addDays(e, 49)),
        toISO(addDays(e, 50)),
        toISO(addDays(e, 60)),
    ]);
    return dates;
}
export function isGermanHoliday(dateStr: string): boolean {
    const year = parseInt(dateStr.slice(0, 4), 10);
    return getGermanHolidays(year).has(dateStr);
}
