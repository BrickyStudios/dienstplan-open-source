function pad2(n: number): string {
    return String(n).padStart(2, "0");
}
export function toLocalISODate(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function todayISO(): string {
    return toLocalISODate(new Date());
}
export function berlinTodayISO(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Berlin",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}
export function fromISODate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
export function addDaysISO(iso: string, days: number): string {
    const d = fromISODate(iso);
    d.setDate(d.getDate() + days);
    return toLocalISODate(d);
}
export function isISODate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d)
        return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function daysInclusive(from: string, to: string): number {
    if (!isISODate(from) || !isISODate(to) || to < from)
        return 0;
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const diff = Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!);
    return Math.round(diff / 86400000) + 1;
}
export function monatsBereichISO(jahr: number, monat0: number): {
    from: string;
    to: string;
} {
    const y = jahr + Math.floor(monat0 / 12);
    const m = ((monat0 % 12) + 12) % 12;
    const letzter = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mm = pad2(m + 1);
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${pad2(letzter)}` };
}
export function berlinMonatsBereich(now: Date = new Date(), versatz = 0): {
    from: string;
    to: string;
} {
    const heute = berlinTodayISO(now);
    return monatsBereichISO(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1 + versatz);
}
export function berlinTagISO(tage: number, now: Date = new Date()): string {
    return addDaysISO(berlinTodayISO(now), tage);
}
export function utcTagISO(d: Date | number): string {
    return new Date(d).toISOString().slice(0, 10);
}
export function isoWeekRange(date: string): {
    start: string;
    end: string;
} {
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() || 7;
    const start = addDaysISO(date, 1 - dow);
    return { start, end: addDaysISO(start, 6) };
}
function berlinOffsetMinuten(utcMs: number): number {
    const teile = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Berlin",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(utcMs));
    const w = (typ: string) => Number(teile.find(t => t.type === typ)?.value ?? 0);
    const alsUtc = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute"));
    return Math.round((alsUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}
export function berlinWandzeitZuUtc(iso: string, hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    const naiv = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), h || 0, m || 0);
    return naiv - berlinOffsetMinuten(naiv - berlinOffsetMinuten(naiv) * 60000) * 60000;
}
export function zeitumstellungMinuten(date: string | null | undefined, start: string, end: string): number {
    if (!date || !isISODate(date))
        return 0;
    const monat = +date.slice(5, 7);
    if ((monat !== 3 && monat !== 10) || +date.slice(8, 10) < 24)
        return 0;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const startMin = (sh || 0) * 60 + (sm || 0);
    let endMin = (eh || 0) * 60 + (em || 0);
    const endeTag = endMin <= startMin ? addDaysISO(date, 1) : date;
    if (endMin <= startMin)
        endMin += 24 * 60;
    const echt = (berlinWandzeitZuUtc(endeTag, end) - berlinWandzeitZuUtc(date, start)) / 60000;
    return Math.round(echt - (endMin - startMin));
}
